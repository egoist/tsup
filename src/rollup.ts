import { parentPort } from 'node:worker_threads'
import path from 'node:path'
import ts from 'typescript'
import jsonPlugin from '@rollup/plugin-json'
import resolveFrom from 'resolve-from'
import { handleError } from './errors'
import { defaultOutExtension, removeFiles, toObjectEntry } from './utils'
import { type TsResolveOptions, tsResolvePlugin } from './rollup/ts-resolve'
import { createLogger, setSilent } from './log'
import { getProductionDeps, loadPkg } from './load'
import { reportSize } from './lib/report-size'
import type { NormalizedOptions } from './'
import type { InputOptions, OutputOptions, Plugin } from 'rollup'
import { FixDtsDefaultCjsExportsPlugin } from 'fix-dts-default-cjs-exports/rollup'

const logger = createLogger()

const parseCompilerOptions = (compilerOptions?: any) => {
  if (!compilerOptions) return {}
  const { options } = ts.parseJsonConfigFileContent(
    { compilerOptions },
    ts.sys,
    './',
  )
  return options
}

// Use `require` to esbuild use the cjs build of rollup-plugin-dts
// the mjs build of rollup-plugin-dts uses `import.meta.url` which makes Node throws syntax error
// since tsup is published as a commonjs module for now
const dtsPlugin: typeof import('rollup-plugin-dts') = require('rollup-plugin-dts')

type RollupConfig = {
  inputConfig: InputOptions
  outputConfig: OutputOptions[]
}

const getRollupConfig = async (
  options: NormalizedOptions,
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
        (p) => new RegExp(`^${p.replace('*', '.+')}$`),
      )
      tsResolveOptions.ignore = (source) => {
        return res.some((re) => re.test(source))
      }
    }
  }

  const pkg = await loadPkg(process.cwd())
  const deps = await getProductionDeps(process.cwd())

  const tsupCleanPlugin: Plugin = {
    name: 'tsup:clean',
    async buildStart() {
      if (options.clean) {
        await removeFiles(['**/*.d.{ts,mts,cts}'], options.outDir)
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
        jsonPlugin(),
        ignoreFiles,
        dtsPlugin.default({
          tsconfig: options.tsconfig,
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
      external: [
        // Exclude dependencies, e.g. `lodash`, `lodash/get`
        ...deps.map((dep) => new RegExp(`^${dep}($|\\/|\\\\)`)),
        ...(options.external || []),
      ],
    },
    outputConfig: options.format.map((format): OutputOptions => {
      const outputExtension =
        options.outExtension?.({ format, options, pkgType: pkg.type }).dts ||
        defaultOutExtension({ format, pkgType: pkg.type }).dts
      return {
        dir: options.outDir || 'dist',
        format: 'esm',
        exports: 'named',
        banner: dtsOptions.banner,
        footer: dtsOptions.footer,
        entryFileNames: `[name]${outputExtension}`,
        chunkFileNames: `[name]-[hash]${outputExtension}`,
        plugins: [
          format === 'cjs' && options.cjsInterop && FixDtsDefaultCjsExportsPlugin(),
        ].filter(Boolean),
      }
    }),
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
    const results = await Promise.all(options.outputConfig.map(bundle.write))
    const outputs = results.flatMap((result) => result.output)
    logger.success('dts', `⚡️ Build success in ${getDuration()}`)
    reportSize(
      logger,
      'dts',
      outputs.reduce((res, info) => {
        const name = path.relative(
          process.cwd(),
          path.join(options.outputConfig[0].dir || '.', info.fileName),
        )
        return {
          ...res,
          [name]: info.type === 'chunk' ? info.code.length : info.source.length,
        }
      }, {}),
    )
  } catch (error) {
    handleError(error)
    logger.error('dts', 'Build error')
  }
}

async function watchRollup(options: {
  inputConfig: InputOptions
  outputConfig: OutputOptions[]
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
    } catch {
      parentPort?.postMessage('error')
    }
  }
}

parentPort?.on('message', (data) => {
  logger.setName(data.configName)
  const hasTypescript = resolveFrom.silent(process.cwd(), 'typescript')
  if (!hasTypescript) {
    logger.error('dts', `You need to install "typescript" in your project`)
    parentPort?.postMessage('error')
    return
  }
  startRollup(data.options)
})
