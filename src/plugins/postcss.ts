import fs from 'fs'
import path from 'path'
import { Plugin } from 'esbuild'
import { getPostcss } from '../utils'

export const postcssPlugin = (): Plugin => {
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
        } catch (error) {
          if (error.message.includes('No PostCSS Config found in')) {
            const result = { plugins: [], options: {} }
            return result
          }
          throw error
        }
      }

      build.onLoad({ filter: /\.css$/ }, async (args) => {
        const contents = await fs.promises.readFile(args.path, 'utf8')

        // Load postcss config
        const { plugins, options } = await getPostcssConfig(args.path)

        // Return if no postcss plugins are supplied
        if (!plugins || plugins.length === 0) {
          return {
            contents,
            loader: 'css',
          }
        }

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

        // Tranform CSS
        const result = await postcss
          ?.default(plugins)
          .process(contents, { ...options, from: args.path })

        return {
          contents: result.css,
          loader: 'css',
        }
      })
    },
  }
}
