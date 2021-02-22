import { parentPort } from 'worker_threads'
import { InputOptions, OutputOptions } from 'rollup'
import { Options, makeLabel } from './'
import hashbangPlugin from 'rollup-plugin-hashbang'
import jsonPlugin from '@rollup/plugin-json'
import nodeResolvePlugin from '@rollup/plugin-node-resolve'
import { handlError } from './errors'

type RollupConfig = {
  inputConfig: InputOptions
  outputConfig: OutputOptions
}

const getRollupConfig = async (options: Options): Promise<RollupConfig> => {
  return {
    inputConfig: {
      input:
        typeof options.dts === 'string' &&
        /** For backwards compat */ options.dts !== 'bundle'
          ? options.dts
          : options.entryPoints,
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
        (options.dtsResolve ||
          /** For backwards compat */ options.dts === 'bundle') &&
          nodeResolvePlugin({
            extensions: ['.d.ts', '.ts'],
            mainFields: ['types'],
            moduleDirectories: ['node_modules/@types', 'node_modules'],
          }),
        hashbangPlugin(),
        jsonPlugin(),
        await import('rollup-plugin-dts').then((res) => res.default()),
      ].filter(Boolean),
    },
    outputConfig: {
      dir: options.outDir || 'dist',
      format: 'esm',
      exports: 'named',
      name: options.globalName,
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
    handlError(error)
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
      handlError(event.error)
    }
  })
}

parentPort?.on('message', async (data: { options: Options }) => {
  const config = await getRollupConfig(data.options)
  if (data.options.watch) {
    watchRollup(config)
  } else {
    await runRollup(config)
    parentPort?.close()
  }
})
