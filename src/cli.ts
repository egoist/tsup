#!/usr/bin/env node
import { readFileSync } from 'fs'
import { join } from 'path'
import { cac } from 'cac'
import { handlError } from './errors'

const cli = cac('tsup')

cli
  .command('<...files>', 'Entry files')
  .option('--out-dir', 'Output directory', { default: 'dist' })
  .option('--format <format>', 'Bundle format, "cjs" or "iife"', {
    default: 'cjs',
  })
  .option('--minify', 'Minify bundle')
  .option('--target <target>', 'Bundle target, "es20XX" or "esnext"', {
    default: 'es2017',
  })
  .option('--bundle', 'Bundle node_modules')
  .option('--watch', 'Watch mode')
  .action(async (files: string[], options) => {
    const { rollup, watch } = await import('rollup')
    const { default: hashbangPlugin } = await import('rollup-plugin-hashbang')
    const { default: esbuildPlugin } = await import('rollup-plugin-esbuild')
    const { default: commonjsPlugin } = await import('@rollup/plugin-commonjs')
    const { resolvePlugin } = await import('./resolve-plugin')

    const inputOptions = {
      input: files,
      plugins: [
        hashbangPlugin(),
        resolvePlugin({ bundle: options.bundle }),
        commonjsPlugin(),
        esbuildPlugin({ minify: options.minify, target: options.target }),
      ],
    }
    const outputOptions = {
      dir: options.outDir,
      format: options.format,
    }
    if (options.watch) {
      const watcher = watch({
        ...inputOptions,
        output: outputOptions,
      })
      watcher.on('event', (event) => {
        console.log(event)
      })
    } else {
      try {
        const result = await rollup(inputOptions)
        await result.write(outputOptions)
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
