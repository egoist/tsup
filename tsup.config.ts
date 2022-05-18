import { defineConfig } from 'tsup'

export default defineConfig({
  name: 'tsup',
  target: 'node12.20.0',
  dts: {
    resolve: true,
    // build types for `src/index.ts` only
    // otherwise `Options` will not be exported by `tsup`, not sure how this happens, probably a bug in rollup-plugin-dts
    entry: './src/index.ts',
  },
})
