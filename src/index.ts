import fs from 'fs'
import { dirname, join } from 'path'
import { Worker } from 'worker_threads'
import colors from 'chalk'
import { Service, startService, BuildResult } from 'esbuild'
import { getDeps, resolveTsConfig } from './utils'
import { FSWatcher } from 'chokidar'

const textDecoder = new TextDecoder('utf-8')

export type Format = 'cjs' | 'esm' | 'iife'

export type Options = {
  entryPoints: string[]
  /**
   * Compile target, like `es2018`
   */
  target?: string
  minify?: boolean
  watch?: boolean
  jsxFactory?: string
  jsxFragment?: string
  outDir?: string
  format: Format[]
  globalName?: string
  define?: {
    [k: string]: string
  }
  dts?: boolean
  /** Don't bundle these packages */
  external?: string[]
}

const services: Map<string, Service> = new Map()

export const makeLabel = (input: string, type: 'info' | 'success' | 'error') =>
  colors[type === 'info' ? 'bgBlue' : type === 'error' ? 'bgRed' : 'bgGreen'](
    colors.black(` ${input.toUpperCase()} `)
  )

export async function runEsbuild(
  options: Options,
  { format }: { format: Format }
): Promise<() => Promise<BuildResult | void>> {
  let service = services.get(format)
  if (!service) {
    service = await startService()
    services.set(format, service)
  }
  const deps = await getDeps(process.cwd())
  const external = [...deps, ...(options.external || [])]
  const outDir = options.outDir || 'dist'
  const runService = async () => {
    console.log(`${makeLabel(format, 'info')} Build start`)
    const startTime = Date.now()
    const result =
      service &&
      (await service.build({
        entryPoints: options.entryPoints,
        format: format === 'cjs' ? 'esm' : format,
        bundle: true,
        platform: 'node',
        globalName: options.globalName,
        jsxFactory: options.jsxFactory,
        jsxFragment: options.jsxFragment,
        define: options.define,
        external,
        outdir: format === 'cjs' ? outDir : join(outDir, format),
        write: false,
        splitting: format === 'cjs' || format === 'esm',
      }))
    const timeInMs = Date.now() - startTime
    console.log(
      `${makeLabel(format, 'success')} Build success in ${Math.floor(
        timeInMs
      )}ms`
    )
    return result
  }
  let result
  try {
    result = await runService()
  } catch (error) {
    console.error(`${makeLabel(format, 'error')} Build failed`)
    return runService
  }
  // Manually write files
  if (result && result.outputFiles) {
    const { transform } = await import('sucrase')
    await Promise.all(
      result.outputFiles.map(async (file) => {
        const dir = dirname(file.path)
        const outPath = file.path
        await fs.promises.mkdir(dir, { recursive: true })
        let mode: number | undefined
        if (file.contents[0] === 35 && file.contents[1] === 33) {
          mode = 0o755
        }
        // Cause we need to transform to code from esm to cjs first
        if (format === 'cjs' && outPath.endsWith('.js')) {
          const content = transform(textDecoder.decode(file.contents), {
            transforms: ['imports'],
          })
          await fs.promises.writeFile(outPath, content.code, {
            encoding: 'utf8',
            mode,
          })
        } else {
          await fs.promises.writeFile(outPath, file.contents, {
            mode,
          })
        }
      })
    )
  }
  return runService
}

function stopServices() {
  for (const [name, service] of services.entries()) {
    service.stop()
    services.delete(name)
  }
}

export async function build(options: Options) {
  let watcher: FSWatcher | undefined
  let runServices: Array<() => Promise<BuildResult | void>> | undefined

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
        if (runServices) {
          await Promise.all(runServices.map((runService) => runService()))
        }
      })
  }

  try {
    const tsconfig = resolveTsConfig(process.cwd())
    if (tsconfig) {
      console.log(makeLabel('CLI', 'info'), `Using tsconfig: ${tsconfig}`)
    }

    runServices = await Promise.all([
      ...options.format.map((format) => runEsbuild(options, { format })),
    ])
    if (options.dts) {
      // Run rollup in a worker so it doesn't block the event loop
      const worker = new Worker(join(__dirname, 'rollup.js'))
      worker.postMessage({
        options,
      })
      worker.on('message', data => {
        if (data === 'exit') {
          worker.unref()
        }
      })
    }
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
