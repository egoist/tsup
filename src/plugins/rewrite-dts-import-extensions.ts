import type { Plugin } from 'rollup'

const RELATIVE_TS_IMPORT_PATTERN =
  /(?<=(?:from\s+|import\s*\(|require\s*\()['"])(\.\.?\/[^'"]*)(\.(?:ts|tsx|mts|cts))(\?[^'"]*)?(?=['"])/g

const getOutputExtension = (tsExt: string, outputPath: string): string => {
  if (tsExt === '.mts') return '.mjs'
  if (tsExt === '.cts') return '.cjs'
  if (outputPath.endsWith('.mjs') || outputPath.endsWith('.d.mts'))
    return '.mjs'
  if (outputPath.endsWith('.cjs') || outputPath.endsWith('.d.cts'))
    return '.cjs'
  return '.js'
}

export const rewriteDtsImportExtensionsPlugin = (): Plugin => ({
  name: 'tsup:rewrite-dts-import-extensions',
  renderChunk(code, chunk) {
    let touched = false
    const rewritten = code.replace(
      RELATIVE_TS_IMPORT_PATTERN,
      (_, pathWithoutExt, tsExt, query = '') => {
        touched = true
        return (
          pathWithoutExt + getOutputExtension(tsExt, chunk.fileName) + query
        )
      },
    )
    if (!touched) return null
    return { code: rewritten, map: null }
  },
})
