import fs from 'node:fs'
import path from 'node:path'
import resolveFrom from 'resolve-from'
import type { InputOption } from 'rollup'
import strip from 'strip-json-comments'
import { glob } from 'tinyglobby'
import { loadPkg } from './load.js'
import type {
  Entry,
  Format,
  NormalizedExperimentalDtsConfig,
  NormalizedOptions,
  Options,
} from './options'

export type MaybePromise<T> = T | Promise<T>

export type External =
  | string
  | RegExp
  | ((id: string, parentId?: string) => boolean)

export function isExternal(
  externals: External | External[],
  id: string,
  parentId?: string,
) {
  id = slash(id)

  if (!Array.isArray(externals)) {
    externals = [externals]
  }

  for (const external of externals) {
    if (
      typeof external === 'string' &&
      (id === external || id.includes(`/node_modules/${external}/`))
    ) {
      return true
    }
    if (external instanceof RegExp && external.test(id)) {
      return true
    }
    if (typeof external === 'function' && external(id, parentId)) {
      return true
    }
  }

  return false
}

export function getPostcss(): null | Awaited<typeof import('postcss')> {
  return localRequire('postcss')
}

export function getApiExtractor(): null | Awaited<
  typeof import('@microsoft/api-extractor')
> {
  return localRequire('@microsoft/api-extractor')
}

export function localRequire(moduleName: string) {
  const p = resolveFrom.silent(process.cwd(), moduleName)
  return p && require(p)
}

export function pathExists(p: string) {
  return new Promise((resolve) => {
    fs.access(p, (err) => {
      resolve(!err)
    })
  })
}

export async function removeFiles(patterns: string[], dir: string) {
  const files = await glob(patterns, {
    cwd: dir,
    absolute: true,
  })
  files.forEach((file) => fs.existsSync(file) && fs.unlinkSync(file))
}

export function debouncePromise<T extends unknown[]>(
  fn: (...args: T) => Promise<void>,
  delay: number,
  onError: (err: unknown) => void,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined

  let promiseInFly: Promise<void> | undefined

  let callbackPending: (() => void) | undefined

  return function debounced(...args: Parameters<typeof fn>) {
    if (promiseInFly) {
      callbackPending = () => {
        debounced(...args)
        callbackPending = undefined
      }
    } else {
      if (timeout != null) clearTimeout(timeout)

      timeout = setTimeout(() => {
        timeout = undefined
        promiseInFly = fn(...args)
          .catch(onError)
          .finally(() => {
            promiseInFly = undefined
            if (callbackPending) callbackPending()
          })
      }, delay)
    }
  }
}

// Taken from https://github.com/sindresorhus/slash/blob/main/index.js (MIT)
export function slash(path: string) {
  const isExtendedLengthPath = path.startsWith('\\\\?\\')

  if (isExtendedLengthPath) {
    return path
  }

  return path.replace(/\\/g, '/')
}

type Truthy<T> = T extends false | '' | 0 | null | undefined ? never : T // from lodash

export function truthy<T>(value: T): value is Truthy<T> {
  return Boolean(value)
}

export function jsoncParse(data: string) {
  try {
    return new Function(`return ${strip(data).trim()}`)()
  } catch {
    // Silently ignore any error
    // That's what tsc/jsonc-parser did after all
    return {}
  }
}

export function defaultOutExtension({
  format,
  pkgType,
}: {
  format: Format
  pkgType?: string
}): { js: string; dts: string } {
  let jsExtension = '.js'
  let dtsExtension = '.d.ts'
  const isModule = pkgType === 'module'
  if (isModule && format === 'cjs') {
    jsExtension = '.cjs'
    dtsExtension = '.d.cts'
  }
  if (!isModule && format === 'esm') {
    jsExtension = '.mjs'
    dtsExtension = '.d.mts'
  }
  if (format === 'iife') {
    jsExtension = '.global.js'
  }
  return {
    js: jsExtension,
    dts: dtsExtension,
  }
}

