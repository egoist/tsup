import fs from 'fs'
import path from 'path'
import type { InputOption } from 'rollup'
import { transform as transformToEs5 } from 'buble'
import {
  build as esbuild,
  BuildOptions,
  BuildResult,
  Plugin as EsbuildPlugin,
  formatMessages,
} from 'esbuild'
import { NormalizedOptions, Format } from '..'
import { getDeps, loadPkg } from '../load'
import { log } from '../log'
import { nodeProtocolPlugin } from './node-protocol'
import { externalPlugin } from './external'
import { postcssPlugin } from './postcss'
import { sveltePlugin } from './svelte'
import consola from 'consola'
import { getBabel } from '../utils'
import { PrettyError } from '../errors'
import { transform } from 'sucrase'

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

  log(format, 'info', 'Build start')

  const startTime = Date.now()

  let result: BuildResult | undefined

  const splitting =
    format === 'iife'
      ? false
      : typeof options.splitting === 'boolean'
      ? options.splitting
      : format === 'esm'

  const platform = options.platform || 'node'

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
      mainFields:
        platform === 'node'
          ? ['module', 'main']
          : ['browser', 'module', 'main'],
      plugins: [
        ...(format === 'cjs' ? [nodeProtocolPlugin()] : []),
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
        ...(format !== 'iife' ? [externalPlugin({
          patterns: external,
          skipNodeModulesBundle: options.skipNodeModulesBundle,
        })] : []),
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
        format === 'cjs' ? path.join(__dirname, '../assets/cjs_shims.js') : '',
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
}
