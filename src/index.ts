import fs from 'fs'
import { dirname, join, extname, basename } from 'path'
import { Worker } from 'worker_threads'
import type { InputOption } from 'rollup'
import { transform as transformToEs5 } from 'buble'
import {
  build as esbuild,
  BuildResult,
  Plugin as EsbuildPlugin,
  formatMessages,
} from 'esbuild'
import type { MarkRequired, Buildable } from 'ts-essentials'
import {
  getDeps,
  loadTsConfig,
  loadPkg,
  getBabel,
  loadTsupConfig,
  removeFiles,
  rewriteImportMetaUrl,
  debouncePromise,
} from './utils'
import glob from 'globby'
import { handleError, PrettyError } from './errors'
import { postcssPlugin } from './esbuild/postcss'
import { externalPlugin } from './esbuild/external'
import { sveltePlugin } from './esbuild/svelte'
import resolveFrom from 'resolve-from'
import { parseArgsStringToArgv } from 'string-argv'
import type { ChildProcess } from 'child_process'
import execa from 'execa'
import consola from 'consola'
import kill from 'tree-kill'
import { version } from '../package.json'
import { log, setSilent } from './log'

export type Format = 'cjs' | 'esm' | 'iife'

export type Options = {
  entryPoints?: string[]
  /**
   * Output different formats to differen folder instead of using different extensions
   */
  legacyOutput?: boolean
  /**
   * Compile target
   *
   * default to `node12`
   */
  target?: string
  minify?: boolean
  minifyWhitespace?: boolean
  minifyIdentifiers?: boolean
  minifySyntax?: boolean
  keepNames?: boolean
  watch?: boolean | string | (string | boolean)[]
  ignoreWatch?: string[] | string
  onSuccess?: string
  jsxFactory?: string
  jsxFragment?: string
  outDir?: string
  format?: Format[]
  globalName?: string
  env?: {
    [k: string]: string
  }
  define?: {
    [k: string]: string
  }
  dts?:
    | boolean
    | string
    | {
        entry?: InputOption
        /** Resolve external types used in dts files from node_modules */
        resolve?: boolean | (string | RegExp)[]
      }
  sourcemap?: boolean
  /** Don't bundle these packages */
  external?: (string | RegExp)[]
  /** Transform the result with `@babel/core` */
  babel?: boolean
  /**
   * Replace `process.env.NODE_ENV` with `production` or `development`
   * `production` when the bundled is minified, `development` otherwise
   */
  replaceNodeEnv?: boolean
  /**
   * Code splitting
   * Default to `true`
   * You may want to disable code splitting sometimes: #255
   */
  splitting?: boolean
  /**
   * Clean output directory before each build
   */
  clean?: boolean
  esbuildPlugins?: EsbuildPlugin[]
  /**
   * Supress non-error logs (excluding "onSuccess" process output)
   */
  silent?: boolean
}

export type NormalizedOptions = MarkRequired<
  Options,
  'entryPoints' | 'format' | 'outDir'
>

const getOutputExtensionMap = (
  pkgTypeField: string | undefined,
  format: Format
) => {
  const isModule = pkgTypeField === 'module'
  const map: any = {}
  if (isModule && format === 'cjs') {
    map['.js'] = '.cjs'
  }
  if (!isModule && format === 'esm') {
    map['.js'] = '.mjs'
  }
  if (format === 'iife') {
    map['.js'] = '.global.js'
  }
  return map
}

export const defineConfig = (options: Options) => options

