/**
 * Use SWC to emit decorator metadata
 */
import path from 'node:path'
import { localRequire } from '../utils'
import type { JscConfig } from '@swc/core'
import type { Plugin } from 'esbuild'
import type { Logger } from '../log'

export const swcPlugin = ({ logger }: { logger: Logger }): Plugin => {
  return {
    name: 'swc',

    setup(build) {
      const swc: typeof import('@swc/core') = localRequire('@swc/core')

      if (!swc) {
        logger.warn(
          build.initialOptions.format!,
          `You have emitDecoratorMetadata enabled but @swc/core was not installed, skipping swc plugin`,
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
          sourceMaps: true,
          configFile: false,
          swcrc: false,
        })

        let code = result.code
        if (result.map) {
          const map: { sources: string[] } = JSON.parse(result.map)
          // Make sure sources are relative path
          map.sources = map.sources.map((source) => {
            return path.isAbsolute(source)
              ? path.relative(path.dirname(args.path), source)
              : source
          })
          code += `//# sourceMappingURL=data:application/json;base64,${Buffer.from(
            JSON.stringify(map),
          ).toString('base64')}`
        }
        return {
          contents: code,
        }
      })
    },
  }
}
