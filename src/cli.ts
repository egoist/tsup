#!/usr/bin/env node
import { readFileSync } from 'fs'
import { join } from 'path'
import { cac } from 'cac'
import { handlError, PrettyError } from './errors'
import { Format } from './'

function stringyOrArray(input: string, defaultValue: string[]): string[] {
  if (!input) {
    return defaultValue
  }
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
    .option('--dts [type]', 'Generate declaration file')
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
    .action(async (files: string[], options) => {
      if (files.length === 0) {
        throw new PrettyError(`Missing input files, e.g. tsup src/index.ts`)
      }

      const { build } = await import('./')
      await build({
        ...options,
        entryPoints: files,
        format: stringyOrArray(options.format, ['cjs']) as Format[],
        external: stringyOrArray(options.external, []),
      })
    })

  cli.help()

  const pkgPath = join(__dirname, '../package.json')
  cli.version(JSON.parse(readFileSync(pkgPath, 'utf8')).version)

  cli.parse(process.argv, { run: false })
  await cli.runMatchedCommand()
}

main().catch(handlError)