export function ensureTempDeclarationDir(): string {
  const cwd = process.cwd()
  const dirPath = path.join(cwd, '.tsup', 'declaration')

  if (fs.existsSync(dirPath)) {
    return dirPath
  }

  fs.mkdirSync(dirPath, { recursive: true })

  const gitIgnorePath = path.join(cwd, '.tsup', '.gitignore')
  writeFileSync(gitIgnorePath, '**/*\n')

  return dirPath
}

// Make sure the entry is an object
// We use the base path (without extension) as the entry name
// To make declaration files work with multiple entrypoints
// See #316
export const toObjectEntry = (entry: string | Entry) => {
  if (typeof entry === 'string') {
    entry = [entry]
  }
  if (!Array.isArray(entry)) {
    return entry
  }
  entry = entry.map((e) => e.replace(/\\/g, '/'))
  const ancestor = findLowestCommonAncestor(entry)
  return entry.reduce(
    (result, item) => {
      const key = item
        .replace(ancestor, '')
        .replace(/^\//, '')
        .replace(/\.[a-z]+$/, '')
      return {
        ...result,
        [key]: item,
      }
    },
    {} as Record<string, string>,
  )
}

const findLowestCommonAncestor = (filepaths: string[]) => {
  if (filepaths.length <= 1) return ''
  const [first, ...rest] = filepaths
  let ancestor = first.split('/')
  for (const filepath of rest) {
    const directories = filepath.split('/', ancestor.length)
    let index = 0
    for (const directory of directories) {
      if (directory === ancestor[index]) {
        index += 1
      } else {
        ancestor = ancestor.slice(0, index)
        break
      }
    }
    ancestor = ancestor.slice(0, index)
  }

  return ancestor.length <= 1 && ancestor[0] === ''
    ? `/${ancestor[0]}`
    : ancestor.join('/')
}

export function toAbsolutePath(p: string, cwd?: string): string {
  if (path.isAbsolute(p)) {
    return p
  }

  return slash(path.normalize(path.join(cwd || process.cwd(), p)))
}

export function trimDtsExtension(fileName: string) {
  return fileName.replace(/\.d\.(ts|mts|cts)x?$/, '')
}

export function writeFileSync(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content)
}

/**
 * Replaces TypeScript declaration file
 * extensions (`.d.ts`, `.d.mts`, `.d.cts`)
 * with their corresponding JavaScript variants (`.js`, `.mjs`, `.cjs`).
 *
 * @param dtsFilePath - The file path to be transformed.
 * @returns The updated file path with the JavaScript extension.
 *
 * @internal
 */
export function replaceDtsWithJsExtensions(dtsFilePath: string) {
  return dtsFilePath.replace(
    /\.d\.(ts|mts|cts)$/,
    (_, fileExtension: string) => {
      switch (fileExtension) {
        case 'ts':
          return '.js'
        case 'mts':
          return '.mjs'
        case 'cts':
          return '.cjs'
        default:
          return ''
      }
    },
  )
}

/**
 * Converts an array of {@link NormalizedOptions.entry | entry paths}
 * into an object where the keys represent the output
 * file names (without extensions) and the values
 * represent the corresponding input file paths.
 *
 * @param arrayOfEntries - An array of file path entries as strings.
 * @returns An object where the keys are the output file name and the values are the input file name.
 *
 * @example
 *
 * ```ts
 * import { defineConfig } from 'tsup'
 *
 * export default defineConfig({
 *   entry: ['src/index.ts', 'src/types.ts'],
 *   // Becomes `{ index: 'src/index.ts', types: 'src/types.ts' }`
 * })
 * ```
 *
 * @internal
 */
const convertArrayEntriesToObjectEntries = (arrayOfEntries: string[]) => {
  const objectEntries = Object.fromEntries(
    arrayOfEntries.map(
      (entry) =>
        [
          path.posix.join(
            ...entry
              .split(path.posix.sep)
              .slice(1, -1)
              .concat(path.parse(entry).name),
          ),
          entry,
        ] as const,
    ),
  )

  return objectEntries
}

