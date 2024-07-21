import path from 'node:path'
import fs from 'node:fs'
import { Worker } from 'node:worker_threads'
import { loadTsConfig } from 'bundle-require'
import execa from 'execa'
import { fdir } from 'fdir'
import picomatch from 'picomatch'
import kill from 'tree-kill'
import { version } from '../package.json'
import { PrettyError, handleError } from './errors'
import { getAllDepsHash, loadTsupConfig } from './load'
import {
  type MaybePromise,
  debouncePromise,
  removeFiles,
  slash,
  toObjectEntry,
} from './utils'
import { createLogger, setSilent } from './log'
import { runEsbuild } from './esbuild'
import { shebang } from './plugins/shebang'
import { cjsSplitting } from './plugins/cjs-splitting'
import { PluginContainer } from './plugin'
import { swcTarget } from './plugins/swc-target'
import { sizeReporter } from './plugins/size-reporter'
import { treeShakingPlugin } from './plugins/tree-shaking'
import { copyPublicDir, isInPublicDir } from './lib/public-dir'
import { terserPlugin } from './plugins/terser'
import { runTypeScriptCompiler } from './tsc'
import { runDtsRollup } from './api-extractor'
import { cjsInterop } from './plugins/cjs-interop'
import type { ChildProcess } from 'node:child_process'
import type { Format, KILL_SIGNAL, NormalizedOptions, Options } from './options'

export type { Format, Options, NormalizedOptions }

export const defineConfig = (
  options:
    | Options
    | Options[]
    | ((
        /** The options derived from CLI flags */
        overrideOptions: Options,
      ) => MaybePromise<Options | Options[]>),
) => options

/**
 * tree-kill use `taskkill` command on Windows to kill the process,
 * it may return 128 as exit code when the process has already exited.
 * @see https://github.com/egoist/tsup/issues/976
 */
const isTaskkillCmdProcessNotFoundError = (err: Error) => {
  return (
    process.platform === 'win32' &&
    'cmd' in err &&
    'code' in err &&
    typeof err.cmd === 'string' &&
    err.cmd.startsWith('taskkill') &&
    err.code === 128
  )
}

const killProcess = ({ pid, signal }: { pid: number; signal: KILL_SIGNAL }) =>
  new Promise<void>((resolve, reject) => {
    kill(pid, signal, (err) => {
      if (err && !isTaskkillCmdProcessNotFoundError(err)) return reject(err)
      resolve()
    })
  })

