#!/usr/bin/env node
import { readFileSync } from 'fs'
import { join } from 'path'
import { cac } from 'cac'
import { handlError } from './errors'

const cli = cac('tsup')

cli
  .command('<...files>', 'Bundle files')
  .option('-d, --out-dir <dir>', 'Output directory', { default: 'dist' })
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
  .option('--define.* <value>', 'Define compile-time constants')
  .option('--external <name>', 'Mark specific packages as external (use with --bundle)')
  .option('--module-name <name>', 'Module name (with with --format umd)')
  .option('--jsxFactory <jsxFactory>', 'Name of JSX factory function', {
    default: 'React.createElement',
  })
  .option('--jsxFragment <jsxFragment>', 'Name of JSX fragment function', {
    default: 'React.Fragment',
  })
  .option('--inlineDynamicImports', 'Create a single bundle that inlines dynamic imports')
  .action(async (files: string[], options) => {
    const { rollup, watch } = await import('rollup')
    const { createRollupConfigs, printSizes } = await import('./')
    const rollupConfigs = await createRollupConfigs(files, {
      watch: options.watch,
      minify: options.minify,
      jsxFragment: options.jsxFragment,
      jsxFactory: options.jsxFactory,
      format: options.format,
      target: options.target,
      dts: options.dts,
      bundle: options.bundle,
      outDir: options.outDir,
      define: options.define,
      external: options.external,
      moduleName: options.moduleName,
      inlineDynamicImports: options.inlineDynamicImports
    })
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
        const startTime = Date.now()

        await Promise.all(
          rollupConfigs.map(async (config) => {
            const result = await rollup(config.inputConfig)
            await result.write(config.outputConfig)
          })
        )
        printSizes()
        const endTime = Date.now()
        console.log(`Done in ${endTime - startTime}ms`)
      } catch (error) {
        handlError(error)
      }
    }
  })

cli
  .command('run <file>', 'Bundle and execute a file', {
    allowUnknownOptions: true,
  })
  .option('--define.* <value>', 'Define compile-time constants')
  .action(async (file: string, options) => {
    const extraArgs = process.argv.slice(process.argv.indexOf(file) + 1)
    const { rollup } = await import('rollup')
    const { createRollupConfigs } = await import('./')
    const { runCode } = await import('./run')
    const [rollupConfig] = await createRollupConfigs([file], {
      define: options.define,
      outDir: 'dist',
      format: 'cjs',
      target: 'es2017'
    })
    const bundle = await rollup(rollupConfig.inputConfig)
    const { output } = await bundle.write(rollupConfig.outputConfig)
    runCode(join('dist', output[0].fileName), {
      args: extraArgs,
    })
  })

cli.help()

const pkgPath = join(__dirname, '../package.json')
cli.version(JSON.parse(readFileSync(pkgPath, 'utf8')).version)

try {
  cli.parse()
} catch (error) {
  handlError(error)
}