/**
 * Resolves and standardizes entry paths into an object format. If the provided
 * entry is a string or an array of strings, it resolves any potential glob
 * patterns and converts the result into an entry object. If the input is
 * already an object, it is returned as-is.
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
 *   // becomes experimentalDts: { entry: { index: 'src/index.ts', types: 'src/types.ts } }
 * })
 * ```
 *
 * @internal
 */
const resolveEntryPaths = async (entryPaths: InputOption) => {
  const resolvedEntryPaths =
    typeof entryPaths === 'string' || Array.isArray(entryPaths)
      ? convertArrayEntriesToObjectEntries(await glob(entryPaths))
      : entryPaths

  return resolvedEntryPaths
}

/**
 * Resolves the
 * {@link NormalizedExperimentalDtsConfig | experimental DTS config} by
 * resolving entry paths and merging the provided TypeScript configuration
 * options.
 *
 * @param options - The options containing entry points and experimental DTS
 * configuration.
 * @param tsconfig - The loaded TypeScript configuration data.
 *
 * @internal
 */
export const resolveExperimentalDtsConfig = async (
  options: NormalizedOptions,
  tsconfig: any,
): Promise<NormalizedExperimentalDtsConfig> => {
  const resolvedEntryPaths = await resolveEntryPaths(
    options.experimentalDts?.entry || options.entry,
  )

  // Fallback to `options.entry` if we end up with an empty object.
  const experimentalDtsObjectEntry =
    Object.keys(resolvedEntryPaths).length === 0
      ? Array.isArray(options.entry)
        ? convertArrayEntriesToObjectEntries(options.entry)
        : options.entry
      : resolvedEntryPaths

  const normalizedExperimentalDtsConfig: NormalizedExperimentalDtsConfig = {
    compilerOptions: {
      ...(tsconfig.data.compilerOptions || {}),
      ...(options.experimentalDts?.compilerOptions || {}),
    },

    entry: experimentalDtsObjectEntry,
  }

  return normalizedExperimentalDtsConfig
}

/**
 * Resolves the initial experimental DTS configuration into a consistent
 * {@link NormalizedExperimentalDtsConfig} object.
 *
 * @internal
 */
export const resolveInitialExperimentalDtsConfig = async (
  experimentalDts: Options['experimentalDts'],
): Promise<NormalizedExperimentalDtsConfig | undefined> => {
  if (experimentalDts == null) {
    return
  }

  if (typeof experimentalDts === 'boolean')
    return experimentalDts ? { entry: {} } : undefined

  if (typeof experimentalDts === 'string') {
    // Treats the string as a glob pattern, resolving it to entry paths and
    // returning an object with the `entry` property.
    return {
      entry: convertArrayEntriesToObjectEntries(await glob(experimentalDts)),
    }
  }

  return {
    ...experimentalDts,

    entry:
      experimentalDts?.entry == null
        ? {}
        : await resolveEntryPaths(experimentalDts.entry),
  }
}

/**
 * Resolves the
 * {@linkcode NormalizedOptions.outputExtensionMap | output extension map}
 * for each specified {@linkcode Format | format}
 * in the provided {@linkcode options}.
 *
 * @param options - The normalized options containing format and output extension details.
 * @returns A {@linkcode Promise | promise} that resolves to a {@linkcode Map}, where each key is a {@linkcode Format | format} and each value is an object containing the resolved output extensions for both `js` and `dts` files.
 *
 * @internal
 */
export const resolveOutputExtensionMap = async (
  options: NormalizedOptions,
): Promise<NormalizedOptions['outputExtensionMap']> => {
  const pkg = await loadPkg(process.cwd())

  const formatOutExtension = new Map(
    options.format.map((format) => {
      const outputExtensions = options.outExtension?.({
        format,
        options,
        pkgType: pkg.type,
      })

      return [
        format,
        {
          ...defaultOutExtension({ format, pkgType: pkg.type }),
          ...(outputExtensions || {}),
        },
      ] as const
    }),
  )

  return formatOutExtension
}
