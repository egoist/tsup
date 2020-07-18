import { ModuleFormat, InputOptions, OutputOptions } from 'rollup'
import prettyBytes from 'pretty-bytes'
import colors from 'kleur'
import hashbangPlugin from 'rollup-plugin-hashbang'
import tsPlugin from 'rollup-plugin-esbuild'
import commonjsPlugin from '@rollup/plugin-commonjs'
import jsonPlugin from '@rollup/plugin-json'
import { sizePlugin, caches } from './size-plugin'
import { resolvePlugin } from './resolve-plugin'
import { isExternal, resolveTsConfig } from './utils'

type Options = {
  // Bundle packages in node_modules
  bundle?: boolean
  // Generate .d.ts file
  dts?: boolean
  // Bundle .d.ts files in node_modules
  dtsBundle?: boolean
  target?: string
  minify?: boolean
  watch?: boolean
  jsxFactory?: string
  jsxFragment?: string
  outDir?: string
  format: ModuleFormat
  moduleName?: string
  define?: {
    [k: string]: string
  }
  /** Don't bundle these packages */
  external?: string[]
  inlineDynamicImports?: boolean
}

export async function createRollupConfigs(files: string[], options: Options) {
  if (options.dtsBundle) {
    options.dts = true
  }

  const tsconfig = resolveTsConfig(process.cwd()) || undefined

  if (tsconfig) {
    console.log(`Using tsconfig: ${tsconfig}`)
  }

  const getRollupConfig = async ({
    dts,
    dtsBundle,
  }: {
    dts?: boolean
    dtsBundle?: boolean
  }): Promise<{
    name: string
    inputConfig: InputOptions
    outputConfig: OutputOptions
  }> => {
    const compilerOptions: any = {
      module: 'esnext',
    }

    if (dts) {
      compilerOptions.declaration = false
    }

    return {
      name: `dts: ${dts}, bundle: ${options.bundle}`,
      inputConfig: {
        input: files,
        preserveEntrySignatures: 'strict',
        inlineDynamicImports: options.inlineDynamicImports,
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
          !dts &&
            tsPlugin({
              target: options.target,
              watch: options.watch,
              minify: options.minify,
              jsxFactory: options.jsxFactory,
              jsxFragment: options.jsxFragment,
              define: options.define,
              tsconfig
            }),
          (!dts || dtsBundle) &&
            resolvePlugin({
              bundle: options.bundle,
              external: options.external,
              dtsBundle: dtsBundle,
            }),
          !dts &&
            commonjsPlugin({
              // @ts-ignore wrong typing in @rollup/plugin-commonjs
              ignore: (name: string) => {
                if (!options.external) {
                  return false
                }
                return isExternal(options.external, name)
              },
            }),
          dts &&
            (await import('rollup-plugin-dts').then((res) => res.default())),
          sizePlugin(),
        ].filter(Boolean),
      },
      outputConfig: {
        dir: options.outDir || 'dist',
        format: options.format || 'cjs',
        exports: 'named',
        name: options.moduleName,
      },
    }
  }
  const rollupConfigs = [await getRollupConfig({})]

  if (options.dts) {
    rollupConfigs.push(
      await getRollupConfig({ dts: true, dtsBundle: options.dtsBundle })
    )
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
