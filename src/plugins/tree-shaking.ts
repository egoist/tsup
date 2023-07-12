import { rollup, TreeshakingOptions, TreeshakingPreset } from 'rollup'
import hashbang from 'rollup-plugin-hashbang'
import { Plugin } from '../plugin'

export type TreeshakingStrategy =
  | boolean
  | TreeshakingOptions
  | TreeshakingPreset

export const treeShakingPlugin = ({
  treeshake,
  name,
  silent,
}: {
  treeshake?: TreeshakingStrategy,
  name?: string
  silent?: boolean
}): Plugin => {
  return {
    name: 'tree-shaking',

    async renderChunk(code, info) {
      if (!treeshake || !/\.(cjs|js|mjs)$/.test(info.path)) return

      const bundle = await rollup({
        input: [info.path],
        plugins: [
          hashbang(),
          {
            name: 'tsup',
            resolveId(source) {
              if (source === info.path) return source
              return false
            },
            load(id) {
              if (id === info.path) return { code, map: info.map }
            },
          },
        ],
        treeshake: treeshake,
        makeAbsoluteExternalsRelative: false,
        preserveEntrySignatures: 'exports-only',
        onwarn: silent ? () => {} : undefined,
      })

      const result = await bundle.generate({
        interop: 'auto',
        format: this.format,
        file: 'out.js',
        sourcemap: this.options.sourcemap ? 'hidden' : false,
        name
      })

      for (const file of result.output) {
        if (file.type === 'chunk') {
          if (file.fileName.endsWith('out.js')) {
            return {
              code: file.code,
              map: file.map,
            }
          }
        }
      }
    },
  }
}
