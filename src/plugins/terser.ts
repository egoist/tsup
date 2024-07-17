import { PrettyError } from '../errors'
import { localRequire } from '../utils'
import type { MinifyOptions } from 'terser'
import type { Logger } from '../log'
import type { Format, Options } from '../options'
import type { Plugin } from '../plugin'

export const terserPlugin = ({
  minifyOptions,
  format,
  terserOptions = {},
  globalName,
  logger,
}: {
  minifyOptions: Options['minify']
  format: Format
  terserOptions?: MinifyOptions
  globalName?: string
  logger: Logger
}): Plugin => {
  return {
    name: 'terser',

    async renderChunk(code, info) {
      if (minifyOptions !== 'terser' || !/\.(cjs|js|mjs)$/.test(info.path))
        return

      const terser: typeof import('terser') | undefined = localRequire('terser')

      if (!terser) {
        throw new PrettyError(
          'terser is required for terser minification. Please install it with `npm install terser -D`',
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
          { ...defaultOptions, ...terserOptions },
        )

        logger.info('TERSER', 'Minifying with Terser')

        if (!minifiedOutput.code) {
          logger.error('TERSER', 'Failed to minify with terser')
        }

        logger.success('TERSER', 'Terser Minification success')

        return { code: minifiedOutput.code!, map: minifiedOutput.map }
      } catch (error) {
        logger.error('TERSER', 'Failed to minify with terser')
        logger.error('TERSER', error)
      }

      return { code, map: info.map }
    },
  }
}
