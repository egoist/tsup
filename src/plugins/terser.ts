import { MinifyOptions } from 'terser'
import { createLogger } from '../log'
import { Format, Options } from '../options'
import { Plugin } from '../plugin'

const logger = createLogger()

export const terserPlugin = ({
  minifyOptions,
  format,
  terserOptions = {},
}: {
  minifyOptions: Options['minify']
  format: Format
  terserOptions?: MinifyOptions
}): Plugin => {
  return {
    name: 'terser',

    async renderChunk(code, info) {
      if (minifyOptions !== 'terser' || !/\.(cjs|js|mjs)$/.test(info.path))
        return

      const { minify } = await import('terser')

      const defaultOptions: MinifyOptions = {}

      if (format === 'esm') {
        defaultOptions.module = true
      } else {
        defaultOptions.toplevel = true
      }

      try {
        const minifiedOutput = await minify(
          { [info.path]: code },
          { ...defaultOptions, ...terserOptions }
        )

        logger.info('TERSER', 'Minifying with Terser')

        if (!minifiedOutput.code) {
          logger.error('TERSER', 'Failed to minify with terser')
        }

        logger.success('TERSER', 'Terser Minification success')

        return { code: minifiedOutput.code!, map: minifiedOutput.map }
      } catch (e) {
        logger.error('TERSER', 'Failed to minify with terser')
        logger.error('TERSER', e)
      }

      return { code, map: info.map }
    },
  }
}
