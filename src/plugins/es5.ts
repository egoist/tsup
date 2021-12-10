import { Plugin } from '../plugin'
import { localRequire } from '../utils'

export const es5 = (): Plugin => {
  let enabled = false
  return {
    name: 'es5-target',

    esbuildOptions(options) {
      if (options.target === 'es5') {
        options.target = 'es2020'
        enabled = true
      }
    },

    async renderChunk(code, info) {
      if (!enabled || !/\.(cjs|js)$/.test(info.path)) {
        return
      }
      const swc: typeof import('@swc/core') = localRequire('@swc/core')
      const result = await swc.transform(code, {
        filename: info.path,
        sourceMaps: this.options.sourcemap,
        jsc: {
          target: 'es5',
          parser: {
            syntax: 'ecmascript',
          },
        },
      })
      return {
        code: result.code,
        map: result.map,
      }
    },
  }
}
