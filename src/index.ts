import fs from 'fs'
import { dirname, join, extname } from 'path'
import { Worker } from 'worker_threads'
import colors from 'chalk'
import { transform as transformToEs5 } from 'buble'
import { Service, startService, BuildResult } from 'esbuild'
import { getDeps, loadTsConfig, loadPkg, getBabel } from './utils'
import { FSWatcher } from 'chokidar'
import glob from 'fast-glob'
import { PrettyError } from './errors'

const textDecoder = new TextDecoder('utf-8')

export type Format = 'cjs' | 'esm' | 'iife'

export type Options = {
  entryPoints: string[]
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
  watch?: boolean
  jsxFactory?: string
  jsxFragment?: string
  outDir?: string
  format: Format[]
  globalName?: string
  env?: {
    [k: string]: string
  }
  define?: {
    [k: string]: string
  }
  dts?: boolean
  /** Don't bundle these packages */
  external?: string[]
  /** Transform the result with `@babel/core` */
  babel?: boolean
}

const services: Map<string, Service> = new Map()

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
  options: Options,
  { format }: { format: Format }
): Promise<BuildResult | undefined> {
  let service = services.get(format)
  if (!service) {
    service = await startService()
    services.set(format, service)
  }
  const pkg = await loadPkg(process.cwd())
  const deps = await getDeps(process.cwd())
  const external = [...deps, ...(options.external || [])]
  const outDir = options.outDir || 'dist'

  const outExtension = getOutputExtensionMap(pkg.type, format)
  const env: { [k: string]: string } = {
    NODE_ENV:
      options.minify || options.minifyWhitespace ? 'production' : 'development',
    ...options.env,
  }

  console.log(`${makeLabel(format, 'info')} Build start`)
  const startTime = Date.now()

  let result: BuildResult | undefined

  if (service) {
    try {
      result = await service.build({
        entryPoints: options.entryPoints,
        format: format === 'cjs' ? 'esm' : format,
        bundle: true,
        platform: 'node',
        globalName: options.globalName,
        jsxFactory: options.jsxFactory,
        jsxFragment: options.jsxFragment,
        target: options.target === 'es5' ? 'es2016' : options.target,
        define: {
          ...options.define,
          ...Object.keys(env).reduce((res, key) => {
            return {
              ...res,
              [key]: JSON.stringify(env[key]),
            }
          }, {}),
        },
        external,
        outdir:
          options.legacyOutput && format !== 'cjs'
            ? join(outDir, format)
            : outDir,
        outExtension: options.legacyOutput ? undefined : outExtension,
        write: false,
        splitting: format === 'cjs' || format === 'esm',
        logLevel: 'error',
        minify: options.minify,
        minifyWhitespace: options.minifyWhitespace,
        minifyIdentifiers: options.minifyIdentifiers,
        minifySyntax: options.minifySyntax,
      })
    } catch (error) {
      console.error(`${makeLabel(format, 'error')} Build failed`)
      throw error
    }
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
        if (ext !== '.js' && ext !== outExtension['.js']) return
        await fs.promises.mkdir(dir, { recursive: true })
        let mode: number | undefined
        if (file.contents[0] === 35 && file.contents[1] === 33) {
          mode = 0o755
        }
        let contents = textDecoder.decode(file.contents)
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
        // Cause we need to transform to code from esm to cjs first
        if (format === 'cjs') {
          contents = transform(contents, {
            transforms: ['imports'],
          }).code
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

function stopServices() {
  for (const [name, service] of services.entries()) {
    service.stop()
    services.delete(name)
  }
}

export async function build(options: Options) {
  options = { ...options }

  const input = options.entryPoints
  options.entryPoints = await glob(input)

  if (options.entryPoints.length === 0) {
    throw new PrettyError(`Cannot find ${input}`)
  }

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
        await buildAll()
      })
  }

  const buildAll = () =>
    Promise.all([
      ...options.format.map((format) => runEsbuild(options, { format })),
    ])

  try {
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
    console.log(makeLabel('CLI', 'info'), `Target: ${options.target}`)

    if (options.dts) {
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
    } else {
      stopServices()
    }
  } catch (error) {
    if (!options.watch) {
      stopServices()
    } else {
      startWatcher()
    }
    throw error
  }
}
