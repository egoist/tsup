import path from 'node:path'
import { handleError } from './errors'
import { loadPkg } from './load'
import { createLogger } from './log'
import {
  defaultOutExtension,
  ensureTempDeclarationDir,
  getApiExtractor,
  removeFiles,
  toAbsolutePath,
} from './utils'
import type { Format, NormalizedOptions } from './options'
import type {
  ExtractorResult,
  IConfigFile,
  IExtractorConfigPrepareOptions,
} from '@microsoft/api-extractor'

const logger = createLogger()

function rollupDtsFile(
  inputFilePath: string,
  outputFilePath: string,
  tsconfigFilePath: string,
) {
  const cwd = process.cwd()
  const packageJsonFullPath = path.join(cwd, 'package.json')
  const configObject: IConfigFile = {
    mainEntryPointFilePath: inputFilePath,
    apiReport: {
      enabled: false,

      // `reportFileName` is not been used. It's just to fit the requirement of API Extractor.
      reportFileName: 'tsup-report.api.md',
    },
    docModel: { enabled: false },
    dtsRollup: {
      enabled: true,
      untrimmedFilePath: outputFilePath,
    },
    tsdocMetadata: { enabled: false },
    compiler: {
      tsconfigFilePath,
    },
    projectFolder: cwd,
  }
  const prepareOptions: IExtractorConfigPrepareOptions = {
    configObject,
    configObjectFullPath: undefined,
    packageJsonFullPath,
  }

  const imported = getApiExtractor()
  if (!imported) {
    throw new Error(
      `@microsoft/api-extractor is not installed. Please install it first.`,
    )
  }
  const { ExtractorConfig, Extractor } = imported

  const extractorConfig = ExtractorConfig.prepare(prepareOptions)

  // Invoke API Extractor
  const extractorResult: ExtractorResult = Extractor.invoke(extractorConfig, {
    // Equivalent to the "--local" command-line parameter
    localBuild: true,

    // Equivalent to the "--verbose" command-line parameter
    showVerboseMessages: true,
  })

  if (!extractorResult.succeeded) {
    throw new Error(
      `API Extractor completed with ${extractorResult.errorCount} errors and ${extractorResult.warningCount} warnings when processing ${inputFilePath}`,
    )
  }
}

async function rollupDtsFiles(
  options: NormalizedOptions,
  exports: {
    /**
     * **Source file name** to **Output file name** mapping.
     * (`src/index.ts` \=> `.tsup/declaration/index.d.ts`)
     */
    fileMapping: Map<string, string>
  },
  format: Format,
) {
  if (!options.experimentalDts || !options.experimentalDts?.entry) {
    return
  }

  /**
   * **`.tsup/declaration`** directory
   */
  const declarationDir = ensureTempDeclarationDir()
  const outDir = options.outDir || 'dist'
  const pkg = await loadPkg(process.cwd())
  const dtsExtension = defaultOutExtension({ format, pkgType: pkg.type }).dts
  const tsconfig = options.tsconfig || 'tsconfig.json'

  for (let [out, sourceFileName] of Object.entries(
    options.experimentalDts.entry,
  )) {
    out = path.basename(out)
    /**
     * **Source file name** (`src/index.ts`)
     *
     * @example
     *
     * ```ts
     * import { defineConfig } from 'tsup'
     *
     * export default defineConfig({
     *   entry: { index: 'src/index.ts' },
     *   // Here `src/index.ts` is our `sourceFileName`.
     * })
     * ```
     */
    sourceFileName = toAbsolutePath(sourceFileName)
    /**
     * **Output file name** (`dist/index.d.ts`)
     *
     * @example
     *
     * ```ts
     * import { defineConfig } from 'tsup'
     *
     * export default defineConfig({
     *  entry: { index: 'src/index.ts' },
     * // Here `dist/index.d.ts` is our `outFileName`.
     * })
     * ```
     */
    const outFileName = path.join(outDir, out + dtsExtension)

    /**
     * **Input file path** (`.tsup/declaration/index.d.ts`)
     */
    const inputFilePath =
      exports.fileMapping.get(sourceFileName) ||
      `${path.join(declarationDir, out)}.d.ts`

    rollupDtsFile(inputFilePath, outFileName, tsconfig)
  }
}

async function cleanDtsFiles(options: NormalizedOptions) {
  if (options.clean) {
    await removeFiles(['**/*.d.{ts,mts,cts}'], options.outDir)
  }
}

export async function runDtsRollup(
  options: NormalizedOptions,
  exports?: {
    /**
     * **Source file name** to **Output file name** mapping.
     * (`src/index.ts` \=> `.tsup/declaration/index.d.ts`)
     */
    fileMapping: Map<string, string>
  },
) {
  try {
    const start = Date.now()
    const getDuration = () => {
      return `${Math.floor(Date.now() - start)}ms`
    }
    logger.info('dts', 'Build start')

    if (!exports) {
      throw new Error('Unexpected internal error: dts exports is not defined')
    }
    await cleanDtsFiles(options)
    for (const format of options.format) {
      await rollupDtsFiles(options, exports, format)
    }
    logger.success('dts', `⚡️ Build success in ${getDuration()}`)
  } catch (error) {
    handleError(error)
    logger.error('dts', 'Build error')
  }
}
