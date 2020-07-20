import fs from 'fs'
import { dirname, join } from 'path'
import { InputOptions, OutputOptions } from 'rollup'
import prettyBytes from 'pretty-bytes'
import colors from 'kleur'
import { Service, startService, BuildResult } from 'esbuild'
import hashbangPlugin from 'rollup-plugin-hashbang'
import jsonPlugin from '@rollup/plugin-json'
import { sizePlugin, caches } from './size-plugin'
import { getDeps, resolveTsConfig } from './utils'
import { FSWatcher } from 'chokidar'
import { handlError } from './errors'

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

const makeLabel = (input: string, type: 'info' | 'success' | 'error') =>
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
    const startTime = process.hrtime()
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
        write: format !== 'cjs',
        splitting: format === 'cjs' || format === 'esm',
      }))
    const endTime = process.hrtime(startTime)
    const timeInMs = (endTime[0] * 1000000000 + endTime[1]) / 1000000
    console.log(
      `${makeLabel(format, 'success')} Build success in ${Math.floor(
        timeInMs
      )}ms`
    )
    return result
  }
  const result = await runService()
  // Manually write files in cjs format
  // Cause we need to transform to code from esm to cjs first
  if (result && result.outputFiles && format === 'cjs') {
    const { transform } = await import('sucrase')
    await Promise.all(
      result.outputFiles.map(async (file) => {
        const dir = dirname(file.path)
        const outPath = file.path
        await fs.promises.mkdir(dir, { recursive: true })
        if (format === 'cjs' && outPath.endsWith('.js')) {
          const content = transform(textDecoder.decode(file.contents), {
            transforms: ['imports'],
          })
          await fs.promises.writeFile(outPath, content.code, 'utf8')
        } else {
          await fs.promises.writeFile(outPath, file.contents)
        }
      })
    )
  }
  return runService
}

const getRollupConfig = async (
  options: Options
): Promise<{
  inputConfig: InputOptions
  outputConfig: OutputOptions
}> => {
  return {
    inputConfig: {
      input: options.entryPoints,
      preserveEntrySignatures: 'strict',
      onwarn(warning, handler) {
        if (
          warning.code === 'UNRESOLVED_IMPORT' ||
          warning.code === 'CIRCULAR_DEPENDENCY'
        ) {
          return
        }
        return handler(warning)
      },
      plugins: [
        hashbangPlugin(),
        jsonPlugin(),
        await import('rollup-plugin-dts').then((res) => res.default()),
        sizePlugin(),
      ].filter(Boolean),
    },
    outputConfig: {
      dir: options.outDir || 'dist',
      format: 'esm',
      exports: 'named',
      name: options.globalName,
    },
  }
}

async function runRollup(options: {
  inputConfig: InputOptions
  outputConfig: OutputOptions
}) {
  const { rollup } = await import('rollup')
  const bundle = await rollup(options.inputConfig)
  await bundle.write(options.outputConfig)
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
          options.outDir ? join(options.outDir, '**') : '',
        ].filter(Boolean),
        {
          ignoreInitial: true,
        }
      ).on('all', async () => {
        if (runServices) {
          await Promise.all(
            runServices.map((runService, index) =>
              runService().catch((error) => {
                console.error(
                  `${makeLabel(options.format[index], 'error')} Build failed`
                )
                if (!error.warnings && !error.errors) {
                  handlError(error)
                }
              })
            )
          )
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
      await getRollupConfig(options).then((config) => runRollup(config))
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

export function printSizes() {
  const result: Map<string, number> = new Map()
  for (const cache of caches.values()) {
    for (const [filename, getSize] of cache.entries()) {
      result.set(filename, getSize())
    }
  }
  const maxNameLength = [...result.keys()].sort((a, b) =>
    a.length > b.length ? -1 : 1
  )[0].length
  for (const [filename, size] of result.entries()) {
    console.log(
      `${colors.bold(filename.padEnd(maxNameLength))} - ${colors.green(
        prettyBytes(size)
      )}`
    )
  }
}
