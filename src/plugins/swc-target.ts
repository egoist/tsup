import { PrettyError } from '../errors'
import { localRequire } from '../utils'
import type { ModuleConfig } from '@swc/core'
import type { Plugin } from '../plugin'

const TARGETS = ['es5', 'es3'] as const

export const swcTarget = (): Plugin => {
  let enabled = false
  let target: (typeof TARGETS)[number]

  return {
    name: 'swc-target',

    esbuildOptions(options) {
      if (
        typeof options.target === 'string' &&
        TARGETS.includes(options.target as any)
      ) {
        target = options.target as any
        options.target = 'es2020'
        enabled = true
      }
    },

    async renderChunk(code, info) {
      if (!enabled || !/\.(cjs|mjs|js)$/.test(info.path)) {
        return
      }
      const swc: typeof import('@swc/core') = localRequire('@swc/core')

      if (!swc) {
        throw new PrettyError(
          `@swc/core is required for ${target} target. Please install it with \`npm install @swc/core -D\``,
        )
      }

      const result = await swc.transform(code, {
        filename: info.path,
        sourceMaps: this.options.sourcemap,
        minify: Boolean(this.options.minify),
        jsc: {
          target,
          parser: {
            syntax: 'ecmascript',
          },
          minify:
            this.options.minify === true
              ? {
                  compress: false,
                  mangle: {
                    reserved: this.options.globalName
                      ? [this.options.globalName]
                      : [],
                  },
                }
              : undefined,
        },
        module: {
          type: this.format === 'cjs' ? 'commonjs' : 'es6',
        } satisfies ModuleConfig,
      })
      return {
        code: result.code,
        map: result.map,
      }
    },
  }
}
