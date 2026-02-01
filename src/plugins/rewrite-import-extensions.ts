import type { Plugin } from '../plugin'

const getOutputExtension = (tsExt: string, outputPath: string): string => {
  if (tsExt === '.mts') return '.mjs'
  if (tsExt === '.cts') return '.cjs'
  if (outputPath.endsWith('.mjs')) return '.mjs'
  if (outputPath.endsWith('.cjs')) return '.cjs'
  return '.js'
}

const RELATIVE_IMPORT_PATTERN =
  /(?<=(?:from\s+|import\s*\(|require\s*\()['"])(\.\.?\/[^'"]*)(\.(?:ts|tsx|mts|cts))(?=['"])/g

export const rewriteImportExtensions = (): Plugin => {
  return {
    name: 'rewrite-import-extensions',

    renderChunk(code, info) {
      if (!/\.(js|mjs|cjs)$/.test(info.path)) return

      let touched = false

      const rewritten = code.replace(
        RELATIVE_IMPORT_PATTERN,
        (_, pathWithoutExt, tsExt) => {
          touched = true
          return pathWithoutExt + getOutputExtension(tsExt, info.path)
        },
      )

      if (!touched) return

      return { code: rewritten }
    },
  }
}
