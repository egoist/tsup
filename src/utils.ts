import fs from 'fs'
import JoyCon from 'joycon'
import stripJsonComments from 'strip-json-comments'
import resovleFrom from 'resolve-from'

const joycon = new JoyCon()

joycon.addLoader({
  test: /\.json$/,
  async load(filepath) {
    const content = stripJsonComments(
      await fs.promises.readFile(filepath, 'utf8')
    )
    return JSON.parse(content)
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
  return joycon.load(['tsconfig.build.json', 'tsconfig.json'], cwd)
}

export async function getDeps(cwd: string) {
  const data = await loadPkg(cwd)

  const deps = Array.from(new Set([
    ...Object.keys(data.dependencies || {}),
    ...Object.keys(data.peerDependencies || {})
  ]))

  return deps
}

export async function loadPkg(cwd: string) {
  const { data } = await joycon.load(['package.json'], cwd)
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