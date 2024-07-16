import fs from 'fs'
import glob from 'globby'
import path from 'path'
import resolveFrom from 'resolve-from'
import strip from 'strip-json-comments'
import type { Entry, Format } from './options'

export type MaybePromise<T> = T | Promise<T>

export type External =
  | string
  | RegExp
  | ((id: string, parentId?: string) => boolean)

export function isExternal(
  externals: External | External[],
  id: string,
  parentId?: string,
) {
  id = slash(id)

  if (!Array.isArray(externals)) {
    externals = [externals]
  }

  for (const external of externals) {
    if (
      typeof external === 'string' &&
      (id === external || id.includes(`/node_modules/${external}/`))
    ) {
      return true
    }
    if (external instanceof RegExp) {
      if (external.test(id)) {
        return true
      }
    }
    if (typeof external === 'function') {
      if (external(id, parentId)) {
        return true
      }
    }
  }

  return false
}

export function getPostcss(): null | Awaited<typeof import('postcss')> {
  return localRequire('postcss')
}

export function getApiExtractor(): null | Awaited<
  typeof import('@microsoft/api-extractor')
> {
  return localRequire('@microsoft/api-extractor')
}

export function localRequire(moduleName: string) {
  const p = resolveFrom.silent(process.cwd(), moduleName)
  return p && require(p)
}

export function pathExists(p: string) {
  return new Promise((resolve) => {
    fs.access(p, (err) => {
      resolve(!err)
    })
  })
}

export async function removeFiles(patterns: string[], dir: string) {
  const files = await glob(patterns, {
    cwd: dir,
    absolute: true,
  })
  files.forEach((file) => fs.existsSync(file) && fs.unlinkSync(file))
}

export function debouncePromise<T extends unknown[]>(
  fn: (...args: T) => Promise<void>,
  delay: number,
  onError: (err: unknown) => void,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined

  let promiseInFly: Promise<void> | undefined

  let callbackPending: (() => void) | undefined

  return function debounced(...args: Parameters<typeof fn>) {
    if (promiseInFly) {
      callbackPending = () => {
        debounced(...args)
        callbackPending = undefined
      }
    } else {
      if (timeout != null) clearTimeout(timeout)

      timeout = setTimeout(() => {
        timeout = undefined
        promiseInFly = fn(...args)
          .catch(onError)
          .finally(() => {
            promiseInFly = undefined
            if (callbackPending) callbackPending()
          })
      }, delay)
    }
  }
}

// Taken from https://github.com/sindresorhus/slash/blob/main/index.js (MIT)
export function slash(path: string) {
  const isExtendedLengthPath = /^\\\\\?\\/.test(path)
  const hasNonAscii = /[^\u0000-\u0080]+/.test(path)

  if (isExtendedLengthPath || hasNonAscii) {
    return path
  }

  return path.replace(/\\/g, '/')
}

type Truthy<T> = T extends false | '' | 0 | null | undefined ? never : T // from lodash

export function truthy<T>(value: T): value is Truthy<T> {
  return Boolean(value)
}

export function jsoncParse(data: string) {
  try {
    return new Function('return ' + strip(data).trim())()
  } catch {
    // Silently ignore any error
    // That's what tsc/jsonc-parser did after all
    return {}
  }
}

export function defaultOutExtension({
  format,
  pkgType,
}: {
  format: Format
  pkgType?: string
}): { js: string; dts: string } {
  let jsExtension = '.js'
  let dtsExtension = '.d.ts'
  const isModule = pkgType === 'module'
  if (isModule && format === 'cjs') {
    jsExtension = '.cjs'
    dtsExtension = '.d.cts'
  }
  if (!isModule && format === 'esm') {
    jsExtension = '.mjs'
    dtsExtension = '.d.mts'
  }
  if (format === 'iife') {
    jsExtension = '.global.js'
  }
  return {
    js: jsExtension,
    dts: dtsExtension,
  }
}

export function ensureTempDeclarationDir(): string {
  const cwd = process.cwd()
  const dirPath = path.join(cwd, '.tsup', 'declaration')

  if (fs.existsSync(dirPath)) {
    return dirPath
  }

  fs.mkdirSync(dirPath, { recursive: true })

  const gitIgnorePath = path.join(cwd, '.tsup', '.gitignore')
  writeFileSync(gitIgnorePath, '**/*\n')

  return dirPath
}

// Make sure the entry is an object
// We use the base path (without extension) as the entry name
// To make declaration files work with multiple entrypoints
// See #316
export const toObjectEntry = (entry: string | Entry) => {
  if (typeof entry === 'string') {
    entry = [entry]
  }
  if (!Array.isArray(entry)) {
    return entry
  }
  entry = entry.map((e) => e.replace(/\\/g, '/'))
  const ancestor = findLowestCommonAncestor(entry)
  return entry.reduce(
    (result, item) => {
      const key = item
        .replace(ancestor, '')
        .replace(/^\//, '')
        .replace(/\.[a-z]+$/, '')
      return {
        ...result,
        [key]: item,
      }
    },
    {} as Record<string, string>,
  )
}

const findLowestCommonAncestor = (filepaths: string[]) => {
  if (filepaths.length <= 1) return ''
  const [first, ...rest] = filepaths
  let ancestor = first.split('/')
  for (const filepath of rest) {
    const directories = filepath.split('/', ancestor.length)
    let index = 0
    for (const directory of directories) {
      if (directory === ancestor[index]) {
        index += 1
      } else {
        ancestor = ancestor.slice(0, index)
        break
      }
    }
    ancestor = ancestor.slice(0, index)
  }

  return ancestor.length <= 1 && ancestor[0] === ''
    ? '/' + ancestor[0]
    : ancestor.join('/')
}

export function toAbsolutePath(p: string, cwd?: string): string {
  if (path.isAbsolute(p)) {
    return p
  }

  return slash(path.normalize(path.join(cwd || process.cwd(), p)))
}

export function trimDtsExtension(fileName: string) {
  return fileName.replace(/\.d\.(ts|mts|cts)x?$/, '')
}

export function writeFileSync(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content)
}
