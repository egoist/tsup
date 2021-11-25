import { Plugin } from 'esbuild'
import { tsconfigPathsToRegExp, match } from 'bundle-require'

// Must not start with "/" or "./" or "../"
const NON_NODE_MODULE_RE = /^[^.\/]|^\.[^.\/]|^\.\.[^\/]/

export const externalPlugin = ({
  patterns,
  skipNodeModulesBundle,
  tsconfigResolvePaths,
}: {
  patterns?: (string | RegExp)[]
  skipNodeModulesBundle?: boolean
  tsconfigResolvePaths?: Record<string, any>
}): Plugin => {
  return {
    name: `external`,

    setup(build) {
      if (skipNodeModulesBundle) {
        const resolvePatterns = tsconfigPathsToRegExp(
          tsconfigResolvePaths || {}
        )
        build.onResolve({ filter: /.*/ }, (args) => {
          // Resolve `paths` from tsconfig
          if (match(args.path, resolvePatterns)) {
            return
          }
          if (NON_NODE_MODULE_RE.test(args.path)) {
            return {
              path: args.path,
              external: true,
            }
          }
        })
      }

      if (!patterns || patterns.length === 0) return

      build.onResolve({ filter: /.*/ }, (args) => {
        const external = patterns.some((p) => {
          if (p instanceof RegExp) {
            return p.test(args.path)
          }
          return args.path === p
        })

        if (external) {
          return { path: args.path, external }
        }
      })
    },
  }
}
