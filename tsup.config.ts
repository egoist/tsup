import fs from 'fs'
import { defineConfig } from 'tsup'

export default defineConfig({
  name: 'tsup',
  dts: {
    resolve: true,
    // build types for `src/index.ts` only
    // otherwise `Options` will not be exported by `tsup`, not sure how this happens, probbably a bug in rollup-plugin-dts
    entry: './src/index.ts',
  },
  esbuildPlugins: [
    {
      name: 'patch-rollup-plugin-dts',
      setup(build) {
        let removed = false
        build.onLoad({ filter: /rollup-plugin-dts/ }, async (args) => {
          const code = await fs.promises.readFile(args.path, 'utf-8')
          const RE = /preserveSymlinks:\s+true,/
          if (RE.test(code)) {
            removed = true
          }
          return {
            contents: code.replace(RE, ''),
            loader: 'js',
          }
        })
        build.onEnd(() => {
          if (!removed) {
            throw new Error('rollup-plugin-dts was not patched')
          }
        })
      },
    },
  ],
})
