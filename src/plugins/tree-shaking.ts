import { rollup, type TreeshakingOptions, type TreeshakingPreset } from 'rollup'
import type { Plugin } from '../plugin'
import path from 'path'

export type TreeshakingStrategy =
  | boolean
  | TreeshakingOptions
  | TreeshakingPreset

export const treeShakingPlugin = ({
  treeshake,
  name,
  silent,
}: {
  treeshake?: TreeshakingStrategy
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
        treeshake,
        makeAbsoluteExternalsRelative: false,
        preserveEntrySignatures: 'exports-only',
        onwarn: silent ? () => {} : undefined,
      })

      const result = await bundle.generate({
        interop: 'auto',
        format: this.format,
        file: info.path,
        sourcemap: !!this.options.sourcemap,
        name,
      })

      for (const file of result.output) {
        if (file.type === 'chunk') {
          if (file.fileName === path.basename(info.path)) {
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
