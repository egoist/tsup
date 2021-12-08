/**
 * Use SWC to emit decorator metadata
 */
import { JscConfig } from '@swc/core'
import { Plugin } from 'esbuild'
import { Logger } from '../log'
import { localRequire } from '../utils'

export const swcPlugin = ({ logger }: { logger: Logger }): Plugin => {
  return {
    name: 'swc',

    setup(build) {
      const swc: typeof import('@swc/core') = localRequire('@swc/core')

      if (!swc) {
        logger.warn(
          build.initialOptions.format!,
          `You have emitDecoratorMetadata enabled but @swc/core was not installed, skipping swc plugin`
        )
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
