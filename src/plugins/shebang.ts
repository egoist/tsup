import { Plugin } from '../plugin'

export const shebang = (): Plugin => {
  return {
    name: 'shebang',

    renderChunk(_, info) {
      if (info.type === 'chunk' && /\.(cjs|js|mjs)$/.test(info.path)) {
        if (info.code.startsWith('#!')) {
          info.mode = 0o755
        }
      }
    },
  }
}
