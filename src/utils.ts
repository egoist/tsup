import fs from 'fs'
import path from 'path'
import JoyCon from 'joycon'
import stripJsonComments from 'strip-json-comments'
import resovleFrom from 'resolve-from'
import { parse as parseJson } from 'jju/lib/parse'
import { transform } from 'sucrase'
import glob from 'globby'
import { requireFromString } from './require-from-string'

const joycon = new JoyCon()

joycon.addLoader({
  test: /\.json$/,
  async load(filepath) {
    try {
      const content = stripJsonComments(
        await fs.promises.readFile(filepath, 'utf8')
      )
      return parseJson(content)
    } catch (error) {
      throw new Error(
        `Failed to parse ${path.relative(process.cwd(), filepath)}: ${
          error.message
        }`
      )
    }
  },
})

joycon.addLoader({
  test: /\.ts$/,
  async load(filepath) {
    const content = await fs.promises.readFile(filepath, 'utf8')
    const { code } = transform(content, {
      filePath: filepath,
      transforms: ['imports', 'typescript'],
    })
    const mod = requireFromString(code, filepath)
    return mod.default || mod
  },
})

joycon.addLoader({
  test: /\.cjs$/,
  load(filepath) {
    delete require.cache[filepath]
    return require(filepath)
  },
})

// No backslash in path
function slash(input: string) {
  return input.replace(/\\/g, '/')
}

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

export function loadTsConfig(cwd: string) {
  return joycon.load(
    ['tsconfig.build.json', 'tsconfig.json'],
    cwd,
    path.dirname(cwd)
  )
}

export async function getDeps(cwd: string) {
  const data = await loadPkg(cwd)

  const deps = Array.from(
    new Set([
      ...Object.keys(data.dependencies || {}),
      ...Object.keys(data.peerDependencies || {}),
    ])
  )

  return deps
}

export async function loadPkg(cwd: string) {
  const { data } = await joycon.load(['package.json'], cwd, path.dirname(cwd))
  return data || {}
}

export function getBabel(): null | typeof import('@babel/core') {
  const p = resovleFrom.silent(process.cwd(), '@babel/core')
  return p && require(p)
}

export function getPostcss(): null | typeof import('postcss') {
  const p = resovleFrom.silent(process.cwd(), 'postcss')
  return p && require(p)
}

export function localRequire(moduleName: string) {
  const p = resovleFrom.silent(process.cwd(), moduleName)
  return p && require(p)
}

export function pathExists(p: string) {
  return new Promise((resolve) => {
    fs.access(p, (err) => {
      resolve(!err)
    })
  })
}

export function loadTsupConfig(cwd: string) {
  return joycon.load(
    ['tsup.config.ts', 'tsup.config.js', 'tsup.config.cjs', 'tsup.config.json'],
    cwd,
    path.dirname(cwd)
  )
}

export async function removeFiles(patterns: string[], dir: string) {
  const files = await glob(patterns, {
    cwd: dir,
    absolute: true,
  })
  await Promise.all(files.map((file) => fs.promises.unlink(file)))
}

export function rewriteImportMetaUrl(input: string, filename: string) {
  const helper = `var __import_meta_url = typeof document === 'undefined' ? 'file://' + __filename : new URL('${filename}', document.baseURI).href;`
  let injectHelper = false
  input = input.replace(/\bimport\.meta\.url\b/g, () => {
    injectHelper = true
    return '__import_meta_url'
  })
  if (injectHelper) {
    input = input.replace(`"use strict";`, (m) => m + helper)
  }
  return input
}
