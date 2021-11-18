import type { BuildOptions, Plugin as EsbuildPlugin } from 'esbuild'
import type { InputOption } from 'rollup'

export type Format = 'cjs' | 'esm' | 'iife'

/**
 * The options available in tsup.config.ts
 * Not all of them are available from CLI flags
 */
export type Options = {
  entryPoints?: BuildOptions['entryPoints']
  /**
   * Output different formats to differen folder instead of using different extensions
   */
  legacyOutput?: boolean
  /**
   * Compile target
   *
   * default to `node12`
   */
  target?: string
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
  format?: Format[]
  globalName?: string
  env?: {
    [k: string]: string
  }
  define?: {
    [k: string]: string
  }
  dts?:
    | boolean
    | string
    | {
        entry?: InputOption
        /** Resolve external types used in dts files from node_modules */
        resolve?: boolean | (string | RegExp)[]
      }
  sourcemap?: BuildOptions['sourcemap']
  /** Don't bundle these packages */
  external?: (string | RegExp)[]
  /** Transform the result with `@babel/core` */
  babel?: boolean
  /**
   * Replace `process.env.NODE_ENV` with `production` or `development`
   * `production` when the bundled is minified, `development` otherwise
   */
  replaceNodeEnv?: boolean
  /**
   * Code splitting
   * Default to `true`
   * You may want to disable code splitting sometimes: #255
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
   * Disable bunlding, default to true
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
  footer?: BuildOptions['footer']
  banner?: BuildOptions['banner']
  /**
   * Target platform
   * @default `node`
   */
  platform?: 'node' | 'browser'
}
