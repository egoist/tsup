# tsup

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

Code splitting is enabled by default and supported in `cjs` and `esm` format.

### Excluding packages


By default tsup bundles all `import`-ed modules but `dependencies` in your `packages.json` are always excluded, you can also use `--external <module>` flag to mark other packages as external.

### Generate declaration file

```bash
tsup index.ts --dts
```

This will emit `./dist/index.js` and `./dist/index.d.ts`.

### Bundle formats

Supported format: `esm`, `cjs`, (default) and `iife`.

You can bundle in multiple format in one go:

```bash
tsup src/index.ts --format esm,cjs,iife
```

That will output files in following folder structure:

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
