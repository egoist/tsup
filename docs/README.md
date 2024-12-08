```js preact
import { html } from 'docup'

export default () => {
  const isPreview = location.hostname !== 'tsup.egoist.dev'

  if (!isPreview) return null

  return html`
    <div class="message message_type__warning">
      This is a preview version of the docs.
    </div>
  `
}
```

Bundle your TypeScript library with no config, powered by [esbuild](https://github.com/evanw/esbuild).

## What can it bundle?

Anything that's supported by Node.js natively, namely `.js`, `.json`, `.mjs`. And TypeScript `.ts`, `.tsx`. [CSS support is experimental](#css-support).

## Install

Install tsup locally in your project folder:

```bash
npm i tsup -D
# Or Yarn
yarn add tsup --dev
# Or pnpm
pnpm add tsup -D
```

You can also install it globally but it's not recommended.

## Usage

### Bundle files

```bash
tsup [...files]
```

Files are written into `./dist`.

You can bundle multiple files in one go:

```bash
tsup src/index.ts src/cli.ts
```

This will output `dist/index.js` and `dist/cli.js`.

### Excluding packages

By default tsup bundles all `import`-ed modules but `dependencies` and `peerDependencies` in your `package.json` are always excluded. You can also use the `--external <module|pkgJson>` flag to mark other packages or other special `package.json`'s `dependencies` and `peerDependencies` as external.

### Excluding all packages

If you are using **tsup** to build for **Node.js** applications/APIs, usually bundling dependencies is not needed, and it can even break things, for instance, while outputting to [ESM](https://nodejs.org/api/esm.html).

tsup automatically excludes packages specified in the `dependencies` and `peerDependencies` fields in the `package.json`, but if it somehow doesn't exclude some packages, this library also has a special executable `tsup-node` that automatically skips bundling any Node.js package.

```bash
tsup-node src/index.ts
```

All other CLI flags still apply to this command. You can still use the `noExternal` option to reinclude packages in the bundle,
for example packages that belong to a local monorepository.

**If the regular `tsup` command doesn't work for you, please submit an issue with a link to your repo so we can make the default command better.**

### Using custom configuration

You can also use `tsup` using file configurations or in a property inside your `package.json`, and you can even use `TypeScript` and have type-safety while you are using it.

> INFO: Most of these options can be overwritten using the CLI options

You can use any of these files:

- `tsup.config.ts`
- `tsup.config.js`
- `tsup.config.cjs`
- `tsup.config.json`
- `tsup` property in your `package.json`

> INFO: In all the custom files you can export the options either as `tsup`, `default` or `module.exports =`

You can also specify a custom filename using the `--config` flag, or passing `--no-config` to disable config files.

[Check out all available options](https://jsdocs.io/package/tsup).

#### TypeScript / JavaScript

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  splitting: false,
  sourcemap: true,
  clean: true,
})
```

#### Conditional config

If the config needs to be conditionally determined based on CLI flags, it can export a function instead:

```ts
import { defineConfig } from 'tsup'

export default defineConfig((options) => {
  return {
    minify: !options.watch,
  }
})
```

The `options` here is derived from CLI flags.

#### package.json

```json
{
  "tsup": {
    "entry": ["src/index.ts"],
    "splitting": false,
    "sourcemap": true,
    "clean": true
  },
  "scripts": {
    "build": "tsup"
  }
}
```

#### JSON Schema Store

Developers who are using [vscode](https://code.visualstudio.com/) or a text editor that supports the JSON Language Server can leverage the [tsup schema store](https://cdn.jsdelivr.net/npm/tsup/schema.json) via CDN. This schema store will provide intellisense capabilities such as completions, validations and descriptions within JSON file configurations like the `tsup.config.json` and `package.json` (tsup) property.

Provide the following configuration in your `.vscode/settings.json` (or global) settings file:

```json
{
  "json.schemas": [
    {
      "url": "https://cdn.jsdelivr.net/npm/tsup/schema.json",
      "fileMatch": ["package.json", "tsup.config.json"]
    }
  ]
}
```

### Multiple entrypoints

Beside using positional arguments `tsup [...files]` to specify multiple entrypoints, you can also use the cli flag `--entry`:

```bash
# Outputs `dist/a.js` and `dist/b.js`.
tsup --entry src/a.ts --entry src/b.ts
```

The associated output file names can be defined as follows:

```bash
# Outputs `dist/foo.js` and `dist/bar.js`.
tsup --entry.foo src/a.ts --entry.bar src/b.ts
```

This is equivalent to the following `tsup.config.ts`:

```ts
export default defineConfig({
  // Outputs `dist/a.js` and `dist/b.js`.
  entry: ['src/a.ts', 'src/b.ts'],
  // Outputs `dist/foo.js` and `dist/bar.js`
  entry: {
    foo: 'src/a.ts',
    bar: 'src/b.ts',
  },
})
```

### Generate declaration file

```bash
tsup index.ts --dts
```

This will emit `./dist/index.js` and `./dist/index.d.ts`. When emitting multiple [bundle formats](#bundle-formats), one declaration file per bundle format is generated. This is required for consumers to get accurate type checking with TypeScript. Note that declaration files generated by any tool other than `tsc` are not guaranteed to be error-free, so it's a good idea to test the output with `tsc` or a tool like [@arethetypeswrong/cli](https://www.npmjs.com/package/@arethetypeswrong/cli) before publishing.

If you have multiple entry files, each entry will get a corresponding `.d.ts` file. So when you only want to generate a declaration file for a single entry, use `--dts <entry>` format, e.g. `--dts src/index.ts`.

Note that `--dts` does not resolve external (aka in `node_modules`) types used in the `.d.ts` file. If that's somehow a requirement, try the experimental `--dts-resolve` flag instead.

Since tsup version 8.0.0, you can also use `--experimental-dts` flag to generate declaration files. This flag uses [@microsoft/api-extractor](https://www.npmjs.com/package/@microsoft/api-extractor) to generate declaration files, which is more reliable than the previous `--dts` flag. It's still experimental and we are looking for feedback.

To use `--experimental-dts`, you would need to install `@microsoft/api-extractor`, as it's a peer dependency of tsup:

```bash
npm i @microsoft/api-extractor -D
# Or Yarn
yarn add @microsoft/api-extractor --dev
```

#### Emit declaration file only

The `--dts-only` flag is the equivalent of the `emitDeclarationOnly` option in `tsc`. Using this flag will only emit the declaration file, without the JavaScript files.

#### Generate TypeScript declaration maps (.d.ts.map)

TypeScript declaration maps are mainly used to quickly jump to type definitions in the context of a monorepo (see [source issue](https://github.com/Microsoft/TypeScript/issues/14479) and [official documentation](https://www.typescriptlang.org/tsconfig/#declarationMap)).

They should not be included in a published NPM package and should not be confused with sourcemaps.

[Tsup is not able to generate those files](https://github.com/egoist/tsup/issues/564). Instead, you should use the TypeScript compiler directly, by running the following command after the build is done: `tsc --emitDeclarationOnly --declaration`.

You can combine this command with Tsup [`onSuccess`](https://tsup.egoist.dev/#onsuccess) callback.

### Generate sourcemap file

```bash
tsup index.ts --sourcemap
```

This will emit `./dist/index.js` and `./dist/index.js.map`.

If you set multiple entry files, each entry will get a corresponding `.map` file.

If you want to inline sourcemap, you can try:

```bash
tsup index.ts --sourcemap inline
```

> Warning: Note that inline sourcemap is solely used for development, e.g. when developing a browser extension and the access to `.map` file is not allowed, and it's not recommended for production.

> Warning: Source map is not supported in `--dts` build.

### Bundle formats

Supported format: `esm`, `cjs`, (default) and `iife`.

You can bundle in multiple formats in one go:

```bash
tsup src/index.ts --format esm,cjs,iife
```

That will output files in following folder structure:

```bash
dist
├── index.mjs         # esm
├── index.global.js   # iife
└── index.js          # cjs
```

If the `type` field in your `package.json` is set to `module`, the filenames will be slightly different:

```bash
dist
├── index.js          # esm
├── index.global.js   # iife
└── index.cjs         # cjs
```

Read more about [`esm` support in Node.js](https://nodejs.org/api/esm.html#esm_enabling).

If you don't want extensions like `.mjs` or `.cjs`, e.g. you want your library to be used in a bundler (or environment) that doesn't support those, you can enable `--legacy-output` flag:

```bash
tsup src/index.ts --format esm,cjs,iife --legacy-output
```

..which outputs to:

```bash
dist
├── esm
│   └── index.js
├── iife
│   └── index.js
└── index.js
```

### Output extension

You can also change the output extension of the files by using `outExtension` option:

```ts
export default defineConfig({
  outExtension({ format }) {
    return {
      js: `.${format}.js`,
    }
  },
})
```

This will generate your files to `[name].[format].js`.

The signature of `outExtension` is:

```ts
type OutExtension = (ctx: Context) => Result

type Context = {
  options: NormalizedOptions
  format: Format
  /** "type" field in project's package.json */
  pkgType?: string
}

type Result = { js?: string }
```

### Code Splitting

Code splitting currently only works with the `esm` output format, and it's enabled by default. If you want code splitting for `cjs` output format as well, try using `--splitting` flag which is an experimental feature to get rid of [the limitation in esbuild](https://esbuild.github.io/api/#splitting).

To disable code splitting altogether, try the `--no-splitting` flag instead.

### Target environment

You can use the `target` option in `tsup.config.ts` or the `--target` flag to set the target environment for the generated JavaScript and/or CSS code. Each target environment is an environment name followed by a version number. The following environment names are currently supported:

- chrome
- edge
- firefox
- hermes
- ie
- ios
- node
- opera
- rhino
- safari

In addition, you can also specify JavaScript language versions such as `es2020`.

The value for `target` defaults to `compilerOptions.target` in your `tsconfig.json`, or `node14` if unspecified. For more information check out esbuild's [target](https://esbuild.github.io/api/#target) option.

#### ES5 support

You can use `--target es5` to compile the code down to es5, in this target your code will be transpiled by esbuild to es2020 first, and then transpiled to es5 by [SWC](https://swc.rs).

### Compile-time environment variables

You can use `--env` flag to define compile-time environment variables:

```bash
tsup src/index.ts --env.NODE_ENV production
```

Note that `--env.VAR_NAME` only recognizes `process.env.VAR_NAME` and `import.meta.env.VAR_NAME`. If you use `process.env`, it will only take effect when it is used as a built-in global variable. Therefore, do not import `process` from `node:process`.

### Building CLI app

When an entry file like `src/cli.ts` contains hashbang like `#!/bin/env node` tsup will automatically make the output file executable, so you don't have to run `chmod +x dist/cli.js`.

### Interop with CommonJS

By default, esbuild will transform `export default x` to `module.exports.default = x` in CommonJS, but you can change this behavior by using the `--cjsInterop` flag: If there are only default exports and no named exports, it will be transformed to `module.exports = x` instead.

```bash
tsup src/index.ts --cjsInterop
```

### Watch mode

```bash
tsup src/index.ts --watch
```

Turn on watch mode. This means that after the initial build, tsup will continue to watch for changes in any of the resolved files.

> INFO: By default it always ignores `dist`, `node_modules` & `.git`

```bash
tsup src/index.ts --watch --ignore-watch ignore-this-folder-too
```

> INFO: You can specify more than a folder repeating "--ignore-watch", for example: `tsup src src/index.ts --watch --ignore-watch folder1 --ignore-watch folder2`

### onSuccess

You can specify command to be executed after a successful build, specially useful for **Watch mode**

```bash
tsup src/index.ts --watch --onSuccess "node dist/index.js"
```

`onSuccess` can also be a `function` that returns `Promise`. For this to work, you need to use `tsup.config.ts` instead of the cli flag:

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  async onSuccess() {
    // Start some long running task
    // Like a server
  },
})
```

You can return a cleanup function in `onSuccess`:

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  onSuccess() {
    const server = http.createServer((req, res) => {
      res.end('Hello World!')
    })
    server.listen(3000)
    return () => {
      server.close()
    }
  },
})
```

