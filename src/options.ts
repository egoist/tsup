import type { BuildOptions, Plugin as EsbuildPlugin, Loader } from 'esbuild'
import type { InputOption } from 'rollup'
import { MarkRequired } from 'ts-essentials'
import type { Plugin } from './plugin'
import type { TreeshakingStrategy } from './plugins/tree-shaking'

export type Format = 'cjs' | 'esm' | 'iife'

export type ContextForOutPathGeneration = {
  options: NormalizedOptions
  format: Format
  /** "type" field in project's package.json */
  pkgType?: string
}

export type OutExtensionObject = { js?: string }

export type OutExtensionFactory = (
  ctx: ContextForOutPathGeneration
) => OutExtensionObject

export type DtsConfig = {
  entry?: InputOption
  /** Resolve external types used in dts files from node_modules */
  resolve?: boolean | (string | RegExp)[]
  /** Emit declaration files only */
  only?: boolean
  /** Insert at the top of each output .d.ts file  */
  banner?: string
  /** Insert at the bottom */
  footer?: string
}

export type BannerOrFooter =
  | {
      js?: string
      css?: string
    }
  | ((ctx: { format: Format }) => { js?: string; css?: string } | undefined)

/**
 * The options available in tsup.config.ts
 * Not all of them are available from CLI flags
 */
export type Options = {
  /** Optional config name to show in CLI output */
  name?: string
  /**
   * @deprecated Use `entry` instead
   */
  entryPoints?: BuildOptions['entryPoints']
  entry?: BuildOptions['entryPoints']
  /**
   * Output different formats to different folder instead of using different extensions
   */
  legacyOutput?: boolean
  /**
   * Compile target
   *
   * default to `node14`
   */
  target?: string | string[]
  minify?: boolean
  minifyWhitespace?: boolean
  minifyIdentifiers?: boolean
  minifySyntax?: boolean
  keepNames?: boolean
  watch?: boolean | string | (string | boolean)[]
  ignoreWatch?: string[] | string
  onSuccess?: string
  jsxFactory?: string
  jsxFragment?: string
  outDir?: string
  outExtension?: OutExtensionFactory
  format?: Format[] | string
  globalName?: string
  env?: {
    [k: string]: string
  }
  define?: {
    [k: string]: string
  }
  dts?: boolean | string | DtsConfig
  sourcemap?: boolean | 'inline'
  /** Always bundle modules matching given patterns */
  noExternal?: (string | RegExp)[]
  /** Don't bundle these modules */
  external?: (string | RegExp)[]
  /**
   * Replace `process.env.NODE_ENV` with `production` or `development`
   * `production` when the bundled is minified, `development` otherwise
   */
  replaceNodeEnv?: boolean
  /**
   * Code splitting
   * Default to `true`
   * You may want to disable code splitting sometimes: [`#255`](https://github.com/egoist/tsup/issues/255)
   */
  splitting?: boolean
  /**
   * Clean output directory before each build
   */
  clean?: boolean | string[]
  esbuildPlugins?: EsbuildPlugin[]
  esbuildOptions?: (options: BuildOptions, context: { format: Format }) => void
  /**
   * Suppress non-error logs (excluding "onSuccess" process output)
   */
  silent?: boolean
  /**
   * Skip node_modules bundling
   */
  skipNodeModulesBundle?: boolean
  /**
   * @see https://esbuild.github.io/api/#pure
   */
  pure?: string | string[]
  /**
   * Disable bundling, default to true
   */
  bundle?: boolean
  /**
   * This option allows you to automatically replace a global variable with an import from another file.
   * @see https://esbuild.github.io/api/#inject
   */
  inject?: string[]
  /**
   * Emit esbuild metafile
   * @see https://esbuild.github.io/api/#metafile
   */
  metafile?: boolean
  footer?: BannerOrFooter
  banner?: BannerOrFooter
  /**
   * Target platform
   * @default `node`
   */
  platform?: 'node' | 'browser'
  /**
   * Esbuild loader option
   */
  loader?: Record<string, Loader>
  /**
   * Disable config file with `false`
   * Or pass a custom config filename
   */
  config?: boolean | string
  /**
   * Use a custom tsconfig
   */
  tsconfig?: string
  /**
   * Inject CSS as style tags to document head
   * @default {false}
   */
  injectStyle?: boolean
  /**
   * Inject cjs and esm shims if needed
   * @default false
   */
  shims?: boolean
  /**
   * TSUP plugins
   * @experimental
   * @alpha
   */
  plugins?: Plugin[]
  /**
   * By default esbuild already does treeshaking
   *
   * But this option allow you to perform additional treeshaking with Rollup
   *
   * This can result in smaller bundle size
   */
  treeshake?: TreeshakingStrategy
}

export type NormalizedOptions = Omit<
  MarkRequired<Options, 'entry' | 'outDir'>,
  'dts' | 'format'
> & {
  dts?: DtsConfig
  tsconfigResolvePaths: Record<string, string[]>
  tsconfigDecoratorMetadata?: boolean
  format: Format[]
}
