import { defineConfig } from 'tsup'
import pkg from './package.json'

export default defineConfig({
  name: 'tsup',
  format: ['esm'],
  target: 'node14.13.1',
  inject: ['./require.js'],
  define: {
    __PKG_VERSION__: JSON.stringify(pkg.version),
  },
  dts: {
    resolve: true,
    // build types for `src/index.ts` only
    // otherwise `Options` will not be exported by `tsup`, not sure how this happens, probbably a bug in rollup-plugin-dts
    entry: './src/index.ts',
  },
})
