import { MinifyOptions } from 'terser'
import { PrettyError } from '../errors'
import { createLogger } from '../log'
import { Format, Options } from '../options'
import { Plugin } from '../plugin'
import { localRequire } from '../utils'

const logger = createLogger()

export const terserPlugin = ({
  minifyOptions,
  format,
  terserOptions = {},
  globalName
}: {
  minifyOptions: Options['minify']
  format: Format
  terserOptions?: MinifyOptions,
  globalName?: string
}): Plugin => {
  return {
    name: 'terser',

    async renderChunk(code, info) {
      if (minifyOptions !== 'terser' || !/\.(cjs|js|mjs)$/.test(info.path))
        return

      const terser: typeof import('terser') | undefined = localRequire('terser')

      if (!terser) {
        throw new PrettyError(
          'terser is required for terser minification. Please install it with `npm install terser -D`'
        )
      }

      const { minify } = terser

      const defaultOptions: MinifyOptions = {}

      if (format === 'esm') {
        defaultOptions.module = true
      } else if (!(format === 'iife' && globalName !== undefined)) {
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
