import { readFile } from 'fs/promises'
import type { Plugin } from 'esbuild'
import { join } from 'path'

/**
 * Importing a resource as a string
 */
export const importRawPlugin = (): Plugin => {
  return {
    name: 'importRawPlugin',
    setup(build) {
      const rawReg = /(?:\?|&)raw(?:&|$)/
      build.onResolve({ filter: rawReg }, (args) => {
        const { resolveDir, path } = args
        return { path: join(resolveDir, path) }
      })
      build.onLoad({ filter: rawReg }, async (args) => {
        const path = args.path.replace(rawReg, '')
        const content = await readFile(path, 'utf-8')
        return { contents: JSON.stringify(content), loader: 'text' }
      })
    },
  }
}
