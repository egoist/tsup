import { Plugin } from 'esbuild'

// Must not start with "/" or "./" or "../"
const NON_NODE_MODULE_RE = /^[^.\/]|^\.[^.\/]|^\.\.[^\/]/

export const externalPlugin = ({
  patterns,
  skipNodeModulesBundle,
}: {
  patterns?: (string | RegExp)[]
  skipNodeModulesBundle?: boolean
}): Plugin => {
  return {
    name: `external`,

    setup(build) {
      if (skipNodeModulesBundle) {
        build.onResolve({ filter: NON_NODE_MODULE_RE }, (args) => ({
          path: args.path,
          external: true,
        }))
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
