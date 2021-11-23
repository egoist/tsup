import fs from 'fs'
import path from 'path'
import { Plugin } from 'esbuild'
import { localRequire } from '../utils'

const useSvelteCssExtension = (p: string) =>
  p.replace(/\.svelte$/, '.svelte.css')

export const sveltePlugin = ({
  css,
}: {
  css?: Map<string, string>
}): Plugin => {
  return {
    name: 'svelte',

    setup(build) {
      let svelte: typeof import('svelte/compiler')

      build.onResolve({ filter: /\.svelte\.css$/ }, (args) => {
        return {
          path: path.relative(
            process.cwd(),
            path.join(args.resolveDir, args.path)
          ),
          namespace: 'svelte-css',
        }
      })

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

          let contents = result.js.code
          if (css && result.css.code) {
            const cssPath = useSvelteCssExtension(filename)
            css.set(cssPath, result.css.code)
            // Directly prepend the `import` statement as sourcemap doesn't matter for now
            // If that's need we should use `magic-string`
            contents =
              `import '${useSvelteCssExtension(path.basename(args.path))}';` +
              contents
          }
          return { contents, warnings: result.warnings.map(convertMessage) }
        } catch (e) {
          return { errors: [convertMessage(e)] }
        }
      })
    },
  }
}
