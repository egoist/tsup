import fs from 'node:fs'
import path from 'node:path'
import JoyCon from 'joycon'
import { bundleRequire } from 'bundle-require'
import { jsoncParse } from './utils'
import type { defineConfig } from './'

const joycon = new JoyCon()

const loadJson = async (filepath: string) => {
  try {
    return jsoncParse(await fs.promises.readFile(filepath, 'utf8'))
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Failed to parse ${path.relative(process.cwd(), filepath)}: ${
          error.message
        }`,
      )
    } else {
      throw error
    }
  }
}

const jsonLoader = {
  test: /\.json$/,
  load(filepath: string) {
    return loadJson(filepath)
  },
}

joycon.addLoader(jsonLoader)

export async function loadTsupConfig(
  cwd: string,
  configFile?: string,
): Promise<{ path?: string; data?: ReturnType<typeof defineConfig> }> {
  const configJoycon = new JoyCon()
  const configPath = await configJoycon.resolve({
    files: configFile
      ? [configFile]
      : [
          'tsup.config.ts',
          'tsup.config.cts',
          'tsup.config.mts',
          'tsup.config.js',
          'tsup.config.cjs',
          'tsup.config.mjs',
          'tsup.config.json',
          'package.json',
        ],
    cwd,
    stopDir: path.parse(cwd).root,
    packageKey: 'tsup',
  })

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

export async function loadPkg(cwd: string, clearCache: boolean = false) {
  if (clearCache) {
    joycon.clearCache()
  }
  const { data } = await joycon.load(['package.json'], cwd, path.dirname(cwd))
  return data || {}
}

/*
 * Production deps should be excluded from the bundle
 */
export async function getProductionDeps(
  cwd: string,
  clearCache: boolean = false,
) {
  const data = await loadPkg(cwd, clearCache)

  const deps = Array.from(
    new Set([
      ...Object.keys(data.dependencies || {}),
      ...Object.keys(data.peerDependencies || {}),
    ]),
  )

  return deps
}

/**
 * Use this to determine if we should rebuild when package.json changes
 */
export async function getAllDepsHash(cwd: string) {
  const data = await loadPkg(cwd, true)

  return JSON.stringify({
    ...data.dependencies,
    ...data.peerDependencies,
    ...data.devDependencies,
  })
}
