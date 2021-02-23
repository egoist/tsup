import { Plugin } from 'esbuild'

export const externalPlugin = (patterns?: (string | RegExp)[]): Plugin => {
  return {
    name: `external`,

    setup(build) {
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
        // return without `path` to use default path resolution logic
        return {}
      })
    },
  }
}