export async function runEsbuild(
  options: NormalizedOptions,
  { format, css }: { format: Format; css?: Map<string, string> }
): Promise<BuildResult | undefined> {
  const pkg = await loadPkg(process.cwd())
  const deps = await getDeps(process.cwd())
  const external = [
    // Exclude dependencies, e.g. `lodash`, `lodash/get`
    ...deps.map((dep) => new RegExp(`^${dep}($|\\/|\\\\)`)),
    ...(options.external || []),
  ]
  const outDir = options.outDir

  const outExtension = getOutputExtensionMap(pkg.type, format)
  const env: { [k: string]: string } = {
    ...options.env,
  }

  if (options.replaceNodeEnv) {
    env.NODE_ENV =
      options.minify || options.minifyWhitespace ? 'production' : 'development'
  }

  log(format, 'info', 'Build start')

  const startTime = Date.now()

  let result: BuildResult | undefined

  const splitting = options.splitting !== false

  try {
    result = await esbuild({
      entryPoints: options.entryPoints,
      format: splitting && format === 'cjs' ? 'esm' : format,
      bundle: true,
      platform: 'node',
      globalName: options.globalName,
      jsxFactory: options.jsxFactory,
      jsxFragment: options.jsxFragment,
      sourcemap: options.sourcemap,
      target: options.target === 'es5' ? 'es2016' : options.target,
      plugins: [
        // esbuild's `external` option doesn't support RegExp
        // So here we use a custom plugin to implement it
        externalPlugin(external),
        postcssPlugin({ css }),
        sveltePlugin({ css }),
        ...(options.esbuildPlugins || []),
      ],
      define: {
        ...options.define,
        ...Object.keys(env).reduce((res, key) => {
          return {
            ...res,
            [`process.env.${key}`]: JSON.stringify(env[key]),
          }
        }, {}),
      },
      outdir:
        options.legacyOutput && format !== 'cjs'
          ? join(outDir, format)
          : outDir,
      outExtension: options.legacyOutput ? undefined : outExtension,
      write: false,
      splitting: splitting && (format === 'cjs' || format === 'esm'),
      logLevel: 'error',
      minify: options.minify,
      minifyWhitespace: options.minifyWhitespace,
      minifyIdentifiers: options.minifyIdentifiers,
      minifySyntax: options.minifySyntax,
      keepNames: options.keepNames,
      incremental: !!options.watch,
    })
  } catch (error) {
    log(format, 'error', 'Build failed')
    throw error
  }

  if (result && result.warnings) {
    const messages = result.warnings.filter((warning) => {
      if (
        warning.text.includes(
          `This call to "require" will not be bundled because`
        ) ||
        warning.text.includes(`Indirect calls to "require" will not be bundled`)
      )
        return false

      return true
    })
    const formatted = await formatMessages(messages, {
      kind: 'warning',
      color: true,
    })
    formatted.forEach((message) => {
      consola.warn(message)
    })
  }

  // Manually write files
  if (result && result.outputFiles) {
    const timeInMs = Date.now() - startTime
    log(format, 'success', `Build success in ${Math.floor(timeInMs)}ms`)

    const { transform } = await import('sucrase')
    await Promise.all(
      result.outputFiles.map(async (file) => {
        const dir = dirname(file.path)
        const outPath = file.path
        const ext = extname(outPath)
        const comeFromSource = ext === '.js' || ext === outExtension['.js']
        await fs.promises.mkdir(dir, { recursive: true })
        let contents = file.text
        let mode: number | undefined
        if (contents[0] === '#' && contents[1] === '!') {
          mode = 0o755
        }
        if (comeFromSource) {
          if (options.babel) {
            const babel = getBabel()
            if (babel) {
              contents = await babel
                .transformAsync(contents, {
                  filename: file.path,
                })
                .then((res) => res?.code || contents)
            } else {
              throw new PrettyError(
                `@babel/core is not found in ${process.cwd()}`
              )
            }
          }
          if (options.target === 'es5') {
            try {
              contents = transformToEs5(contents, {
                source: file.path,
                file: file.path,
                transforms: {
                  modules: false,
                  arrow: true,
                  dangerousTaggedTemplateString: true,
                  spreadRest: true,
                },
              }).code
            } catch (error) {
              throw new PrettyError(
                `Error compiling to es5 target:\n${error.snippet}`
              )
            }
          }
          // When code splitting is enable the code is transpiled to esm format
          // So we add an extra step to get cjs code here
          if (splitting && format === 'cjs') {
            contents = transform(contents, {
              filePath: file.path,
              transforms: ['imports'],
            }).code
            contents = rewriteImportMetaUrl(contents, basename(file.path))
          }
        }
        await fs.promises.writeFile(outPath, contents, {
          encoding: 'utf8',
          mode,
        })
      })
    )
  }

  return result
}

const killProcess = ({
  pid,
  signal = 'SIGTERM',
}: {
  pid: number
  signal?: string | number
}) =>
  new Promise<unknown>((resolve) => {
    kill(pid, signal, resolve)
  })

