import fs from 'fs'
import { dirname, join, extname } from 'path'
import { Worker } from 'worker_threads'
import colors from 'chalk'
import type { InputOption } from 'rollup'
import { transform as transformToEs5 } from 'buble'
import { build as esbuild, BuildResult } from 'esbuild'
import type { MarkRequired, Buildable } from 'ts-essentials'
import {
  getDeps,
  loadTsConfig,
  loadPkg,
  getBabel,
  loadTsupConfig,
  removeFiles,
} from './utils'
import { FSWatcher } from 'chokidar'
import glob from 'globby'
import { PrettyError, handleError } from './errors'
import { postcssPlugin } from './esbuild/postcss'
import { externalPlugin } from './esbuild/external'
import { sveltePlugin } from './esbuild/svelte'
import resolveFrom from 'resolve-from'
import { parseArgsStringToArgv } from 'string-argv'
import type { ChildProcess } from 'child_process'
import execa from 'execa'

export type Format = 'cjs' | 'esm' | 'iife'

export type Options = {
  entryPoints?: string[]
  /**
   * Output different formats to differen folder instead of using different extensions
   */
  legacyOutput?: boolean
  /**
   * Compile target, like `es2018`
   */
  target?: string
  minify?: boolean
  minifyWhitespace?: boolean
  minifyIdentifiers?: boolean
  minifySyntax?: boolean
  keepNames?: boolean
  watch?: boolean
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
}

export type NormalizedOptions = MarkRequired<
  Options,
  'entryPoints' | 'format' | 'outDir'
>

export const makeLabel = (input: string, type: 'info' | 'success' | 'error') =>
  colors[type === 'info' ? 'bgBlue' : type === 'error' ? 'bgRed' : 'bgGreen'](
    colors.black(` ${input.toUpperCase()} `)
  )

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

export async function runEsbuild(
  options: NormalizedOptions,
  { format, css }: { format: Format; css?: Map<string, string> }
): Promise<BuildResult | undefined> {
  const pkg = await loadPkg(process.cwd())
  const deps = await getDeps(process.cwd())
  const external = [...deps, ...(options.external || [])]
  const outDir = options.outDir

  const outExtension = getOutputExtensionMap(pkg.type, format)
  const env: { [k: string]: string } = {
    ...options.env,
  }

  if (options.replaceNodeEnv) {
    env.NODE_ENV =
      options.minify || options.minifyWhitespace ? 'production' : 'development'
  }

  console.log(`${makeLabel(format, 'info')} Build start`)
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
    })
  } catch (error) {
    console.error(`${makeLabel(format, 'error')} Build failed`)
    throw error
  }

  // Manually write files
  if (result && result.outputFiles) {
    const timeInMs = Date.now() - startTime
    console.log(
      `${makeLabel(format, 'success')} Build success in ${Math.floor(
        timeInMs
      )}ms`
    )

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
    console.log(
      makeLabel('CLI', 'info'),
      `Building entry: ${options.entryPoints.join(', ')}`
    )
  }

  options.outDir = options.outDir || 'dist'

  // Build in cjs format by default
  if (!options.format) {
    options.format = ['cjs']
  }

  const tsconfig = await loadTsConfig(process.cwd())
  if (tsconfig.path && tsconfig.data) {
    console.log(makeLabel('CLI', 'info'), `Using tsconfig: ${tsconfig.path}`)
    if (!options.target) {
      options.target = tsconfig.data.compilerOptions?.target
    }
    if (options.target) {
      options.target = options.target.toLowerCase()
    }
    if (!options.jsxFactory) {
      options.jsxFactory = tsconfig.data.compilerOptions?.jsxFactory
    }
    if (!options.jsxFragment) {
      options.jsxFragment = tsconfig.data.compilerOptions?.jsxFragmentFactory
    }
  }

  if (!options.target) {
    options.target = 'es2018'
  }

  return options as NormalizedOptions
}

export async function build(_options: Options) {
  const config = await loadTsupConfig(process.cwd())

  if (config.path) {
    console.log(makeLabel('CLI', 'info'), `Using tsup config: ${config.path}`)
  }

  const options = await normalizeOptions(config.data, _options)

  let watcher: FSWatcher | undefined

  const startWatcher = async () => {
    const { watch } = await import('chokidar')
    watcher =
      watcher ||
      watch(
        [
          ...options.entryPoints.map((entry) =>
            join(dirname(entry), '**/*.{ts,tsx,js,jsx,mjs,json}')
          ),
          '!**/{dist,node_modules}/**',
          options.outDir ? `!${join(options.outDir, '**')}` : '',
        ].filter(Boolean),
        {
          ignoreInitial: true,
        }
      ).on('all', async () => {
        await buildAll().catch(handleError)
      })
  }

  let existingOnSuccess: ChildProcess | undefined

  const buildAll = async () => {
    if (existingOnSuccess) existingOnSuccess.kill()

    if (options.clean) {
      await removeFiles(['**/*', '!**/*.d.ts'], options.outDir)
      console.log(makeLabel('CLI', 'info'), `Cleaning output folder`)
    }

    const css: Map<string, string> = new Map()
    await Promise.all([
      ...options.format.map((format, index) =>
        runEsbuild(options, { format, css: index === 0 ? css : undefined })
      ),
    ])
    if (options.onSuccess) {
      const parts = parseArgsStringToArgv(options.onSuccess)
      const exec = parts[0]
      const args = parts.splice(1)
      existingOnSuccess = execa(exec, args, {
        stdio: 'inherit',
      })
    }
  }

  try {
    console.log(makeLabel('CLI', 'info'), `Target: ${options.target}`)

    if (options.dts) {
      const hasTypescript = resolveFrom.silent(process.cwd(), 'typescript')
      if (!hasTypescript) {
        throw new Error(`You need to install "typescript" in your project`)
      }
      // Run rollup in a worker so it doesn't block the event loop
      const worker = new Worker(join(__dirname, 'rollup.js'))
      worker.postMessage({
        options,
      })
      worker.on('message', (data) => {
        if (data === 'has-error') {
          process.exitCode = 1
        }
      })
    }

    await buildAll()

    if (options.watch) {
      await startWatcher()
    }
  } catch (error) {
    if (options.watch) {
      startWatcher()
    }
    throw error
  }
}
