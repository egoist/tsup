import fs from 'fs'
import path from 'path'
import {
  build as esbuild,
  BuildResult,
  formatMessages,
  Plugin as EsbuildPlugin,
} from 'esbuild'
import { NormalizedOptions, Format } from '..'
import { getDeps, loadPkg } from '../load'
import { Logger, getSilent } from '../log'
import { nodeProtocolPlugin } from './node-protocol'
import { externalPlugin } from './external'
import { postcssPlugin } from './postcss'
import { sveltePlugin } from './svelte'
import consola from 'consola'
import { truthy } from '../utils'
import { swcPlugin } from './swc'
import { nativeNodeModulesPlugin } from './native-node-module'
import { PluginContainer } from '../plugin'
import { OutExtensionFactory } from '../options'

const defaultOutExtension = ({
  format,
  pkgType,
}: {
  format: Format
  pkgType?: string
}): { js: string } => {
  let jsExtension = '.js'
  const isModule = pkgType === 'module'
  if (isModule && format === 'cjs') {
    jsExtension = '.cjs'
  }
  if (!isModule && format === 'esm') {
    jsExtension = '.mjs'
  }
  if (format === 'iife') {
    jsExtension = '.global.js'
  }
  return {
    js: jsExtension,
  }
}

const getOutputExtensionMap = (
  options: NormalizedOptions,
  format: Format,
  pkgType: string | undefined
) => {
  const outExtension: OutExtensionFactory =
    options.outExtension || defaultOutExtension

  const defaultExtension = defaultOutExtension({ format, pkgType })
  const extension = outExtension({ options, format, pkgType })
  return {
    '.js': extension.js || defaultExtension.js,
  }
}

export async function runEsbuild(
  options: NormalizedOptions,
  {
    format,
    css,
    logger,
    buildDependencies,
    pluginContainer,
  }: {
    format: Format
    css?: Map<string, string>
    buildDependencies: Set<string>
    logger: Logger
    pluginContainer: PluginContainer
  }
) {
  const pkg = await loadPkg(process.cwd())
  const deps = await getDeps(process.cwd())
  const external = [
    // Exclude dependencies, e.g. `lodash`, `lodash/get`
    ...deps.map((dep) => new RegExp(`^${dep}($|\\/|\\\\)`)),
    ...(options.external || []),
  ]
  const outDir = options.outDir

  const outExtension = getOutputExtensionMap(options, format, pkg.type)
  const env: { [k: string]: string } = {
    ...options.env,
  }

  if (options.replaceNodeEnv) {
    env.NODE_ENV =
      options.minify || options.minifyWhitespace ? 'production' : 'development'
  }

  logger.info(format, 'Build start')

  const startTime = Date.now()

  let result: BuildResult | undefined

  const splitting =
    format === 'iife'
      ? false
      : typeof options.splitting === 'boolean'
        ? options.splitting
        : format === 'esm'

  const platform = options.platform || 'node'
  const loader = options.loader || {}
  const injectShims = options.shims

  pluginContainer.setContext({
    format,
    splitting,
    options,
    logger,
  })

  const esbuildPlugins: Array<EsbuildPlugin | false | undefined> = [
    format === 'cjs' && nodeProtocolPlugin(),
    {
      name: 'modify-options',
      setup(build) {
        pluginContainer.modifyEsbuildOptions(build.initialOptions)
        if (options.esbuildOptions) {
          options.esbuildOptions(build.initialOptions, { format })
        }
      },
    },
    // esbuild's `external` option doesn't support RegExp
    // So here we use a custom plugin to implement it
    format !== 'iife' &&
    externalPlugin({
      external,
      noExternal: options.noExternal,
      skipNodeModulesBundle: options.skipNodeModulesBundle,
      tsconfigResolvePaths: options.tsconfigResolvePaths,
    }),
    options.tsconfigDecoratorMetadata && swcPlugin({ logger }),
    nativeNodeModulesPlugin(),
    postcssPlugin({ css, inject: options.injectStyle }),
    sveltePlugin({ css }),
    ...(options.esbuildPlugins || []),
  ]

  const banner =
    typeof options.banner === 'function'
      ? options.banner({ format })
      : options.banner
  const footer =
    typeof options.footer === 'function'
      ? options.footer({ format })
      : options.footer

  try {
    result = await esbuild({
      entryPoints: options.entry,
      format: format === 'cjs' && splitting ? 'esm' : format,
      bundle: typeof options.bundle === 'undefined' ? true : options.bundle,
      platform,
      globalName: options.globalName,
      jsxFactory: options.jsxFactory,
      jsxFragment: options.jsxFragment,
      sourcemap: options.sourcemap ? 'external' : false,
      target: options.target,
      banner,
      footer,
      tsconfig: options.tsconfig,
      loader: {
        '.aac': 'file',
        '.css': 'file',
        '.eot': 'file',
        '.flac': 'file',
        '.gif': 'file',
        '.jpeg': 'file',
        '.jpg': 'file',
        '.mp3': 'file',
        '.mp4': 'file',
        '.ogg': 'file',
        '.otf': 'file',
        '.png': 'file',
        '.svg': 'file',
        '.ttf': 'file',
        '.wav': 'file',
        '.webm': 'file',
        '.webp': 'file',
        '.woff': 'file',
        '.woff2': 'file',
        ...loader,
      },
      mainFields:
        platform === 'node'
          ? ['module', 'main']
          : ['browser', 'module', 'main'],
      plugins: esbuildPlugins.filter(truthy),
      define: {
        TSUP_FORMAT: JSON.stringify(format),
        ...(format === 'cjs' && injectShims
          ? {
            'import.meta.url': 'importMetaUrl',
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
        format === 'cjs' && injectShims
          ? path.join(__dirname, '../assets/cjs_shims.js')
          : '',
        format === 'esm' && injectShims && platform === 'node'
          ? path.join(__dirname, '../assets/esm_shims.js')
          : '',
        ...(options.inject || []),
      ].filter(Boolean),
      outdir:
        options.legacyOutput && format !== 'cjs'
          ? path.join(outDir, format)
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
      metafile: true,
    })
  } catch (error) {
    logger.error(format, 'Build failed')
    throw error
  }

  if (result && result.warnings && !getSilent()) {
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
    logger.success(format, `⚡️ Build success in ${Math.floor(timeInMs)}ms`)

    await pluginContainer.buildFinished({
      outputFiles: result.outputFiles,
      metafile: result.metafile,
    })
  }

  if (result.metafile) {
    for (const file of Object.keys(result.metafile.inputs)) {
      buildDependencies.add(file)
    }

    if (options.metafile) {
      const outPath = path.resolve(outDir, `metafile-${format}.json`)
      await fs.promises.mkdir(path.dirname(outPath), { recursive: true })
      await fs.promises.writeFile(
        outPath,
        JSON.stringify(result.metafile),
        'utf8'
      )
    }
  }
}
