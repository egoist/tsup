import fs from 'node:fs'
import path from 'node:path'
import { type Plugin, transform } from 'esbuild'
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
      let sveltePreprocessor: typeof import('svelte-preprocess').default

      build.onResolve({ filter: /\.svelte\.css$/ }, (args) => {
        return {
          path: path.relative(
            process.cwd(),
            path.join(args.resolveDir, args.path),
          ),
          namespace: 'svelte-css',
        }
      })

      build.onLoad({ filter: /\.svelte$/ }, async (args) => {
        svelte = svelte || localRequire('svelte/compiler')
        sveltePreprocessor =
          sveltePreprocessor || localRequire('svelte-preprocess')

        if (!svelte) {
          return {
            errors: [{ text: `You need to install "svelte" in your project` }],
          }
        }

        // This converts a message in Svelte's format to esbuild's format
        const convertMessage = ({ message, start, end }: any) => {
          let location
          if (start && end) {
            const lineText = source.split(/\r\n|\r|\n/g)[start.line - 1]
            const lineEnd =
              start.line === end.line ? end.column : lineText.length
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
        const source = await fs.promises.readFile(args.path, 'utf8')
        const filename = path.relative(process.cwd(), args.path)

        // Convert Svelte syntax to JavaScript
        try {
          const preprocess = await svelte.preprocess(
            source,
            sveltePreprocessor
              ? sveltePreprocessor({
                  sourceMap: true,
                  typescript: {
                    compilerOptions: {
                      verbatimModuleSyntax: true,
                    },
                  },
                })
              : {
                  async script({ content, attributes }) {
                    if (attributes.lang !== 'ts') return { code: content }

                    const { code, map } = await transform(content, {
                      sourcefile: args.path,
                      loader: 'ts',
                      sourcemap: true,
                      tsconfigRaw: {
                        compilerOptions: {
                          verbatimModuleSyntax: true,
                        },
                      },
                      logLevel: build.initialOptions.logLevel,
                    })
                    return {
                      code,
                      map,
                    }
                  },
                },
            {
              filename: args.path,
            },
          )
          const result = svelte.compile(preprocess.code, {
            filename,
            css: 'external',
          })

          let contents = result.js.code
          if (css && result.css && result.css.code) {
            const cssPath = useSvelteCssExtension(filename)
            css.set(cssPath, result.css.code)
            // Directly prepend the `import` statement as sourcemap doesn't matter for now
            // If that's need we should use `magic-string`
            contents = `import '${useSvelteCssExtension(path.basename(args.path))}';${
              contents
            }`
          }
          return { contents, warnings: result.warnings.map(convertMessage) }
        } catch (error) {
          return { errors: [convertMessage(error)] }
        }
      })
    },
  }
}
