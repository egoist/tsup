import MagicString from 'magic-string'
import { Plugin } from '../plugin'

export const embed = (): Plugin => {
  return {
    name: 'embed',

    renderChunk(code, info) {
      if (info.type !== 'chunk' || !/\.(js|cjs|mjs)$/.test(info.path)) return

      if (!this.options.sourcemap) {
        const
      }
    },
  }
}
