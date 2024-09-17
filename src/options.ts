import type { BuildOptions, Plugin as EsbuildPlugin, Loader } from 'esbuild'
import type { InputOption } from 'rollup'
import type { MinifyOptions } from 'terser'
import type { MarkRequired } from 'ts-essentials'
import type { Plugin } from './plugin'
import type { TreeshakingStrategy } from './plugins/tree-shaking'

export type KILL_SIGNAL = 'SIGKILL' | 'SIGTERM'

export type Format = 'cjs' | 'esm' | 'iife'

export type ContextForOutPathGeneration = {
  options: NormalizedOptions
  format: Format
  /** "type" field in project's package.json */
  pkgType?: string
}

export type OutExtensionObject = { js?: string; dts?: string }

export type OutExtensionFactory = (
  ctx: ContextForOutPathGeneration,
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
  /**
   * Overrides `compilerOptions`
   * This option takes higher priority than `compilerOptions` in tsconfig.json
   */
  compilerOptions?: any
}

export type ExperimentalDtsConfig = {
  entry?: InputOption
  /**
   * Overrides `compilerOptions`
   * This option takes higher priority than `compilerOptions` in tsconfig.json
   */
  compilerOptions?: any
}

export type BannerOrFooter =
  | {
      js?: string
      css?: string
    }
  | ((ctx: { format: Format }) => { js?: string; css?: string } | undefined)

export type BrowserTarget =
  | 'chrome'
  | 'deno'
  | 'edge'
  | 'firefox'
  | 'hermes'
  | 'ie'
  | 'ios'
  | 'node'
  | 'opera'
  | 'rhino'
  | 'safari'
export type BrowserTargetWithVersion =
  | `${BrowserTarget}${number}`
  | `${BrowserTarget}${number}.${number}`
  | `${BrowserTarget}${number}.${number}.${number}`
export type EsTarget =
  | 'es3'
  | 'es5'
  | 'es6'
  | 'es2015'
  | 'es2016'
  | 'es2017'
  | 'es2018'
  | 'es2019'
  | 'es2020'
  | 'es2021'
  | 'es2022'
  | 'es2023'
  | 'esnext'

export type Target =
  | BrowserTarget
  | BrowserTargetWithVersion
  | EsTarget
  | (string & {})

export type Entry = string[] | Record<string, string>

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
  entryPoints?: Entry
  entry?: Entry
  /**
   * Output different formats to different folder instead of using different extensions
   */
  legacyOutput?: boolean
  /**
   * Compile target
   *
   * default to `node16`
   */
  target?: Target | Target[]
  minify?: boolean | 'terser'
  terserOptions?: MinifyOptions
  minifyWhitespace?: boolean
  minifyIdentifiers?: boolean
  minifySyntax?: boolean
  keepNames?: boolean
  watch?: boolean | string | (string | boolean)[]
  ignoreWatch?: string[] | string
  onSuccess?:
    | string
    | (() => Promise<void | undefined | (() => void | Promise<void>)>)
  jsxFactory?: string
  jsxFragment?: string
  outDir?: string
  outExtension?: OutExtensionFactory
  format?: Format[] | Format
  globalName?: string
  env?: {
    [k: string]: string
  }
  define?: {
    [k: string]: string
  }
  dts?: boolean | string | DtsConfig
  experimentalDts?: boolean | string | ExperimentalDtsConfig
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
   * Default to `true` for ESM, `false` for CJS.
   *
   * You can set it to `true` explicitly, and may want to disable code splitting sometimes: [`#255`](https://github.com/egoist/tsup/issues/255)
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
   * Will still bundle modules matching the `noExternal` option
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
  platform?: 'node' | 'browser' | 'neutral'
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
  injectStyle?:
    | boolean
    | ((css: string, fileId: string) => string | Promise<string>)
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
  /**
   * Copy the files inside `publicDir` to output directory
   */
  publicDir?: string | boolean
  killSignal?: KILL_SIGNAL
  /**
   * Interop default within `module.exports` in cjs
   * @default false
   */
  cjsInterop?: boolean

  /**
   * Remove `node:` protocol from imports
   *
   * The default value will be flipped to `false` in the next major release
   * @default true
   */
  removeNodeProtocol?: boolean
}

export interface NormalizedExperimentalDtsConfig {
  entry: { [entryAlias: string]: string }
  compilerOptions?: any
}

export type NormalizedOptions = Omit<
  MarkRequired<Options, 'entry' | 'outDir'>,
  'dts' | 'experimentalDts' | 'format'
> & {
  dts?: DtsConfig
  experimentalDts?: NormalizedExperimentalDtsConfig
  tsconfigResolvePaths: Record<string, string[]>
  tsconfigDecoratorMetadata?: boolean
  format: Format[]
}
