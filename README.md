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

### Excluding packages


By default tsup bundles all `import`-ed modules but `dependencies` in your `packages.json` are always excluded, you can also use `--external <module>` flag to mark other packages as external.

### Generate declaration file

```bash
tsup index.ts --dts
```

This will emit `./dist/index.js` and `./dist/index.d.ts`.

If you want to bundle types from `node_modules` as well, use the `--dts-bundle` flag instead, which implicitly set `--dts` flag as well. (Note that this is experimental.)

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


### Run a program

```bash
tsup run main.ts
```

---

For more details:

```bash
tsup --help
```

## License

MIT &copy; [EGOIST (Kevin Titor)](https://github.com/sponsors/egoist)
