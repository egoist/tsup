import fs from 'fs'
import path, { dirname, join, extname } from 'path'
import { Worker } from 'worker_threads'
import type { InputOption } from 'rollup'
import { transform as transformToEs5 } from 'buble'
import {
  build as esbuild,
  BuildOptions,
  BuildResult,
  Plugin as EsbuildPlugin,
  formatMessages,
} from 'esbuild'
import type { MarkRequired, Buildable } from 'ts-essentials'
import { getBabel, removeFiles, debouncePromise } from './utils'
import { getDeps, loadTsConfig, loadPkg, loadTsupConfig } from './load'
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
import { transform } from 'sucrase'
import { version } from '../package.json'
import { log, setSilent } from './log'
import { Format, Options } from './options'

export type { Format, Options }

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

export const defineConfig = (
  options:
    | Options
    | ((
        /** The options derived from CLI flags */
        overrideOptions: Options
      ) => Options)
) => options

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

  const splitting =
    format === 'iife'
      ? false
      : typeof options.splitting === 'boolean'
      ? options.splitting
      : format === 'esm'

  try {
    result = await esbuild({
      entryPoints: options.entryPoints,
      format: format === 'cjs' && splitting ? 'esm' : format,
      bundle: typeof options.bundle === 'undefined' ? true : options.bundle,
      platform: 'node',
      globalName: options.globalName,
      jsxFactory: options.jsxFactory,
      jsxFragment: options.jsxFragment,
      sourcemap: options.sourcemap,
      target: options.target === 'es5' ? 'es2016' : options.target,
      footer: options.footer,
      banner: options.banner,
      plugins: [
        {
          name: 'modify-options',
          setup(build) {
            if (options.esbuildOptions) {
              options.esbuildOptions(build.initialOptions, { format })
            }
          },
        },
        // esbuild's `external` option doesn't support RegExp
        // So here we use a custom plugin to implement it
        externalPlugin({
          // everything should be bundled for iife format
          disabled: format === 'iife',
          patterns: external,
          skipNodeModulesBundle: options.skipNodeModulesBundle,
        }),
        postcssPlugin({ css }),
        sveltePlugin({ css }),
        ...(options.esbuildPlugins || []),
      ],
      define: {
        ...(format === 'cjs'
          ? {
              'import.meta.url': 'importMetaUrlShim',
            }
          : {}),
        ...options.define,
        ...Object.keys(env).reduce((res, key) => {
          const value = JSON.stringify(env[key])
          return {
            ...res,
            [`process.env.${key}`]: value,
            [`import.meta.env.${key}`]: value,
          }
        }, {}),
      },
      inject: [
        format === 'cjs' ? join(__dirname, '../assets/cjs_shims.js') : '',
        ...(options.inject || []),
      ].filter(Boolean),
      outdir:
        options.legacyOutput && format !== 'cjs'
          ? join(outDir, format)
          : outDir,
      outExtension: options.legacyOutput ? undefined : outExtension,
      write: false,
      splitting,
      logLevel: 'error',
      minify: options.minify,
      minifyWhitespace: options.minifyWhitespace,
      minifyIdentifiers: options.minifyIdentifiers,
      minifySyntax: options.minifySyntax,
      keepNames: options.keepNames,
      incremental: !!options.watch,
      pure: typeof options.pure === 'string' ? [options.pure] : options.pure,
      metafile: Boolean(options.metafile),
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
            } catch (error: any) {
              throw new PrettyError(
                `Error compiling to es5 target:\n${error.snippet}`
              )
            }
          }
          // Workaround to enable code splitting for cjs format
          // Manually transform esm to cjs
          // TODO: remove this once esbuild supports code splitting for cjs natively
          if (splitting && format === 'cjs') {
            contents = transform(contents, {
              filePath: file.path,
              transforms: ['imports'],
            }).code
          }
        }
        await fs.promises.writeFile(outPath, contents, {
          encoding: 'utf8',
          mode,
        })
      })
    )
  }

  if (options.metafile && result?.metafile) {
    const outPath = path.resolve(outDir, `metafile-${format}.json`)
    await fs.promises.mkdir(path.dirname(outPath), { recursive: true })
    await fs.promises.writeFile(
      outPath,
      JSON.stringify(result.metafile),
      'utf8'
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
