import { PluginImpl } from 'rollup'

const TSUP_REQUIRE_ID = '__TSUP_REQUIRE_ID__'

const JS_RE = /\.[jt]sx?$/

// Prevent @rollup/plugin-commonjs from replacing `require.cache`
export const restoreRequirePlugin: PluginImpl = () => {
  return {
    name: 'restore-require',

    transform(code, id) {
      if (JS_RE.test(id)) {
        code = code.replace(/require([^\(])/g, `${TSUP_REQUIRE_ID}$1`)

        // Dynamic require: `require(file)`
        code = code.replace(/require\(([a-zA-Z0-9_]+)\)/g, (_, p1) => {
          return `${TSUP_REQUIRE_ID}(${p1})`
        })
      }
      return code
    },

    renderChunk(code, chunk) {
      if (chunk.fileName.endsWith('.js')) {
        code = code.replace(/__TSUP_REQUIRE_ID__/g, 'require')
      }
      return code
    },
  }
}