const normalizeOptions = async (
  optionsFromConfigFile: Options,
  optionsOverride: Options
) => {
  const options: Buildable<NormalizedOptions> = {
    ...optionsFromConfigFile,
    ...optionsOverride,
  }

  const input = options.entryPoints
  if (input) {
    options.entryPoints = await glob(input)
  } else {
    throw new PrettyError(`No input files, try "tsup <your-file>" instead`)
  }

  // Ensure entry exists
  if (!options.entryPoints || options.entryPoints.length === 0) {
    throw new PrettyError(`Cannot find ${input}`)
  } else {
    log('CLI', 'info', `Building entry: ${options.entryPoints.join(', ')}`)
  }

  options.outDir = options.outDir || 'dist'

  // Build in cjs format by default
  if (!options.format) {
    options.format = ['cjs']
  }

  const tsconfig = await loadTsConfig(process.cwd())
  if (tsconfig.path && tsconfig.data) {
    log('CLI', 'info', `Using tsconfig: ${tsconfig.path}`)
    if (!options.jsxFactory) {
      options.jsxFactory = tsconfig.data.compilerOptions?.jsxFactory
    }
    if (!options.jsxFragment) {
      options.jsxFragment = tsconfig.data.compilerOptions?.jsxFragmentFactory
    }
  }

  if (!options.target) {
    options.target = 'node12'
  }

  return options as NormalizedOptions
}

export async function build(_options: Options) {
  setSilent(_options.silent)

  log('CLI', 'info', `tsup v${version}`)

  const config = await loadTsupConfig(process.cwd())

  if (config.path) {
    log('CLI', 'info', `Using tsup config: ${config.path}`)
  }

  const options = await normalizeOptions(config.data, _options)

  if (_options.watch) {
    log('CLI', 'info', 'Running in watch mode')
  }

  let existingOnSuccess: ChildProcess | undefined

  async function killPreviousProcess() {
    if (existingOnSuccess) {
      await killProcess({
        pid: existingOnSuccess.pid,
      })
      existingOnSuccess = undefined
    }
  }

  const debouncedBuildAll = debouncePromise(
    () => {
      return buildAll()
    },
    100,
    handleError
  )

  const buildAll = async () => {
    const killPromise = killPreviousProcess()

    if (options.clean) {
      await removeFiles(['**/*', '!**/*.d.ts'], options.outDir)
      log('CLI', 'info', 'Cleaning output folder')
    }

    const css: Map<string, string> = new Map()
    await Promise.all([
      ...options.format.map((format, index) =>
        runEsbuild(options, { format, css: index === 0 ? css : undefined })
      ),
    ])
    await killPromise
    if (options.onSuccess) {
      const parts = parseArgsStringToArgv(options.onSuccess)
      const exec = parts[0]
      const args = parts.splice(1)
      existingOnSuccess = execa(exec, args, {
        stdio: 'inherit',
      })
    }
  }

  const startWatcher = async () => {
    if (!options.watch) return

    const { watch } = await import('chokidar')

    const customIgnores = options.ignoreWatch
      ? Array.isArray(options.ignoreWatch)
        ? options.ignoreWatch
        : [options.ignoreWatch]
      : []

    const ignored = [
      '**/{.git,node_modules}/**',
      options.outDir,
      ...customIgnores,
    ]

    const watchPaths =
      typeof options.watch === 'boolean'
        ? '.'
        : Array.isArray(options.watch)
        ? options.watch.filter(
            (path): path is string => typeof path === 'string'
          )
        : options.watch

    log(
      'CLI',
      'info',
      `Watching for changes in ${
        Array.isArray(watchPaths)
          ? watchPaths.map((v) => '"' + v + '"').join(' | ')
          : '"' + watchPaths + '"'
      }`
    )
    log(
      'CLI',
      'info',
      `Ignoring changes in ${ignored.map((v) => '"' + v + '"').join(' | ')}`
    )

    const watcher = watch(watchPaths, {
      ignoreInitial: true,
      ignorePermissionErrors: true,
      ignored,
    })
    watcher.on('all', async (type, file) => {
      log('CLI', 'info', `Change detected: ${type} ${file}`)
      debouncedBuildAll()
    })
  }

  log('CLI', 'info', `Target: ${options.target}`)

  await buildAll()

  startWatcher()

  if (options.dts) {
    const hasTypescript = resolveFrom.silent(process.cwd(), 'typescript')
    if (!hasTypescript) {
      throw new Error(`You need to install "typescript" in your project`)
    }

    const isDev = __filename.endsWith('index.ts')
    const worker = new Worker(
      join(__dirname, isDev ? './rollup.dev.js' : './rollup.js')
    )
    worker.postMessage({
      options: {
        ...options, // functions cannot be cloned
        esbuildPlugins: undefined,
      },
    })
    worker.on('message', (data) => {
      if (data === 'error') {
        process.exitCode = 1
      } else if (data === 'success') {
        process.exitCode = 0
      }
    })
  }
}
