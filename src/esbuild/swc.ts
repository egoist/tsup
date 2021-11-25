/**
 * Use SWC to emit decorator metadata
 */
import { JscConfig } from '@swc/core'
import { Plugin } from 'esbuild'
import { localRequire } from '../utils'

export const swcPlugin = (): Plugin => {
  return {
    name: 'swc',

    async setup(build) {
      const swc: typeof import('@swc/core') = localRequire('@swc/core')

      if (!swc) {
        return
      }

      // Force esbuild to keep class names as well
      build.initialOptions.keepNames = true

      build.onLoad({ filter: /\.[jt]sx?$/ }, async (args) => {
        const isTs = /\.tsx?$/.test(args.path)

        const jsc: JscConfig = {
          parser: {
            syntax: isTs ? 'typescript' : 'ecmascript',
            decorators: true,
          },
          transform: {
            legacyDecorator: true,
            decoratorMetadata: true,
          },
          keepClassNames: true,
          target: 'es2022',
        }

        const result = await swc.transformFile(args.path, {
          jsc,
          sourceMaps: 'inline',
          configFile: false,
          swcrc: false,
        })

        return {
          contents: result.code,
        }
      })
    },
  }
}
