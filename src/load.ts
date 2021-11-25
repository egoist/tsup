import fs from 'fs'
import { parse as parseJson } from 'jju/lib/parse'
import JoyCon from 'joycon'
import path from 'path'
import { bundleRequire } from 'bundle-require'
import stripJsonComments from 'strip-json-comments'
import { defineConfig } from './'

const joycon = new JoyCon()

const loadJson = async (filepath: string) => {
  try {
    const content = stripJsonComments(
      await fs.promises.readFile(filepath, 'utf8')
    )
    return parseJson(content)
  } catch (error: any) {
    throw new Error(
      `Failed to parse ${path.relative(process.cwd(), filepath)}: ${
        error.message
      }`
    )
  }
}

const jsonLoader = {
  test: /\.json$/,
  async load(filepath: string) {
    return loadJson(filepath)
  },
}

joycon.addLoader(jsonLoader)

export async function loadTsupConfig(
  cwd: string
): Promise<{ path?: string; data?: ReturnType<typeof defineConfig> }> {
  const configJoycon = new JoyCon()
  const configPath = await configJoycon.resolve(
    [
      'tsup.config.ts',
      'tsup.config.js',
      'tsup.config.cjs',
      'tsup.config.mjs',
      'tsup.config.json',
      'package.json',
    ],
    cwd,
    path.dirname(cwd)
  )

  if (configPath) {
    if (configPath.endsWith('.json')) {
      let data = await loadJson(configPath)
      if (configPath.endsWith('package.json')) {
        data = data.tsup
      }
      if (data) {
        return { path: configPath, data }
      }
      return {}
    }

    const config = await bundleRequire({
      filepath: configPath,
    })
    return {
      path: configPath,
      data: config.mod.tsup || config.mod.default || config.mod,
    }
  }

  return {}
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
