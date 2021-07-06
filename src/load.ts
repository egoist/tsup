import fs from 'fs'
import { parse as parseJson } from 'jju/lib/parse'
import JoyCon from 'joycon'
import path from 'path'
import { Loader } from 'esbuild'
import stripJsonComments from 'strip-json-comments'

const joycon = new JoyCon()

const loadJson = async (filepath: string) => {
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
}

const jsonLoader = {
  test: /\.json$/,
  async load(filepath: string) {
    return loadJson(filepath)
  },
}

joycon.addLoader(jsonLoader)

export function loadTsConfig(cwd: string) {
  return joycon.load(
    ['tsconfig.build.json', 'tsconfig.json'],
    cwd,
    path.dirname(cwd)
  )
}

export async function loadTsupConfig(cwd: string) {
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

    const config = await bundleConfig(configPath)
    return { path: configPath, data: config }
  }

  return {}
}

function removeFile(filepath: string) {
  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath)
  }
}

async function bundleConfig(configFile: string) {
  const { build } = await import('esbuild')
  const outFile = configFile.replace(/\.[a-z]+$/, '.bundled.js')
  const readConfig = () => {
    delete eval(`require.cache`)[outFile]
    const result = require(outFile)
    removeFile(outFile)
    return result.default
  }
  try {
    await build({
      entryPoints: [configFile],
      format: 'cjs',
      outfile: outFile,
      platform: 'node',
      bundle: true,
      plugins: [
        {
          name: 'ignore',
          setup(build) {
            build.onResolve({ filter: /.*/ }, (args) => {
              if (!path.isAbsolute(args.path) && !/^[\.\/]/.test(args.path)) {
                return { external: true }
              }
            })
            build.onLoad(
              { filter: /\.(js|ts|mjs|cjs|jsx|tsx)$/ },
              async (args) => {
                const contents = await fs.promises.readFile(args.path, 'utf8')
                const ext = path.extname(args.path)
                return {
                  contents: contents
                    .replace(
                      /\b__dirname\b/g,
                      JSON.stringify(path.dirname(args.path))
                    )
                    .replace(/\b__filename\b/g, JSON.stringify(args.path))
                    .replace(
                      /\bimport\.meta\.url\b/g,
                      JSON.stringify(`file://${args.path}`)
                    ),
                  loader:
                    ext === '.mjs' || ext === '.cjs'
                      ? 'js'
                      : (ext.slice(1) as Loader),
                }
              }
            )
          },
        },
      ],
    })
    const config = readConfig()
    return config
  } catch (error) {
    removeFile(outFile)
    throw error
  }
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
