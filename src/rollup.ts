import { parentPort } from 'worker_threads'
import { InputOptions, OutputOptions, Plugin } from 'rollup'
import { NormalizedOptions } from './'
import ts from 'typescript'
import hashbangPlugin from 'rollup-plugin-hashbang'
import jsonPlugin from '@rollup/plugin-json'
import { handleError } from './errors'
import { removeFiles } from './utils'
import { TsResolveOptions, tsResolvePlugin } from './rollup/ts-resolve'
import { createLogger, setSilent } from './log'
import { getDeps } from './load'
import path from 'path'
import { reportSize } from './lib/report-size'
import resolveFrom from 'resolve-from'

const logger = createLogger()

const parseCompilerOptions = (compilerOptions?: any) => {
  if (!compilerOptions) return {}
  const { options } = ts.parseJsonConfigFileContent(
    { compilerOptions },
    ts.sys,
    './'
  )
  return options
}

// Use `require` to esbuild use the cjs build of rollup-plugin-dts
// the mjs build of rollup-plugin-dts uses `import.meta.url` which makes Node throws syntax error
// since tsup is published as a commonjs module for now
const dtsPlugin: typeof import('rollup-plugin-dts') = require('rollup-plugin-dts')

type RollupConfig = {
  inputConfig: InputOptions
  outputConfig: OutputOptions
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
    ? '/' + ancestor[0]
    : ancestor.join('/')
}

// Make sure the Rollup entry is an object
// We use the base path (without extension) as the entry name
// To make declaration files work with multiple entrypoints
// See #316
const toObjectEntry = (entry: string[]) => {
  entry = entry.map((e) => e.replace(/\\/g, '/'))
  const ancestor = findLowestCommonAncestor(entry)
  return entry.reduce((result, item) => {
    const key = item
      .replace(ancestor, '')
      .replace(/^\//, '')
      .replace(/\.[a-z]+$/, '')
    return {
      ...result,
      [key]: item,
    }
  }, {})
}

const getRollupConfig = async (
  options: NormalizedOptions
): Promise<RollupConfig> => {
  setSilent(options.silent)

  const compilerOptions = parseCompilerOptions(options.dts?.compilerOptions)

  const dtsOptions = options.dts || {}
  dtsOptions.entry = dtsOptions.entry || options.entry

  if (Array.isArray(dtsOptions.entry) && dtsOptions.entry.length > 1) {
    dtsOptions.entry = toObjectEntry(dtsOptions.entry)
  }

  let tsResolveOptions: TsResolveOptions | undefined

  if (dtsOptions.resolve) {
    tsResolveOptions = {}
    // Only resolve specific types when `dts.resolve` is an array
    if (Array.isArray(dtsOptions.resolve)) {
      tsResolveOptions.resolveOnly = dtsOptions.resolve
    }

    // `paths` should be handled by rollup-plugin-dts
    if (compilerOptions.paths) {
      const res = Object.keys(compilerOptions.paths).map(
        (p) => new RegExp(`^${p.replace('*', '.+')}$`)
      )
      tsResolveOptions.ignore = (source) => {
        return res.some((re) => re.test(source))
      }
    }
  }

  const deps = await getDeps(process.cwd())

  const tsupCleanPlugin: Plugin = {
    name: 'tsup:clean',
    async buildStart() {
      if (options.clean) {
        await removeFiles(['**/*.d.ts'], options.outDir)
      }
    },
  }

  const ignoreFiles: Plugin = {
    name: 'tsup:ignore-files',
    load(id) {
      if (!/\.(js|cjs|mjs|jsx|ts|tsx|mts|json)$/.test(id)) {
        return ''
      }
    },
  }

  return {
    inputConfig: {
      input: dtsOptions.entry,
      onwarn(warning, handler) {
        if (
          warning.code === 'UNRESOLVED_IMPORT' ||
          warning.code === 'CIRCULAR_DEPENDENCY' ||
          warning.code === 'EMPTY_BUNDLE'
        ) {
          return
        }
        return handler(warning)
      },
      plugins: [
        tsupCleanPlugin,
        tsResolveOptions && tsResolvePlugin(tsResolveOptions),
        hashbangPlugin(),
        jsonPlugin(),
        ignoreFiles,
        dtsPlugin.default({
          compilerOptions: {
            ...compilerOptions,
            baseUrl: compilerOptions.baseUrl || '.',
            // Ensure ".d.ts" modules are generated
            declaration: true,
            // Skip ".js" generation
            noEmit: false,
            emitDeclarationOnly: true,
            // Skip code generation when error occurs
            noEmitOnError: true,
            // Avoid extra work
            checkJs: false,
            declarationMap: false,
            skipLibCheck: true,
            preserveSymlinks: false,
            // Ensure we can parse the latest code
            target: ts.ScriptTarget.ESNext,
          },
        }),
      ].filter(Boolean),
      external: [...deps, ...(options.external || [])],
    },
    outputConfig: {
      dir: options.outDir || 'dist',
      format: 'esm',
      exports: 'named',
      banner: dtsOptions.banner,
      footer: dtsOptions.footer,
    },
  }
}

async function runRollup(options: RollupConfig) {
  const { rollup } = await import('rollup')
  try {
    const start = Date.now()
    const getDuration = () => {
      return `${Math.floor(Date.now() - start)}ms`
    }
    logger.info('dts', 'Build start')
    const bundle = await rollup(options.inputConfig)
    const result = await bundle.write(options.outputConfig)
    logger.success('dts', `⚡️ Build success in ${getDuration()}`)
    reportSize(
      logger,
      'dts',
      result.output.reduce((res, info) => {
        const name = path.relative(
          process.cwd(),
          path.join(options.outputConfig.dir || '.', info.fileName)
        )
        return {
          ...res,
          [name]: info.type === 'chunk' ? info.code.length : info.source.length,
        }
      }, {})
    )
  } catch (error) {
    logger.error('dts', 'Build error')
    handleError(error)
  }
}

async function watchRollup(options: {
  inputConfig: InputOptions
  outputConfig: OutputOptions
}) {
  const { watch } = await import('rollup')

  watch({
    ...options.inputConfig,
    plugins: options.inputConfig.plugins,
    output: options.outputConfig,
  }).on('event', (event) => {
    if (event.code === 'START') {
      logger.info('dts', 'Build start')
    } else if (event.code === 'BUNDLE_END') {
      logger.success('dts', `⚡️ Build success in ${event.duration}ms`)
      parentPort?.postMessage('success')
    } else if (event.code === 'ERROR') {
      logger.error('dts', 'Build failed')
      handleError(event.error)
    }
  })
}

const startRollup = async (options: NormalizedOptions) => {
  const config = await getRollupConfig(options)
  if (options.watch) {
    watchRollup(config)
  } else {
    try {
      await runRollup(config)
      parentPort?.postMessage('success')
    } catch (error) {
      parentPort?.postMessage('error')
    }
    parentPort?.close()
  }
}

parentPort?.on('message', (data) => {
  logger.setName(data.configName)
  const hasTypescript = resolveFrom.silent(process.cwd(), 'typescript')
  if (!hasTypescript) {
    logger.error('dts', `You need to install "typescript" in your project`)
    parentPort?.postMessage('error')
    parentPort?.close()
    return
  }
  startRollup(data.options)
})
