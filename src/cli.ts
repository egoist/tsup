#!/usr/bin/env node
import { readFileSync } from 'fs'
import { join } from 'path'
import { cac } from 'cac'
import { handlError } from './errors'
import { Format, Options } from './'

function ensureArray(input: string): string[] {
  return Array.isArray(input) ? input : input.split(',')
}

async function main() {
  const cli = cac('tsup')

  cli
    .command('[...files]', 'Bundle files', {
      ignoreOptionDefaultValue: true,
    })
    .option('-d, --out-dir <dir>', 'Output directory', { default: 'dist' })
    .option('--format <format>', 'Bundle format, "cjs", "iife", "esm"', {
      default: 'cjs',
    })
    .option('--minify', 'Minify bundle')
    .option('--minify-whitespace', 'Minify whitespace')
    .option('--minify-identifiers', 'Minify identifiers')
    .option('--minify-syntax', 'Minify syntax')
    .option(
      '--keep-names',
      'Keep original function and class names in minified code'
    )
    .option('--target <target>', 'Bundle target, "es20XX" or "esnext"', {
      default: 'es2017',
    })
    .option('--babel', 'Transform the result with Babel')
    .option(
      '--legacy-output',
      'Output different formats to different folder instead of using different extensions'
    )
    .option('--dts [entry]', 'Generate declaration file')
    .option('--dts-resolve', 'Resolve externals types used for d.ts files')
    .option('--sourcemap', 'Generate sourcemap file')
    .option('--watch', 'Watch mode')
    .option('--env.* <value>', 'Define compile-time env variables')
    .option('--define.* <value>', 'Define compile-time constants')
    .option('--external <name>', 'Mark specific packages as external')
    .option('--global-name <name>', 'Global variable name for iife format')
    .option('--jsxFactory <jsxFactory>', 'Name of JSX factory function', {
      default: 'React.createElement',
    })
    .option('--jsxFragment <jsxFragment>', 'Name of JSX fragment function', {
      default: 'React.Fragment',
    })
    .option(
      '--inlineDynamicImports',
      'Create a single bundle that inlines dynamic imports'
    )
    .option('--replaceNodeEnv', 'Replace process.env.NODE_ENV')
    .action(async (files: string[], flags) => {
      const { build } = await import('./')
      const options: Options = {
        ...flags,
      }
      if (files.length > 0) {
        options.entryPoints = files
      }
      if (flags.format) {
        const format = ensureArray(flags.format) as Format[]
        options.format = format
      }
      if (flags.external) {
        const external = ensureArray(flags.external)
        options.external = external
      }
      if (flags.dts || flags.dtsResolve) {
        options.dts = {}
        if (typeof flags.dts === 'string') {
          options.dts.entry = flags.dts
        }
        if (flags.dtsResolve) {
          options.dts.resolve = flags.dtsResolve
        }
      }
      await build(options)
    })

  cli.help()

  const pkgPath = join(__dirname, '../package.json')
  cli.version(JSON.parse(readFileSync(pkgPath, 'utf8')).version)

  cli.parse(process.argv, { run: false })
  await cli.runMatchedCommand()
}

main().catch(handlError)
