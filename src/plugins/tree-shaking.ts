import { rollup, TreeshakingOptions, TreeshakingPreset } from 'rollup'
import hashbang from 'rollup-plugin-hashbang'
import { Plugin } from '../plugin'

export type TreeshakingStrategy =
  | boolean
  | TreeshakingOptions
  | TreeshakingPreset

export const treeShakingPlugin = ({
  treeshake,
  name
}: {
  treeshake?: TreeshakingStrategy,
  name?: string
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
              if (id === info.path) return code
            },
          },
        ],
        treeshake: treeshake,
        makeAbsoluteExternalsRelative: false,
        preserveEntrySignatures: 'exports-only',
      })

      const result = await bundle.generate({
        format: this.format,
        file: 'out.js',
        sourcemap: !!this.options.sourcemap,
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
