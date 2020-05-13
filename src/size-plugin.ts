import { Plugin } from 'rollup'

type Cache = Map<string, () => number>

export const caches: Map<number, Cache> = new Map()

export const sizePlugin = (): Plugin => {
  const key = Math.random()
  let cache: Cache
  return {
    name: 'size',

    buildStart() {
      cache = new Map()
      caches.set(key, cache)
    },

    generateBundle(options, bundle, isWrite) {
      if (isWrite) {
        for (const key of Object.keys(bundle)) {
          const file = bundle[key]
          if (file.type === 'chunk') {
            cache.set(file.fileName, () => file.code.length)
          }
        }
      }
    },
  }
}
