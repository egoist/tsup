import fs from 'fs'
import { parse as parseJson } from 'jju/lib/parse'
import JoyCon from 'joycon'
import path from 'path'
import stripJsonComments from 'strip-json-comments'
import { transform } from 'sucrase'

import { requireFromString } from './require-from-string'

const joycon = new JoyCon()

const configJoycon = new JoyCon({
  packageKey: 'tsup',
})

const jsonLoader = {
  test: /\.json$/,
  async load(filepath: string) {
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
}

joycon.addLoader(jsonLoader)
configJoycon.addLoader(jsonLoader)

const tsLoader = {
  test: /\.ts$/,
  async load(filepath: string) {
    const content = await fs.promises.readFile(filepath, 'utf8')
    const { code } = transform(content, {
      filePath: filepath,
      transforms: ['imports', 'typescript'],
    })
    const mod = requireFromString(code, filepath)
    return mod.default || mod
  },
}

joycon.addLoader(tsLoader)
configJoycon.addLoader(tsLoader)

const cjsLoader = {
  test: /\.cjs$/,
  load(filepath: string) {
    delete require.cache[filepath]
    return require(filepath)
  },
}

joycon.addLoader(cjsLoader)
configJoycon.addLoader(cjsLoader)

export function loadTsConfig(cwd: string) {
  return joycon.load(
    ['tsconfig.build.json', 'tsconfig.json'],
    cwd,
    path.dirname(cwd)
  )
}

export async function loadTsupConfig(cwd: string) {
  const config = await configJoycon.load(
    [
      'tsup.config.ts',
      'tsup.config.js',
      'tsup.config.cjs',
      'tsup.config.json',
      'package.json',
    ],
    cwd,
    path.dirname(cwd)
  )

  if (config.data && config.data.tsup) config.data = config.data.tsup

  return config
}

export async function loadPkg(cwd: string) {
  const { data } = await joycon.load(['package.json'], cwd, path.dirname(cwd))
  return data || {}
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