### Minify output

You can also minify the output, resulting into lower bundle sizes by using the `--minify` flag.

```bash
tsup src/index.ts --minify
```

To use [Terser](https://github.com/terser/terser) instead of esbuild for minification, pass terser as argument value

```bash
tsup src/index.ts --minify terser
```

> NOTE: You must have terser installed. Install it with `npm install -D terser`

In `tsup.config.js`, you can pass `terserOptions` which will be passed to `terser.minify` as it is.

### Custom loader

Esbuild loader list:

```ts
type Loader =
  | 'js'
  | 'jsx'
  | 'ts'
  | 'tsx'
  | 'css'
  | 'json'
  | 'text'
  | 'base64'
  | 'file'
  | 'dataurl'
  | 'binary'
  | 'copy'
  | 'default'
```

To use a custom loader via CLI flag:

```bash
tsup --loader ".jpg=base64" --loader ".webp=file"
```

Or via `tsup.config.ts`:

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  loader: {
    '.jpg': 'base64',
    '.webp': 'file',
  },
})
```

### Tree shaking

esbuild has [tree shaking](https://esbuild.github.io/api/#tree-shaking) enabled by default, but sometimes it's not working very well, see [#1794](https://github.com/evanw/esbuild/issues/1794) [#1435](https://github.com/evanw/esbuild/issues/1435), so tsup offers an additional option to let you use Rollup for tree shaking instead:

```bash
tsup src/index.ts --treeshake
```

This flag above will enable Rollup for tree shaking, and it's equivalent to the following `tsup.config.ts`:

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  treeshake: true,
})
```