const normalizeOptions = async (
  logger: ReturnType<typeof createLogger>,
  optionsFromConfigFile: Options | undefined,
  optionsOverride: Options,
) => {
  const _options = {
    ...optionsFromConfigFile,
    ...optionsOverride,
  }

  const options: Partial<NormalizedOptions> = {
    outDir: 'dist',
    removeNodeProtocol: true,
    ..._options,
    format:
      typeof _options.format === 'string'
        ? [_options.format as Format]
        : _options.format || ['cjs'],
    dts:
      typeof _options.dts === 'boolean'
        ? _options.dts
          ? {}
          : undefined
        : typeof _options.dts === 'string'
          ? { entry: _options.dts }
          : _options.dts,
    experimentalDts: _options.experimentalDts
      ? typeof _options.experimentalDts === 'boolean'
        ? _options.experimentalDts
          ? { entry: {} }
          : undefined
        : typeof _options.experimentalDts === 'string'
          ? {
              entry: toObjectEntry(_options.experimentalDts),
            }
          : {
              ..._options.experimentalDts,
              entry: toObjectEntry(_options.experimentalDts.entry || {}),
            }
      : undefined,
  }

  setSilent(options.silent)

  const entry = options.entry || options.entryPoints

  if (!entry || Object.keys(entry).length === 0) {
    throw new PrettyError(`No input files, try "tsup <your-file>" instead`)
  }

  if (Array.isArray(entry)) {
    // using a directory as entry should match all files inside it
    const expandedEntries = entry.map((pattern) => {
      if (!pattern.endsWith('**')) {
        return `${pattern}/**`
      }
      return pattern
    })
    const matchPatterns: string[] = []
    const ignorePatterns: string[] = []
    for (const pattern of expandedEntries) {
      if (pattern.startsWith('!') && pattern[1] !== '(') {
        ignorePatterns.push(pattern.slice(1))
      } else {
        matchPatterns.push(pattern)
      }
    }
    const matcher = picomatch(matchPatterns, {
      ignore: ignorePatterns,
      dot: true,
      windows: process.platform === 'win32',
    })
    options.entry = await new fdir()
      .withRelativePaths()
      .filter((file) => matcher(file))
      .crawl(process.cwd())
      .withPromise()
    // Ensure entry exists
    if (!options.entry || options.entry.length === 0) {
      throw new PrettyError(`Cannot find ${entry}`)
    } else {
      logger.info('CLI', `Building entry: ${options.entry.join(', ')}`)
    }
  } else {
    Object.keys(entry).forEach((alias) => {
      const filename = entry[alias]!
      if (!fs.existsSync(filename)) {
        throw new PrettyError(`Cannot find ${alias}: ${filename}`)
      }
    })
    options.entry = entry
    logger.info('CLI', `Building entry: ${JSON.stringify(entry)}`)
  }

  const tsconfig = loadTsConfig(process.cwd(), options.tsconfig)
  if (tsconfig) {
    logger.info(
      'CLI',
      `Using tsconfig: ${path.relative(process.cwd(), tsconfig.path)}`,
    )
    options.tsconfig = tsconfig.path
    options.tsconfigResolvePaths = tsconfig.data?.compilerOptions?.paths || {}
    options.tsconfigDecoratorMetadata =
      tsconfig.data?.compilerOptions?.emitDecoratorMetadata
    if (options.dts) {
      options.dts.compilerOptions = {
        ...(tsconfig.data.compilerOptions || {}),
        ...(options.dts.compilerOptions || {}),
      }
    }
    if (options.experimentalDts) {
      options.experimentalDts.compilerOptions = {
        ...(tsconfig.data.compilerOptions || {}),
        ...(options.experimentalDts.compilerOptions || {}),
      }
      options.experimentalDts.entry = toObjectEntry(
        Object.keys(options.experimentalDts.entry).length > 0
          ? options.experimentalDts.entry
          : options.entry,
      )
    }
    if (!options.target) {
      options.target = tsconfig.data?.compilerOptions?.target?.toLowerCase()
    }
  } else if (options.tsconfig) {
    throw new PrettyError(`Cannot find tsconfig: ${options.tsconfig}`)
  }

  if (!options.target) {
    options.target = 'node16'
  }

  return options as NormalizedOptions
}

