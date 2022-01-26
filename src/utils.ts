import fs from 'fs'
import path from 'path'
import glob from 'globby'
import { fileURLToPath } from 'url'
import resolveFrom from 'resolve-from'
import strip from 'strip-json-comments'

export const distDir = path.dirname(fileURLToPath(import.meta.url))

export type External =
  | string
  | RegExp
  | ((id: string, parentId?: string) => boolean)

export function isExternal(
  externals: External | External[],
  id: string,
  parentId?: string
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

export async function localImport<T>(moduleName: string): Promise<null | T> {
  const p = resolveFrom.silent(process.cwd(), moduleName)
  return p ? import(p) : null
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
  await Promise.all(files.map((file) => fs.promises.unlink(file)))
}

export function debouncePromise<T extends unknown[]>(
  fn: (...args: T) => Promise<void>,
  delay: number,
  onError: (err: unknown) => void
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
  } catch (_) {
    // Silently ignore any error
    // That's what tsc/jsonc-parser did after all
    return {}
  }
}