This option has the same type as the `treeshake` option in Rollup, [see more](https://rollupjs.org/guide/en/#treeshake).

### What about type checking?

esbuild is fast because it doesn't perform any type checking, you already get type checking from your IDE like VS Code or WebStorm.

Additionally, if you want type checking at build time, you can enable `--dts`, which will run a real TypeScript compiler to generate declaration file so you get type checking as well.

### CSS support

esbuild has [experimental CSS support](https://esbuild.github.io/content-types/#css), and tsup allows you to use PostCSS plugins on top of native CSS support.

To use PostCSS, you need to install PostCSS:

```bash
npm i postcss -D
# Or Yarn
yarn add postcss --dev
```

..and populate a `postcss.config.js` in your project

```js
module.exports = {
  plugins: [require('tailwindcss')(), require('autoprefixer')()],
}
```

### Metafile

Passing `--metafile` flag to tell esbuild to produce some metadata about the build in JSON format. You can feed the output file to analysis tools like [bundle buddy](https://www.bundle-buddy.com/esbuild) to visualize the modules in your bundle and how much space each one takes up.

The file outputs as `metafile-{format}.json`, e.g. `tsup --format cjs,esm` will generate `metafile-cjs.json` and `metafile-esm.json`.

### Custom esbuild plugin and options

Use `esbuildPlugins` and `esbuildOptions` respectively in `tsup.config.ts`:

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  esbuildPlugins: [YourPlugin],
  esbuildOptions(options, context) {
    options.define.foo = '"bar"'
  },
})
```

The `context` argument for `esbuildOptions`:

- `context.format`: `cjs`, `esm`, `iife`

See all options [here](https://esbuild.github.io/api/#build-api), and [how to write an esbuild plugin](https://esbuild.github.io/plugins/#using-plugins).

---

For more details:

```bash
tsup --help
```

### Inject cjs and esm shims

Enabling this option will fill in some code when building esm/cjs to make it work, such as `__dirname` which is only available in the cjs module and `import.meta.url` which is only available in the esm module

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  shims: true,
})
```

- When building the cjs bundle, it will compile `import.meta.url` as `typeof document === "undefined" ? new URL("file:" + __filename).href : document.currentScript && document.currentScript.src || new URL("main.js", document.baseURI).href`
- When building the esm bundle, it will compile `__dirname` as `path.dirname(fileURLToPath(import.meta.url))`

### Copy files to output directory

Use `--publicDir` flag to copy files inside `./public` folder to the output directory.

You can also specify a custom directory using `--publicDir another-directory`.

### JavaScript API

If you want to use `tsup` in your Node.js program, you can use the JavaScript API:

```js
import { build } from 'tsup'

await build({
  entry: ['src/index.ts'],
  sourcemap: true,
  dts: true,
})
```

For all available options for the `build` function, please see [the API docs](https://jsdocs.io/package/tsup).

### Using custom tsconfig.json

You can also use custom tsconfig.json file configurations by using the `--tsconfig` flag:

```bash
tsup --tsconfig tsconfig.prod.json
```

By default, tsup try to find the `tsconfig.json` file in the current directory, if it's not found, it will use the default tsup config.

## Troubleshooting

### error: No matching export in "xxx.ts" for import "xxx"

This usually happens when you have `emitDecoratorMetadata` enabled in your tsconfig.json, in this mode we use [SWC](https://swc.rs) to transpile decorators to JavaScript so exported types will be eliminated, that's why esbuild won't be able to find corresponding exports. You can fix this by changing your import statement from `import { SomeType }` to `import { type SomeType }` or `import type { SomeType }`.

## License

MIT &copy; [EGOIST](https://github.com/sponsors/egoist)
