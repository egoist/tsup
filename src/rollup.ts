import path from 'path'
import { parentPort } from 'worker_threads'
import { InputOptions, OutputOptions, Plugin } from 'rollup'
import { NormalizedOptions } from './'
import hashbangPlugin from 'rollup-plugin-hashbang'
import jsonPlugin from '@rollup/plugin-json'
import { handleError } from './errors'
import { removeFiles } from './utils'
import { TsResolveOptions, tsResolvePlugin } from './rollup/ts-resolve'
import { log, setSilent } from './log'
import { getDeps, loadTsConfig } from './load'

// Use `require` to esbuild use the cjs build of rollup-plugin-dts
// the mjs build of rollup-plugin-dts uses `import.meta.url` which makes Node throws syntax error
// since tsup is published as a commonjs module for now
const dtsPlugin: typeof import('rollup-plugin-dts') = require('rollup-plugin-dts')

type RollupConfig = {
  inputConfig: InputOptions
  outputConfig: OutputOptions
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

// Make sure the Rollup entry is an object
// We use the base path (without extension) as the entry name
// To make declaration files work with multiple entrypoints
// See #316
const toObjectEntry = (entry: string[]) => {
  entry = entry.map((e) => e.replace(/\\/g, '/'))
  const ancester = findLowestCommonAncestor(entry)
  return entry.reduce((result, item) => {
    const key = item
      .replace(ancester, '')
      .replace(/^\//, '')
      .replace(/\.[a-z]+$/, '')
    return {
      ...result,
      [key]: item,
    }
  }, {})
}

const getRollupConfig = async (
  options: NormalizedOptions
): Promise<RollupConfig> => {
  setSilent(options.silent)
  const compilerOptions: {
    baseUrl?: string
    paths?: Record<string, string[]>
  } = await loadTsConfig(process.cwd()).then(
    (res) => res.data?.compilerOptions || {}
  )

  const dtsOptions =
    typeof options.dts === 'string'
      ? { entry: options.dts }
      : options.dts === true
      ? { entry: options.entryPoints }
      : { entry: options.entryPoints, ...options.dts }

  if (Array.isArray(dtsOptions.entry) && dtsOptions.entry.length > 1) {
    dtsOptions.entry = toObjectEntry(dtsOptions.entry)
  }

  let tsResolveOptions: TsResolveOptions | undefined

  if (dtsOptions.resolve) {
    tsResolveOptions = {}
    // Only resolve speicifc types when `dts.resolve` is an array
    if (Array.isArray(dtsOptions.resolve)) {
      tsResolveOptions.resolveOnly = dtsOptions.resolve
    }

    // `paths` should be handled by rollup-plugin-dts
    if (compilerOptions.paths) {
      const res = Object.keys(compilerOptions.paths).map(
        (p) => new RegExp(`^${p.replace('*', '.+')}$`)
      )
      tsResolveOptions.ignore = (source) => {
        return res.some((re) => re.test(source))
      }
    }
  }

  const deps = await getDeps(process.cwd())

  const tsupCleanPlugin: Plugin = {
    name: 'tsup:clean',
    async buildStart() {
      if (options.clean) {
        await removeFiles(['**/*.d.ts'], options.outDir)
      }
    },
  }

  const ignoreFiles: Plugin = {
    name: 'tsup:ignore-files',
    load(id) {
      if (/\.(css|vue|svelte)$/.test(id)) {
        return ''
      }
    },
  }

  return {
    inputConfig: {
      input: dtsOptions.entry,
      onwarn(warning, handler) {
        if (
          warning.code === 'UNRESOLVED_IMPORT' ||
          warning.code === 'CIRCULAR_DEPENDENCY' ||
          warning.code === 'EMPTY_BUNDLE'
        ) {
          return
        }
        return handler(warning)
      },
      plugins: [
        tsupCleanPlugin,
        tsResolveOptions && tsResolvePlugin(tsResolveOptions),
        hashbangPlugin(),
        jsonPlugin(),
        ignoreFiles,
        dtsPlugin.default({
          compilerOptions:
            compilerOptions.baseUrl && compilerOptions.paths
              ? {
                  baseUrl: compilerOptions.baseUrl,
                  paths: compilerOptions.paths,
                }
              : undefined,
        }),
      ].filter(Boolean),
      external: [...deps, ...(options.external || [])],
    },
    outputConfig: {
      dir: options.outDir || 'dist',
      format: 'esm',
      exports: 'named',
    },
  }
}

async function runRollup(options: RollupConfig) {
  const { rollup } = await import('rollup')
  try {
    const start = Date.now()
    const getDuration = () => {
      return `${Math.floor(Date.now() - start)}ms`
    }
    log('dts', 'info', 'Build start')
    const bundle = await rollup(options.inputConfig)
    await bundle.write(options.outputConfig)
    log('dts', 'success', `Build success in ${getDuration()}`)
  } catch (error) {
    log('dts', 'error', 'Build error')
    parentPort?.postMessage('error')
    handleError(error)
  }
}

async function watchRollup(options: {
  inputConfig: InputOptions
  outputConfig: OutputOptions
}) {
  const { watch } = await import('rollup')

  watch({
    ...options.inputConfig,
    plugins: options.inputConfig.plugins,
    output: options.outputConfig,
  }).on('event', async (event) => {
    if (event.code === 'START') {
      log('dts', 'info', 'Build start')
    } else if (event.code === 'BUNDLE_END') {
      log('dts', 'success', `Build success in ${event.duration}ms`)
      parentPort?.postMessage('success')
    } else if (event.code === 'ERROR') {
      log('dts', 'error', 'Build failed')
      parentPort?.postMessage('error')
      handleError(event.error)
    }
  })
}

const startRollup = async (options: NormalizedOptions) => {
  const config = await getRollupConfig(options)
  if (options.watch) {
    watchRollup(config)
  } else {
    await runRollup(config)
    parentPort?.close()
  }
}

parentPort?.on('message', (data) => {
  startRollup(data.options)
})
