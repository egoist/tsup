import fs from 'fs'
import path from 'path'
import { Plugin } from 'esbuild'
import { localRequire } from '../utils'

export const sveltePlugin = ({ css }: { css?: Set<string> }): Plugin => {
  return {
    name: 'svelte',

    setup(build) {
      let svelte: typeof import('svelte/compiler')

      build.onLoad({ filter: /\.svelte$/ }, async (args) => {
        svelte = svelte || localRequire('svelte/compiler')

        if (!svelte) {
          return {
            errors: [{ text: `You need to install "svelte" in your project` }],
          }
        }

        // This converts a message in Svelte's format to esbuild's format
        let convertMessage = ({ message, start, end }: any) => {
          let location
          if (start && end) {
            let lineText = source.split(/\r\n|\r|\n/g)[start.line - 1]
            let lineEnd = start.line === end.line ? end.column : lineText.length
            location = {
              file: filename,
              line: start.line,
              column: start.column,
              length: lineEnd - start.column,
              lineText,
            }
          }
          return { text: message, location }
        }

        // Load the file from the file system
        let source = await fs.promises.readFile(args.path, 'utf8')
        let filename = path.relative(process.cwd(), args.path)

        // Convert Svelte syntax to JavaScript
        try {
          const result = svelte.compile(source, {
            filename,
            css: false,
          })
          if (css && result.css) {
            css.add(result.css.code)
          }
          let contents =
            result.js.code + `//# sourceMappingURL=` + result.js.map.toUrl()
          return { contents, warnings: result.warnings.map(convertMessage) }
        } catch (e) {
          return { errors: [convertMessage(e)] }
        }
      })
    },
  }
}
