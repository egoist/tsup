# tsup

[![npm version](https://badgen.net/npm/v/tsup)](https://npm.im/tsup) [![npm downloads](https://badgen.net/npm/dm/tsup)](https://npm.im/tsup)

Bundle your TypeScript library with no config, powered by [esbuild](https://github.com/evanw/esbuild).

## What can it bundle?

Anything that's supported by Node.js natively, namely `.js`, `.json`, `.mjs`. And TypeScript `.ts`, `.tsx`.

This project is designed for bundling Node.js libraries.

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

Code splitting is enabled by default and supported in `cjs` and `esm` format.

### Excluding packages

By default tsup bundles all `import`-ed modules but `dependencies` in your `packages.json` are always excluded, you can also use `--external <module>` flag to mark other packages as external.

### Generate declaration file

```bash
tsup index.ts --dts
```

This will emit `./dist/index.js` and `./dist/index.d.ts`.

If you set multiple entry files, each entry will get a corresponding `.d.ts` file.

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

### ES5 support

You can use `--target es5` or `"target": "es5"` in `tsconfig.json` to compile the code down to es5, it's processed by [buble](http://buble.surge.sh/). Some features are NOT supported by this target, namely: `for .. of`.

### Building CLI app

When an entry file like `src/cli.ts` contains hashbang like `#!/bin/env node` tsup will automatically make the outout file executable, so you don't have to run `chmod +x dist/cli.js`.

### Watch mode

```bash
tsup src/index.ts --watch
```

### What about type checking?

esbuild is fast because it doesn't perform any type checking, you already get type checking from your IDE like VS Code or WebStorm.

Additionally, if you want type checking at build time, you can enable `--dts`, which will run a real TypeScript compiler to generate declaration file so you get type checking as well.

---

For more details:

```bash
tsup --help
```

## License

MIT &copy; [EGOIST (Kevin Titor)](https://github.com/sponsors/egoist)
