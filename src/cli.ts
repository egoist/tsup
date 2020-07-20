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
    .option('--format <format>', 'Bundle format, "cjs", "iife", "umd", "esm"', {
      default: 'cjs',
    })
    .option('--minify', 'Minify bundle')
    .option('--target <target>', 'Bundle target, "es20XX" or "esnext"', {
      default: 'es2017',
    })
    .option('--dts', 'Generate declaration file')
    .option('--dts-bundle', 'Bundle types from node_modules')
    .option('--watch', 'Watch mode')
    .option('--define.* <value>', 'Define compile-time constants')
    .option('--external <name>', 'Mark specific packages as external')
    .option('--module-name <name>', 'Module name (with with --format umd)')
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

  cli
    .command('run <file>', 'Bundle and execute a file', {
      allowUnknownOptions: true,
    })
    .option('--define.* <value>', 'Define compile-time constants')
    .action(async (file: string, options) => {})

  cli.help()

  const pkgPath = join(__dirname, '../package.json')
  cli.version(JSON.parse(readFileSync(pkgPath, 'utf8')).version)

  cli.parse(process.argv, { run: false })
  await cli.runMatchedCommand()
}

main().catch(handlError)
