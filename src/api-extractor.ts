import path from 'node:path'
import fs from 'node:fs'
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
  readDtsOutputManifest,
  toAbsolutePath,
  writeDtsOutputManifest,
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
    newlineKind: 'lf',
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
): Promise<string[]> {
  if (!options.experimentalDts || !options.experimentalDts?.entry) {
    return []
  }

  /**
   * `.tsup/declaration` directory
   */
  const declarationDir = ensureTempDeclarationDir()
  const outDir = options.outDir || 'dist'
  const pkg = await loadPkg(process.cwd())
  const dtsExtension = defaultOutExtension({ format, pkgType: pkg.type }).dts
  const tsconfig = options.tsconfig || 'tsconfig.json'

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

  rollupDtsFile(dtsInputFilePath, dtsOutputFilePath, tsconfig)

  const written = [dtsOutputFilePath]

  for (let [out, sourceFileName] of Object.entries(
    options.experimentalDts.entry,
  )) {
    /**
     * Source file name (`src/index.ts`)
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
     * Output file name (`dist/index.d.ts`)
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

    // Find all declarations that are exported from the current source file
    const currentExports = exports.filter(
      (declaration) => declaration.sourceFileName === sourceFileName,
    )

    writeFileSync(
      outFileName,
      formatDistributionExports(currentExports, outFileName, dtsOutputFilePath),
    )
    written.push(outFileName)
  }

  return written.map((file) => path.resolve(file))
}

async function cleanDtsFiles(options: NormalizedOptions) {
  const entry = options.experimentalDts?.entry
  if (!options.clean || !entry) {
    return
  }
  const outDir = path.resolve(options.outDir || 'dist')
  const pkg = await loadPkg(process.cwd())
  // Only remove the files this step generates (the intermediate rollup file
  // plus each entry output, per format). Anything else ending in `.d.ts`
  // (e.g. files copied from `publicDir`) must be left alone.
  // See https://github.com/egoist/tsup/issues/1366
  const precise = options.format.flatMap((format) => {
    const dtsExtension = defaultOutExtension({ format, pkgType: pkg.type }).dts
    return [
      path.join(outDir, `_tsup-dts-rollup${dtsExtension}`),
      ...Object.keys(entry).map((out) =>
        path.join(outDir, `${out}${dtsExtension}`),
      ),
    ]
  })
  // Also remove outputs of entries that no longer exist
  const previous = (await readDtsOutputManifest()).filter((file) =>
    file.startsWith(`${outDir}${path.sep}`),
  )
  const files = [...new Set([...precise, ...previous])]
  await Promise.all(files.map((file) => fs.promises.rm(file, { force: true })))
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
    await cleanDtsFiles(options)
    const written: string[] = []
    for (const format of options.format) {
      written.push(...(await rollupDtsFiles(options, exports, format)))
    }
    // Remember generated files so a later `clean` can remove outputs of
    // entries that no longer exist. After a clean build the manifest holds
    // exactly what was written; otherwise it accumulates.
    const previous = await readDtsOutputManifest()
    await writeDtsOutputManifest(
      options.clean ? written : [...previous, ...written],
    )
    logger.success('dts', `⚡️ Build success in ${getDuration()}`)
  } catch (error) {
    handleError(error)
    logger.error('dts', 'Build error')
  }
}
