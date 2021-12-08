import fs from 'fs'
import path from 'path'
import { transform as transformToEs5 } from 'buble'
import {
  build as esbuild,
  BuildResult,
  formatMessages,
  Plugin as EsbuildPlugin,
} from 'esbuild'
import { NormalizedOptions, Format } from '..'
import { getDeps, loadPkg } from '../load'
import { Logger } from '../log'
import { nodeProtocolPlugin } from './node-protocol'
import { externalPlugin } from './external'
import { postcssPlugin } from './postcss'
import { sveltePlugin } from './svelte'
import consola from 'consola'
import { getBabel, truthy } from '../utils'
import { PrettyError } from '../errors'
import { transform } from 'sucrase'
import { swcPlugin } from './swc'
import { nativeNodeModulesPlugin } from './native-node-module'

const getOutputExtensionMap = (
  pkgTypeField: string | undefined,
  format: Format
) => {
  const isModule = pkgTypeField === 'module'
  const map: Record<string, string> = {}
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
  {
    format,
    css,
    logger,
    buildDependencies,
  }: {
    format: Format
    css?: Map<string, string>
    buildDependencies: Set<string>
    logger: Logger
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

  const outExtension = getOutputExtensionMap(pkg.type, format)
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
  const injectShims = options.shims !== false

  const esbuildPlugins: Array<EsbuildPlugin | false | undefined> = [
    format === 'cjs' && nodeProtocolPlugin(),
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
    format !== 'iife' &&
      externalPlugin({
        external,
        skipNodeModulesBundle: options.skipNodeModulesBundle,
        tsconfigResolvePaths: options.tsconfigResolvePaths,
      }),
    options.tsconfigDecoratorMetadata && swcPlugin({ logger }),
    nativeNodeModulesPlugin(),
    postcssPlugin({ css }),
    sveltePlugin({ css }),
    ...(options.esbuildPlugins || []),
  ]

  try {
    result = await esbuild({
      entryPoints: options.entryPoints,
      format: format === 'cjs' && splitting ? 'esm' : format,
      bundle: typeof options.bundle === 'undefined' ? true : options.bundle,
      platform,
      globalName: options.globalName,
      jsxFactory: options.jsxFactory,
      jsxFragment: options.jsxFragment,
      sourcemap: options.sourcemap,
      target: options.target === 'es5' ? 'es2016' : options.target,
      footer: options.footer,
      banner: options.banner,
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
    logger.success(format, `⚡️ Build success in ${Math.floor(timeInMs)}ms`)

    await Promise.all(
      result.outputFiles.map(async (file) => {
        const dir = path.dirname(file.path)
        const outPath = file.path
        const ext = path.extname(outPath)
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
              if (error instanceof Error) {
                throw new PrettyError(
                  `Error compiling to es5 target:\n${
                    // @ts-expect-error not sure how to type error.snippet
                    error.snippet || error.message
                  }`
                )
              } else {
                throw error
              }
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
