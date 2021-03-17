import { parentPort } from 'worker_threads'
import { InputOptions, OutputOptions, Plugin } from 'rollup'
import { makeLabel, NormalizedOptions } from './'
import dtsPlugin from 'rollup-plugin-dts'
import hashbangPlugin from 'rollup-plugin-hashbang'
import jsonPlugin from '@rollup/plugin-json'
import { handleError } from './errors'
import { getDeps, removeFiles } from './utils'
import { TsResolveOptions, tsResolvePlugin } from './rollup/ts-resolve'

type RollupConfig = {
  inputConfig: InputOptions
  outputConfig: OutputOptions
}

const getRollupConfig = async (
  options: NormalizedOptions
): Promise<RollupConfig> => {
  const dtsOptions =
    typeof options.dts === 'string'
      ? { entry: options.dts }
      : options.dts === true
      ? { entry: options.entryPoints }
      : { entry: options.entryPoints, ...options.dts }

  let tsResolveOptions: TsResolveOptions | undefined

  if (dtsOptions.resolve) {
    tsResolveOptions = {}
    // Only resolve speicifc types when `dts.resolve` is an array
    if (Array.isArray(dtsOptions.resolve)) {
      tsResolveOptions.resolveOnly = dtsOptions.resolve
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
        dtsPlugin(),
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
    console.log(`${makeLabel('dts', 'info')} Build start`)
    const bundle = await rollup(options.inputConfig)
    await bundle.write(options.outputConfig)
    console.log(
      `${makeLabel('dts', 'success')} Build success in ${getDuration()}`
    )
  } catch (error) {
    console.log(`${makeLabel('dts', 'error')} Build error`)
    handleError(error)
  }
}

async function watchRollup(options: {
  inputConfig: InputOptions
  outputConfig: OutputOptions
}) {
  const { watch } = await import('rollup')
  let start: number = Date.now()
  const getDuration = () => {
    return `${Math.floor(Date.now() - start)}ms`
  }
  watch({
    ...options.inputConfig,
    output: options.outputConfig,
  }).on('event', (event) => {
    if (event.code === 'START') {
      start = Date.now()
      console.log(`${makeLabel('dts', 'info')} Build start`)
    } else if (event.code === 'END') {
      console.log(
        `${makeLabel('dts', 'success')} Build success in ${getDuration()}`
      )
    } else if (event.code === 'ERROR') {
      console.log(`${makeLabel('dts', 'error')} Build error`)
      handleError(event.error)
    }
  })
}

parentPort?.on('message', async (data: { options: NormalizedOptions }) => {
  const config = await getRollupConfig(data.options)
  if (data.options.watch) {
    watchRollup(config)
  } else {
    await runRollup(config)
    parentPort?.close()
  }
})
