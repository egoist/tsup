import type { Plugin } from 'esbuild'
import { tsconfigPathsToRegExp, match } from 'bundle-require'

// Must not start with "/" or "./" or "../" or "C:\" or be the exact strings ".." or "."
const NON_NODE_MODULE_RE = /^[A-Z]:[\\\/]|^\.{0,2}[\/]|^\.{1,2}$/

export const externalPlugin = ({
  external,
  noExternal,
  skipNodeModulesBundle,
  tsconfigResolvePaths,
}: {
  external?: (string | RegExp)[]
  noExternal?: (string | RegExp)[]
  skipNodeModulesBundle?: boolean
  tsconfigResolvePaths?: Record<string, string[]>
}): Plugin => {
  return {
    name: `external`,

    setup(build) {
      if (skipNodeModulesBundle) {
        const resolvePatterns = tsconfigPathsToRegExp(
          tsconfigResolvePaths || {},
        )
        build.onResolve({ filter: /.*/ }, (args) => {
          // Resolve `paths` from tsconfig
          if (match(args.path, resolvePatterns)) {
            return
          }
          // Respect explicit external/noExternal conditions
          if (match(args.path, noExternal)) {
            return
          }
          if (match(args.path, external)) {
            return { external: true }
          }
          // Exclude any other import that looks like a Node module
          if (!NON_NODE_MODULE_RE.test(args.path)) {
            return {
              path: args.path,
              external: true,
            }
          }
        })
      } else {
        build.onResolve({ filter: /.*/ }, (args) => {
          // Respect explicit external/noExternal conditions
          if (match(args.path, noExternal)) {
            return
          }
          if (match(args.path, external)) {
            return { external: true }
          }
        })
      }
    },
  }
}
