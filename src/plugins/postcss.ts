import fs from 'fs'
import path from 'path'
import {Plugin} from 'esbuild'
import { getPostcss } from '../utils'


export const postcssPlugin: Plugin = {
  name: 'postcss',

  setup(build) {
    const configCache = new Map()

    build.onLoad({filter: /\.css$/}, async args => {
      const loadConfig = await import('postcss-load-config')
    
      const contents = await fs.promises.readFile(args.path, 'utf8')

      // Load postcss config
      const {plugins, options} = configCache.get(args.path) || (await loadConfig({}, path.dirname(args.path)))

      configCache.set(args.path, {plugins, options})

      // Return if no postcss plugins are supplied
      if (!plugins || plugins.length === 0) {
        return {
          contents,
          loader: 'css'
        }
      }

      // Load postcss
      const postcss = getPostcss()
      if (!postcss) {
        return {
          errors: [{
            text: `postcss is not installed`
          }]
        }
      }

      // Tranform CSS
      const result = await postcss?.default(plugins).process(contents, {...options, from: args.path})

      return {
        contents: result.css,
        loader: 'css',
      }
    })
  }
}