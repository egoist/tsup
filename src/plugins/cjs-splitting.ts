// Workaround to enable code splitting for cjs format
// Manually transform esm to cjs
// TODO: remove this once esbuild supports code splitting for cjs natively
import path from 'path'
import { Plugin } from '../plugin'

export const cjsSplitting = (): Plugin => {
  return {
    name: 'cjs-splitting',

    async renderChunk(code, info) {
      if (
        !this.splitting ||
        this.format !== 'cjs' ||
        info.type !== 'chunk' ||
        !/\.(js|cjs)$/.test(info.path)
      ) {
        return
      }

      const { transform } = await import('sucrase')

      const result = transform(code, {
        filePath: info.path,
        transforms: ['imports'],
        sourceMapOptions: this.options.sourcemap
          ? {
              compiledFilename: info.path,
            }
          : undefined,
      })

      return {
        code: result.code,
        map: result.sourceMap,
      }
    },
  }
}
