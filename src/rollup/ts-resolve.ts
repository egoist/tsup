import path from 'path'
import { PluginImpl } from 'rollup'
import _resolve from 'resolve'
import { pathExists } from '../utils'

const resolveModule = (
  id: string,
  opts: _resolve.AsyncOpts
): Promise<string | undefined> =>
  new Promise((resolve, reject) => {
    _resolve(id, opts, (err, res) => {
      if (err) return reject(err)
      resolve(res)
    })
  })

export type TsResolveOptions = {
  resolveOnly?: Array<string | RegExp>
}

export const tsResolvePlugin: PluginImpl<TsResolveOptions> = ({
  resolveOnly,
} = {}) => {
  return {
    name: `ts-resolve`,

    async resolveId(source, importer) {
      // ignore IDs with null character, these belong to other plugins
      if (/\0/.test(source)) return null

      if (source[0] !== '.' && !path.isAbsolute(source)) {
        if (resolveOnly) {
          const shouldResolve = resolveOnly.some((v) => {
            if (typeof v === 'string') return v === source
            return v.test(source)
          })
          if (!shouldResolve) return null
        }

        // Might still be a local file, like `input.ts`
        if (!importer && (await pathExists(path.resolve(source)))) {
          return null
        }
        const basedir = importer ? path.dirname(importer) : process.cwd()
        const id = await resolveModule(source, {
          basedir,
          extensions: ['.d.ts', '.ts'],
          packageFilter(pkg) {
            pkg.main = pkg.types || pkg.typings || pkg.module || pkg.main
            return pkg
          },
          paths: ['node_modules', 'node_modules/@types'],
        })

        return id
      }
      return null
    },
  }
}
