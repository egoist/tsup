import { ModuleFormat, InputOptions, OutputOptions } from 'rollup'
import { Target as EsbuildTarget } from 'esbuild'
import prettyBytes from 'pretty-bytes'
import colors from 'colorette'
import hashbangPlugin from 'rollup-plugin-hashbang'
import esbuildPlugin from 'rollup-plugin-esbuild'
import commonjsPlugin from '@rollup/plugin-commonjs'
import jsonPlugin from '@rollup/plugin-json'
import dtsPlugin from 'rollup-plugin-dts'
import { sizePlugin, caches } from './size-plugin'
import { resolvePlugin } from './resolve-plugin'

type Options = {
  bundle?: boolean
  dts?: boolean
  target?: EsbuildTarget
  watch?: boolean
  minify?: boolean
  jsxFactory?: string
  jsxFragment?: string
  outDir: string
  format: ModuleFormat
  define?: {
    [k: string]: string
  }
  /** Don't bundle these packages */
  external?: string[]
}

export async function createRollupConfigs(files: string[], options: Options) {
  const getRollupConfig = ({
    dts,
  }: {
    dts?: boolean
  }): { inputConfig: InputOptions; outputConfig: OutputOptions } => {
    return {
      inputConfig: {
        input: files,
        preserveEntrySignatures: 'strict',
        onwarn(warning, handler) {
          if (
            warning.code === 'UNRESOLVED_IMPORT' ||
            warning.code === 'CIRCULAR_DEPENDENCY'
          ) {
            return
          }
          return handler(warning)
        },
        plugins: [
          hashbangPlugin(),
          jsonPlugin(),
          resolvePlugin({
            bundle: options.bundle,
            external: options.external,
            dts,
          }),
          !dts && commonjsPlugin({
            namedExports: {
              // commonjs plugin failed to detect named exports for `resolve`, TODO: report this bug
              resolve: Object.keys(require('resolve')),
            },
          }),
          dts && dtsPlugin(),
          !dts &&
            esbuildPlugin({
              target: options.target,
              watch: options.watch,
              minify: options.minify,
              jsxFactory: options.jsxFactory,
              jsxFragment: options.jsxFragment,
              define: options.define,
            }),
          sizePlugin(),
        ].filter(Boolean),
      },
      outputConfig: {
        dir: options.outDir,
        format: options.format,
      },
    }
  }
  const rollupConfigs = [getRollupConfig({})]

  if (options.dts) {
    rollupConfigs.push(getRollupConfig({ dts: true }))
  }

  return rollupConfigs
}

export function printSizes() {
  const result: Map<string, number> = new Map()
  for (const cache of caches.values()) {
    for (const [filename, getSize] of cache.entries()) {
      result.set(filename, getSize())
    }
  }
  const maxNameLength = [...result.keys()].sort((a, b) =>
    a.length > b.length ? -1 : 1
  )[0].length
  for (const [filename, size] of result.entries()) {
    console.log(
      `${colors.bold(filename.padEnd(maxNameLength))} - ${colors.green(
        prettyBytes(size)
      )}`
    )
  }
}
