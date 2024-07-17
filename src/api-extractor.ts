import path from 'node:path'
import { handleError } from './errors'
import {
  type ExportDeclaration,
  formatAggregationExports,
  formatDistributionExports,
} from './exports'
import { loadPkg } from './load'
import { createLogger } from './log'
import {
  defaultOutExtension,
  ensureTempDeclarationDir,
  getApiExtractor,
  removeFiles,
  toAbsolutePath,
  writeFileSync,
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
  exports: ExportDeclaration[],
  format: Format,
) {
  const declarationDir = ensureTempDeclarationDir()
  const outDir = options.outDir || 'dist'
  const pkg = await loadPkg(process.cwd())
  const dtsExtension = defaultOutExtension({ format, pkgType: pkg.type }).dts

  let dtsInputFilePath = path.join(
    declarationDir,
    `_tsup-dts-aggregation${dtsExtension}`,
  )
  // @microsoft/api-extractor doesn't support `.d.mts` and `.d.cts` file as a
  // entrypoint yet. So we replace the extension here as a temporary workaround.
  //
  // See the issue for more details:
  // https://github.com/microsoft/rushstack/pull/4196
  dtsInputFilePath = dtsInputFilePath
    .replace(/\.d\.mts$/, '.dmts.d.ts')
    .replace(/\.d\.cts$/, '.dcts.d.ts')

  const dtsOutputFilePath = path.join(outDir, `_tsup-dts-rollup${dtsExtension}`)

  writeFileSync(
    dtsInputFilePath,
    formatAggregationExports(exports, declarationDir),
  )

  rollupDtsFile(
    dtsInputFilePath,
    dtsOutputFilePath,
    options.tsconfig || 'tsconfig.json',
  )

  for (let [out, sourceFileName] of Object.entries(
    options.experimentalDts!.entry,
  )) {
    sourceFileName = toAbsolutePath(sourceFileName)
    const outFileName = path.join(outDir, out + dtsExtension)

    // Find all declarations that are exported from the current source file
    const currentExports = exports.filter(
      (declaration) => declaration.sourceFileName === sourceFileName,
    )

    writeFileSync(
      outFileName,
      formatDistributionExports(currentExports, outFileName, dtsOutputFilePath),
    )
  }
}

function cleanDtsFiles(options: NormalizedOptions) {
  if (options.clean) {
    removeFiles(['**/*.d.{ts,mts,cts}'], options.outDir)
  }
}

export async function runDtsRollup(
  options: NormalizedOptions,
  exports?: ExportDeclaration[],
) {
  try {
    const start = Date.now()
    const getDuration = () => {
      return `${Math.floor(Date.now() - start)}ms`
    }
    logger.info('dts', 'Build start')

    if (!exports) {
      throw new Error('Unexpected internal error: dts exports is not define')
    }
    cleanDtsFiles(options)
    for (const format of options.format) {
      await rollupDtsFiles(options, exports, format)
    }
    logger.success('dts', `⚡️ Build success in ${getDuration()}`)
  } catch (error) {
    handleError(error)
    logger.error('dts', 'Build error')
  }
}
