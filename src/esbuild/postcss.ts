import fs from 'fs'
import path from 'path'
import { Plugin, transform } from 'esbuild'
import { getPostcss } from '../utils'

export const postcssPlugin = ({
  css,
  inject,
}: {
  css?: Map<string, string>
  inject?: boolean
}): Plugin => {
  return {
    name: 'postcss',

    setup(build) {
      const configCache = new Map()

      const getPostcssConfig = async (file: string) => {
        const loadConfig = require('postcss-load-config')

        if (configCache.has(file)) {
          return configCache.get(file)
        }

        try {
          const result = await loadConfig({}, path.dirname(file))
          configCache.set(file, result)
          return result
        } catch (error: any) {
          if (error.message.includes('No PostCSS Config found in')) {
            const result = { plugins: [], options: {} }
            return result
          }
          throw error
        }
      }

      build.onResolve({ filter: /^#style-inject$/ }, () => {
        return { path: '#style-inject', namespace: '#style-inject' }
      })

      build.onLoad(
        { filter: /^#style-inject$/, namespace: '#style-inject' },
        () => {
          return {
            // Taken from https://github.com/egoist/style-inject/blob/master/src/index.js (MIT)
            contents: `
          export default function styleInject(css, { insertAt } = {}) {
            if (!css || typeof document === 'undefined') return
          
            const head = document.head || document.getElementsByTagName('head')[0]
            const style = document.createElement('style')
            style.type = 'text/css'
          
            if (insertAt === 'top') {
              if (head.firstChild) {
                head.insertBefore(style, head.firstChild)
              } else {
                head.appendChild(style)
              }
            } else {
              head.appendChild(style)
            }
          
            if (style.styleSheet) {
              style.styleSheet.cssText = css
            } else {
              style.appendChild(document.createTextNode(css))
            }
          }
          `,
            loader: 'js',
          }
        }
      )

      build.onLoad({ filter: /\.css$/ }, async (args) => {
        let contents: string

        if (css && args.path.endsWith('.svelte.css')) {
          contents = css.get(args.path)!
        } else {
          contents = await fs.promises.readFile(args.path, 'utf8')
        }

        // Load postcss config
        const { plugins, options } = await getPostcssConfig(args.path)

        if (plugins || plugins.length > 0) {
          // Load postcss
          const postcss = getPostcss()
          if (!postcss) {
            return {
              errors: [
                {
                  text: `postcss is not installed`,
                },
              ],
            }
          }

          // Transform CSS
          const result = await postcss
            ?.default(plugins)
            .process(contents, { ...options, from: args.path })

          contents = result.css
        }

        if (inject) {
          contents = (
            await transform(contents, {
              minify: build.initialOptions.minify,
              minifyIdentifiers: build.initialOptions.minifyIdentifiers,
              minifySyntax: build.initialOptions.minifySyntax,
              minifyWhitespace: build.initialOptions.minifyWhitespace,
              loader: 'css',
            })
          ).code

          contents = `import styleInject from '#style-inject';styleInject(${JSON.stringify(
            contents
          )})`

          return {
            contents,
            loader: 'js',
          }
        }

        return {
          contents,
          loader: 'css',
        }
      })
    },
  }
}
