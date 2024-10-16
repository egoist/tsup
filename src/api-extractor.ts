import path from 'node:path'
import { glob } from 'tinyglobby'
import { handleError } from './errors'
import { loadPkg } from './load'
import { createLogger } from './log'
import {
  defaultOutExtension,
  ensureTempDeclarationDir,
  getApiExtractor,
  removeFiles,
  toAbsolutePath,
  toObjectEntry,
} from './utils'
import type {
  ExperimentalDtsConfig,
  Format,
  NormalizedExperimentalDtsConfig,
  NormalizedOptions,
} from './options'
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
      throw new Error('Unexpected internal error: dts exports is not define')
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

/**
 * Normalizes the
 * {@linkcode NormalizedExperimentalDtsConfig | experimental DTS options}
 * by resolving entry paths and merging the provided
 * TypeScript configuration options.
 *
 * @param options - The options containing entry points and experimental DTS configuration.
 * @param tsconfig - The loaded TypeScript configuration data.
 * @returns The normalized experimental DTS configuration.
 *
 * @internal
 */
export const normalizeExperimentalDtsOptions = async (
  options: Partial<NormalizedOptions>,
  tsconfig: any,
) => {
  if (options.entry == null) {
    return
  }

  const experimentalDtsEntry = options.experimentalDts?.entry || options.entry

  /**
   * Resolves the entry paths for the experimental DTS configuration.
   * If the entry is a string or array of strings,
   * it uses {@linkcode glob | tinyglobby's glob function} to resolve
   * the potential glob patterns. If it's an `object`, it directly uses
   * the provided entry object.
   *
   * @example
   *
   * ```ts
   * import { defineConfig } from 'tsup'
   *
   * export default defineConfig({
   *   entry: { index: 'src/index.ts' },
   *   format: ['esm', 'cjs'],
   *   experimentalDts: { entry: 'src/**\/*.ts' },
   *   // experimentalDts: { entry: 'src/**\/*.ts' }
   *   // becomes experimentalDts: { entry: { index: 'src/index.ts', types: 'src/types.ts } }
   * })
   * ```
   */
  const resolvedEntryPaths =
    typeof experimentalDtsEntry === 'string' ||
    Array.isArray(experimentalDtsEntry)
      ? await glob(experimentalDtsEntry)
      : experimentalDtsEntry

  // Fallback to `options.entry` if we end up with an empty object.
  const experimentalDtsObjectEntry =
    Object.keys(toObjectEntry(resolvedEntryPaths)).length === 0
      ? toObjectEntry(options.entry)
      : toObjectEntry(resolvedEntryPaths)

  const normalizedExperimentalDtsOptions: NormalizedExperimentalDtsConfig = {
    compilerOptions: {
      ...(tsconfig.data.compilerOptions || {}),
      ...(options.experimentalDts?.compilerOptions || {}),
    },

    entry: experimentalDtsObjectEntry,
  }

  return normalizedExperimentalDtsOptions
}

/**
 * Normalizes the initial experimental DTS configuration
 * into a consistent {@linkcode NormalizedExperimentalDtsConfig | experimentalDts config object}.
 *
 * This function handles different types of
 * {@linkcode NormalizedExperimentalDtsConfig | experimentalDts} inputs:
 * - If {@linkcode experimentalDts} is a `boolean`, it returns a default object with an empty entry (`{ entry: {} }`) if `true`, or `undefined` if `false`.
 * - If {@linkcode experimentalDts} is a `string`, it returns an object with the string as the `entry` property.
 * - If {@linkcode experimentalDts} is already an object ({@linkcode NormalizedExperimentalDtsConfig}), it returns the object as is.
 *
 * The function focuses specifically on normalizing the **initial** {@linkcode NormalizedExperimentalDtsConfig | experimentalDts configuration}.
 *
 * @param experimentalDts - The {@linkcode NormalizedExperimentalDtsConfig | experimentalDts} value, which can be a `boolean`, `string`, `object`, or `undefined`.
 * @returns A normalized {@linkcode NormalizedExperimentalDtsConfig | experimentalDts config object}, or `undefined` if input was `false` or `undefined`.
 *
 * @internal
 */
export const normalizeInitialExperimentalDtsOptions = async (
  experimentalDts: boolean | string | ExperimentalDtsConfig | undefined,
): Promise<NormalizedExperimentalDtsConfig | undefined> => {
  if (experimentalDts == null) {
    return
  }
  if (typeof experimentalDts === 'boolean')
    return experimentalDts ? { entry: {} } : undefined
  if (typeof experimentalDts === 'string') {
    return { entry: toObjectEntry(await glob(experimentalDts)) }
  }
  return {
    ...experimentalDts,
    entry:
      experimentalDts?.entry == null
        ? {}
        : toObjectEntry(
            typeof experimentalDts?.entry === 'string' ||
              Array.isArray(experimentalDts.entry)
              ? await glob(experimentalDts.entry)
              : experimentalDts.entry,
          ),
  }
}
