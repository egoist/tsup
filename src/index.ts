import path from 'path'
import fs from 'fs'
import { Worker } from 'worker_threads'
import type { MarkRequired, Buildable } from 'ts-essentials'
import { removeFiles, debouncePromise } from './utils'
import { loadTsConfig, loadTsupConfig } from './load'
import glob from 'globby'
import { handleError, PrettyError } from './errors'
import resolveFrom from 'resolve-from'
import { parseArgsStringToArgv } from 'string-argv'
import type { ChildProcess } from 'child_process'
import execa from 'execa'
import kill from 'tree-kill'
import { version } from '../package.json'
import { log, setSilent } from './log'
import { Format, Options } from './options'
import { runEsbuild } from './esbuild'

export type { Format, Options }

export type NormalizedOptions = MarkRequired<
  Options,
  'entryPoints' | 'format' | 'outDir'
>

export const defineConfig = (
  options:
    | Options
    | ((
        /** The options derived from CLI flags */
        overrideOptions: Options
      ) => Options)
) => options

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
  optionsFromConfigFile: Options | undefined,
  optionsOverride: Options
) => {
  const options: Buildable<NormalizedOptions> = {
    ...optionsFromConfigFile,
    ...optionsOverride,
  }

  setSilent(options.silent)

  const input = options.entryPoints

  if (!input || Object.keys(input).length === 0) {
    throw new PrettyError(`No input files, try "tsup <your-file>" instead`)
  }

  if (Array.isArray(input)) {
    options.entryPoints = await glob(input)
    // Ensure entry exists
    if (!options.entryPoints || options.entryPoints.length === 0) {
      throw new PrettyError(`Cannot find ${input}`)
    } else {
      log('CLI', 'info', `Building entry: ${options.entryPoints.join(', ')}`)
    }
  } else {
    Object.keys(input).forEach((alias) => {
      const filename = input[alias]!
      if (!fs.existsSync(filename)) {
        throw new PrettyError(`Cannot find ${alias}: ${filename}`)
      }
    })
    log('CLI', 'info', `Building entry: ${JSON.stringify(input)}`)
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
  const config = await loadTsupConfig(process.cwd())

  const configData =
    typeof config.data === 'function' ? config.data(_options) : config.data

  const options = await normalizeOptions(configData, _options)

  log('CLI', 'info', `tsup v${version}`)

  if (config.path) {
    log('CLI', 'info', `Using tsup config: ${config.path}`)
  }

  if (options.watch) {
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
      const extraPatterns = Array.isArray(options.clean) ? options.clean : []
      await removeFiles(
        ['**/*', '!**/*.d.ts', ...extraPatterns],
        options.outDir
      )
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

    const worker = new Worker(path.join(__dirname, './rollup.js'))
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
