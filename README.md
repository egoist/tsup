# tsup (personal fork)

A personal patch fork of [egoist/tsup](https://github.com/egoist/tsup) to keep it working through the TypeScript 6.x lifecycle. May be retired once the project moves fully to tsdown.

## 🔧 Changes from upstream

- **TypeScript 6.0 compatibility** — `baseUrl` was deprecated in TS 6.0 and will be removed in TS 7.0. Rather than silencing the error, `baseUrl` is now automatically translated into an equivalent `paths` catch-all entry (`"*": ["<baseUrl>/*"]`) when TS 6+ is detected, preserving identical resolution behaviour without the deprecation warning. Users on TS < 6 are unaffected.
- **`outDir` respected from tsconfig** — tsup now reads `compilerOptions.outDir` from your `tsconfig.json` and uses it as the output directory when you have not explicitly set one via `--out-dir` or your tsup config. The value is resolved relative to the tsconfig file, so it works correctly regardless of where tsup is invoked from.
- **DTS build performance fix** — type declaration generation could be up to 10× slower when tsup was run from outside the project root. The underlying cause was a hardcoded `'./'` passed to TypeScript's path resolver; it now uses the tsconfig file's own directory, giving TypeScript the correct anchor from the start.
- **Temp config file no longer pollutes the working directory** — the bundled config file that tsup writes during startup (previously `tsup.config.bundled_*.mjs` next to your config) is now written to `node_modules/.cache/tsup/`, keeping it out of reach of linters and version control.

## ⚙️ Install

```bash
npm i tsup -D
# Or Yarn
yarn add tsup --dev
# Or pnpm
pnpm add tsup -D
```

## 📖 Usage

```bash
tsup [...files]
```

Files are written into `./dist` by default, or the `outDir` from your `tsconfig.json` if set.

For full documentation see the [original tsup docs](https://tsup.egoist.dev) and [API reference](https://jsdocs.io/package/tsup).

## License

MIT &copy; [EGOIST](https://github.com/sponsors/egoist)