export async function build(_options: Options) {
  const config =
    _options.config === false
      ? {}
      : await loadTsupConfig(
          process.cwd(),
          _options.config === true ? undefined : _options.config,
        )

  const configData =
    typeof config.data === 'function'
      ? await config.data(_options)
      : config.data

  await Promise.all(
    [...(Array.isArray(configData) ? configData : [configData])].map(
      async (item) => {
        const logger = createLogger(item?.name)
        const options = await normalizeOptions(logger, item, _options)

        logger.info('CLI', `tsup v${version}`)

        if (config.path) {
          logger.info('CLI', `Using tsup config: ${config.path}`)
        }

        if (options.watch) {
          logger.info('CLI', 'Running in watch mode')
        }

        const dtsTask = async () => {
          if (options.dts && options.experimentalDts) {
            throw new Error(
              "You can't use both `dts` and `experimentalDts` at the same time",
            )
          }

          if (options.experimentalDts) {
            const exports = runTypeScriptCompiler(options)
            await runDtsRollup(options, exports)
          }

          if (options.dts) {
            await new Promise<void>((resolve, reject) => {
              const worker = new Worker(path.join(__dirname, './rollup.js'))
              worker.postMessage({
                configName: item?.name,
                options: {
                  ...options, // functions cannot be cloned
                  banner: undefined,
                  footer: undefined,
                  esbuildPlugins: undefined,
                  esbuildOptions: undefined,
                  plugins: undefined,
                  treeshake: undefined,
                  onSuccess: undefined,
                  outExtension: undefined,
                },
              })
              worker.on('message', (data) => {
                if (data === 'error') {
                  worker.terminate()
                  reject(new Error('error occured in dts build'))
                } else if (data === 'success') {
                  worker.terminate()
                  resolve()
                } else {
                  const { type, text } = data
                  if (type === 'log') {
                    console.log(text)
                  } else if (type === 'error') {
                    console.error(text)
                  }
                }
              })
            })
          }
        }

        const mainTasks = async () => {
          if (!options.dts?.only) {
            let onSuccessProcess: ChildProcess | undefined
            let onSuccessCleanup: (() => any) | undefined | void
            /** Files imported by the entry */
            const buildDependencies: Set<string> = new Set()

            let depsHash = await getAllDepsHash(process.cwd())

            const doOnSuccessCleanup = async () => {
              if (onSuccessProcess) {
                await killProcess({
                  pid: onSuccessProcess.pid!,
                  signal: options.killSignal || 'SIGTERM',
                })
              } else if (onSuccessCleanup) {
                await onSuccessCleanup()
              }
              // reset them in all occasions anyway
              onSuccessProcess = undefined
              onSuccessCleanup = undefined
            }

            const debouncedBuildAll = debouncePromise(
              () => {
                return buildAll()
              },
              100,
              handleError,
            )

            const buildAll = async () => {
              await doOnSuccessCleanup()
              // Store previous build dependencies in case the build failed
              // So we can restore it
              const previousBuildDependencies = new Set(buildDependencies)
              buildDependencies.clear()

              if (options.clean) {
                const extraPatterns = Array.isArray(options.clean)
                  ? options.clean
                  : []
                // .d.ts files are removed in the `dtsTask` instead
                // `dtsTask` is a separate process, which might start before `mainTasks`
                if (options.dts || options.experimentalDts) {
                  extraPatterns.unshift('!**/*.d.{ts,cts,mts}')
                }
                await removeFiles(['**/*', ...extraPatterns], options.outDir)
                logger.info('CLI', 'Cleaning output folder')
              }

              const css: Map<string, string> = new Map()
              await Promise.all([
                ...options.format.map(async (format, index) => {
                  const pluginContainer = new PluginContainer([
                    shebang(),
                    ...(options.plugins || []),
                    treeShakingPlugin({
                      treeshake: options.treeshake,
                      name: options.globalName,
                      silent: options.silent,
                    }),
                    cjsSplitting(),
                    cjsInterop(),
                    swcTarget(),
                    sizeReporter(),
                    terserPlugin({
                      minifyOptions: options.minify,
                      format,
                      terserOptions: options.terserOptions,
                      globalName: options.globalName,
                      logger,
                    }),
                  ])
                  await runEsbuild(options, {
                    pluginContainer,
                    format,
                    css: index === 0 || options.injectStyle ? css : undefined,
                    logger,
                    buildDependencies,
                  }).catch((error) => {
                    previousBuildDependencies.forEach((v) =>
                      buildDependencies.add(v),
                    )
                    throw error
                  })
                }),
              ])

              if (options.onSuccess) {
                if (typeof options.onSuccess === 'function') {
                  onSuccessCleanup = await options.onSuccess()
                } else {
                  onSuccessProcess = execa(options.onSuccess, {
                    shell: true,
                    stdio: 'inherit',
                  })
                  onSuccessProcess.on('exit', (code) => {
                    if (code && code !== 0) {
                      process.exitCode = code
                    }
                  })
                }
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
                        (path): path is string => typeof path === 'string',
                      )
                    : options.watch

              logger.info(
                'CLI',
                `Watching for changes in ${
                  Array.isArray(watchPaths)
                    ? watchPaths.map((v) => `"${v}"`).join(' | ')
                    : `"${watchPaths}"`
                }`,
              )
              logger.info(
                'CLI',
                `Ignoring changes in ${ignored
                  .map((v) => `"${v}"`)
                  .join(' | ')}`,
              )

              const watcher = watch(watchPaths, {
                ignoreInitial: true,
                ignorePermissionErrors: true,
                ignored,
              })
              watcher.on('all', async (type, file) => {
                file = slash(file)

                if (
                  options.publicDir &&
                  isInPublicDir(options.publicDir, file)
                ) {
                  logger.info('CLI', `Change in public dir: ${file}`)
                  copyPublicDir(options.publicDir, options.outDir)
                  return
                }

                // By default we only rebuild when imported files change
                // If you specify custom `watch`, a string or multiple strings
                // We rebuild when those files change
                let shouldSkipChange = false

                if (options.watch === true) {
                  if (file === 'package.json' && !buildDependencies.has(file)) {
                    const currentHash = await getAllDepsHash(process.cwd())
                    shouldSkipChange = currentHash === depsHash
                    depsHash = currentHash
                  } else if (!buildDependencies.has(file)) {
                    shouldSkipChange = true
                  }
                }

                if (shouldSkipChange) {
                  return
                }

                logger.info('CLI', `Change detected: ${type} ${file}`)
                debouncedBuildAll()
              })
            }

            logger.info('CLI', `Target: ${options.target}`)

            await buildAll()
            copyPublicDir(options.publicDir, options.outDir)

            startWatcher()
          }
        }

        await Promise.all([dtsTask(), mainTasks()])
      },
    ),
  )
}
