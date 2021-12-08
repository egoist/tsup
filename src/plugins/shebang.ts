import fs from 'fs'
import { Plugin } from '../plugin'

export const shebang = (): Plugin => {
  const executableFiles: Set<string> = new Set()

  return {
    name: 'shebang',

    buildStart() {
      executableFiles.clear()
    },

    renderChunk(_, info) {
      if (info.type === 'chunk' && /\.(cjs|js|mjs)$/.test(info.path)) {
        if (info.code.startsWith('#!')) {
          executableFiles.add(info.path)
        }
      }
    },

    async buildEnd() {
      await Promise.all(
        [...executableFiles].map(async (file) => {
          await fs.promises.chmod(file, 0o755)
        })
      )
    },
  }
}
