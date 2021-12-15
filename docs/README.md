```js preact
import { html } from 'docup'

export default () => {
  let isPreview = location.hostname !== 'tsup.egoist.sh'

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

Install it locally in your project folder:

```bash
npm i tsup -D
# Or Yarn
yarn add tsup --dev
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

By default tsup bundles all `import`-ed modules but `dependencies` and `peerDependencies` in your `packages.json` are always excluded, you can also use `--external <module>` flag to mark other packages as external.

### Excluding all packages

If you are using **tsup** to build for **Node.js** applications/APIs, usually bundling dependencies is not needed, and it can even break things, for instance, while outputting to [ESM](https://nodejs.org/api/esm.html).

tsup automatically excludes packages specified in the `dependencies` and `peerDependencies` fields in the `packages.json`, but if it somehow doesn't exclude some packages, this library also has a special executable `tsup-node` that automatically skips bundling any Node.js package.

```bash
tsup-node src/index.ts
```

All other CLI flags still apply to this command.

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

[Check out all available options](https://github.com/egoist/tsup/blob/master/src/options.ts).

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

### Generate declaration file

```bash
tsup index.ts --dts
```

This will emit `./dist/index.js` and `./dist/index.d.ts`.

If you have multiple entry files, each entry will get a corresponding `.d.ts` file. So when you only want to generate declaration file for a single entry, use `--dts <entry>` format, e.g. `--dts src/index.ts`.

Note that `--dts` does not resolve external (aka in `node_modules`) types used in the `.d.ts` file, if that's somehow a requirement, try the experimental `--dts-resolve` flag instead.

#### Emit declaration file only

The `--dts-only` flag is the equivalent of the `emitDeclarationOnly` option in `tsc`. Using this flag will only emit the declaration file, without the JavaScript files.

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

### Code Splitting

Code splitting currently only works with the `esm` output format, and it's enabled by default. If you want code splitting for `cjs` output format as well, try using `--splitting` flag which is an experimental feature to get rid of [the limitation in esbuild](https://esbuild.github.io/api/#splitting).

To disable code splitting altogether, try the `--no-splitting` flag instead.

### ES5 support

You can use `--target es5` to compile the code down to es5, in this target your code will be transpiled by esbuild to es2020 first, and then transpiled to es5 by [SWC](https://swc.rc).

### Compile-time environment variables

You can use `--env` flag to define compile-time environment variables:

```bash
tsup src/index.ts --env.NODE_ENV production
```

### Building CLI app

When an entry file like `src/cli.ts` contains hashbang like `#!/bin/env node` tsup will automatically make the outout file executable, so you don't have to run `chmod +x dist/cli.js`.

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

> Warning: You should not use shell scripts, if you need to specify shell scripts you can add it in your "scripts" field and set for example `tsup src/index.ts --watch --onSuccess \"npm run dev\"`

### Minify output

You can also minify the output, resulting into lower bundle sizes by using the `--minify` flag.

```bash
tsup src/index.ts --minify
```

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

### What about type checking?

esbuild is fast because it doesn't perform any type checking, you already get type checking from your IDE like VS Code or WebStorm.

Additionally, if you want type checking at build time, you can enable `--dts`, which will run a real TypeScript compiler to generate declaration file so you get type checking as well.

### CSS support

esbuild has [experimental CSS support](https://esbuild.github.io/content-types/#css), and tsup allows you to use PostCSS plugins on top of native CSS support.

To use PostCSS, you need to install PostCSS:

```bash
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

## Troubleshooting

### error: No matching export in "xxx.ts" for import "xxx"

This usualy happens when you have `emitDecoratorMetadata` enabled in your tsconfig.json, in this mode we use [SWC](https://swc.rc) to transpile decorators to JavaScript so exported types will be eliminated, that's why esbuild won't be able to find corresponding exports. You can fix this by changing your import statement from `import { SomeType }` to `import { type SomeType }` or `import type { SomeType }`.

## License

MIT &copy; [EGOIST](https://github.com/sponsors/egoist)
