#!/usr/bin/env node
import { readFileSync } from 'fs'
import { join } from 'path'
import { cac } from 'cac'

const cli = cac('tsup')

cli
  .command('<...files>', 'Entry files')
  .option('--format <format>', 'Bundle format')
  .option('--minify', 'Minify bundle')
  .option('--target <target>', 'Bundle target, "es20XX" or "esnext"', {
    default: 'es2017',
  })
  .action(async (files: string[], options) => {
    const { rollup } = await import('rollup')
    const { default: hashbangPlugin } = await import('rollup-plugin-hashbang')
    const { default: esbuildPlugin } = await import('rollup-plugin-esbuild')

    const result = await rollup({
      input: files,
      plugins: [
        hashbangPlugin(),
        esbuildPlugin({ minify: options.minify, target: options.target }),
      ],
    })
    await result.write({
      dir: 'dist',
      format: options.format || 'cjs',
    })
  })

cli.help()

const pkgPath = join(__dirname, '../package.json')
cli.version(JSON.parse(readFileSync(pkgPath, 'utf8')).version)

cli.parse()
