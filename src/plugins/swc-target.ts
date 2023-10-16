import { PrettyError } from '../errors'
import { Plugin } from '../plugin'
import { localRequire } from '../utils'

const TARGETS = ['es5', 'es3'] as const

export const swcTarget = (): Plugin => {
  let enabled = false
  let target: typeof TARGETS[number]

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
      if (!enabled || !/\.(cjs|js)$/.test(info.path) || this.format !== 'cjs') {
        return
      }
      const swc: typeof import('@swc/core') = localRequire('@swc/core')

      if (!swc) {
        throw new PrettyError(
          `@swc/core is required for ${target} target. Please install it with \`npm install @swc/core -D\``
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
      })
      return {
        code: result.code,
        map: result.map,
      }
    },
  }
}
