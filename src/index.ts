import { ModuleFormat } from 'rollup'
import { Target as EsbuildTarget } from 'esbuild'
import hashbangPlugin from 'rollup-plugin-hashbang'
import esbuildPlugin from 'rollup-plugin-esbuild'
import commonjsPlugin from '@rollup/plugin-commonjs'
import dtsPlugin from 'rollup-plugin-dts'
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
}

export async function createRollupConfigs(files: string[], options: Options) {
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
              define: options.define
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
  const rollupConfigs = [getRollupConfig({})]

  if (options.dts) {
    rollupConfigs.push(getRollupConfig({ dts: true }))
  }

  return rollupConfigs
}
