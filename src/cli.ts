#!/usr/bin/env node
import { readFileSync } from 'fs'
import { join } from 'path'
import { cac } from 'cac'
import { handlError } from './errors'

const cli = cac('tsup')

cli
  .command('<...files>', 'Entry files')
  .option('--out-dir', 'Output directory', { default: 'dist' })
  .option('--format <format>', 'Bundle format, "cjs", "iife", "umd", "esm"', {
    default: 'cjs',
  })
  .option('--minify', 'Minify bundle')
  .option('--target <target>', 'Bundle target, "es20XX" or "esnext"', {
    default: 'es2017',
  })
  .option('--bundle', 'Bundle node_modules')
  .option('--dts', 'Generate declaration file')
  .option('--watch', 'Watch mode')
  .option('--jsxFactory <jsxFactory>', 'Name of JSX factory function', {
    default: 'React.createElement',
  })
  .option('--jsxFragment <jsxFragment>', 'Name of JSX fragment function', {
    default: 'React.Fragment',
  })
  .action(async (files: string[], options) => {
    const { rollup, watch } = await import('rollup')
    const { default: hashbangPlugin } = await import('rollup-plugin-hashbang')
    const { default: esbuildPlugin } = await import('rollup-plugin-esbuild')
    const { default: commonjsPlugin } = await import('@rollup/plugin-commonjs')
    const { resolvePlugin } = await import('./resolve-plugin')
    const { default: dtsPlugin } = await import('rollup-plugin-dts')

    const getRollupConfig = ({ dts }: { dts?: boolean }) => {
      return {
        inputConfig: {
          input: files,
          plugins: [
            hashbangPlugin(),
            resolvePlugin({ bundle: options.bundle }),
            commonjsPlugin(),
            !dts &&
              esbuildPlugin({
                target: options.target,
                watch: options.watch,
                minify: options.minify,
                jsxFactory: options.jsxFactory,
                jsxFragment: options.jsxFragment,
              }),
            dts && dtsPlugin(),
          ].filter(Boolean),
        },
        outputConfig: {
          dir: options.outDir,
          format: options.format,
        },
      }
    }
    const rollupConfigs = [
      getRollupConfig({}),
      options.dts && getRollupConfig({ dts: true }),
    ].filter(Boolean)
    if (options.watch) {
      const watcher = watch(
        rollupConfigs.map((config) => ({
          ...config.inputConfig,
          output: config.outputConfig,
        }))
      )
      watcher.on('event', (event) => {
        console.log(event)
      })
    } else {
      try {
        await Promise.all(
          rollupConfigs.map(async (config) => {
            const result = await rollup(config.inputConfig)
            await result.write(config.outputConfig)
          })
        )
      } catch (error) {
        handlError(error)
      }
    }
  })

cli.help()

const pkgPath = join(__dirname, '../package.json')
cli.version(JSON.parse(readFileSync(pkgPath, 'utf8')).version)

try {
  cli.parse()
} catch (error) {
  handlError(error)
}
