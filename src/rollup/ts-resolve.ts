import fs from 'fs'
import path from 'path'
import type { PluginImpl } from 'rollup'
import _resolve from 'resolve'
import createDebug from 'debug'
import { builtinModules } from 'module'

const debug = createDebug('tsup:ts-resolve')

const resolveModule = (
  id: string,
  opts: _resolve.AsyncOpts,
): Promise<string | null> =>
  new Promise((resolve, reject) => {
    _resolve(id, opts, (err, res) => {
      // @ts-expect-error error code is not typed
      if (err?.code === 'MODULE_NOT_FOUND') return resolve(null)
      if (err) return reject(err)
      resolve(res || null)
    })
  })

export type TsResolveOptions = {
  resolveOnly?: Array<string | RegExp>
  ignore?: (source: string, importer?: string) => boolean
}

export const tsResolvePlugin: PluginImpl<TsResolveOptions> = ({
  resolveOnly,
  ignore,
} = {}) => {
  const resolveExtensions = ['.d.ts', '.ts']

  return {
    name: `ts-resolve`,

    async resolveId(source, importer) {
      debug('resolveId source: %s', source)
      debug('resolveId importer: %s ', importer)

      if (!importer) return null

      // ignore IDs with null character, these belong to other plugins
      if (/\0/.test(source)) return null

      if (builtinModules.includes(source)) return false

      if (ignore && ignore(source, importer)) {
        debug('ignored %s', source)
        return null
      }

      if (resolveOnly) {
        const shouldResolve = resolveOnly.some((v) => {
          if (typeof v === 'string') return v === source
          return v.test(source)
        })
        if (!shouldResolve) {
          debug('skipped by matching resolveOnly: %s', source)
          return null
        }
      }

      // Skip absolute path
      if (path.isAbsolute(source)) {
        debug(`skipped absolute path: %s`, source)
        return null
      }

      const basedir = importer
        ? await fs.promises.realpath(path.dirname(importer))
        : process.cwd()

      // A relative path
      if (source[0] === '.') {
        return resolveModule(source, {
          basedir,
          extensions: resolveExtensions,
        })
      }

      let id: string | null = null

      // Try resolving as relative path if `importer` is not present
      if (!importer) {
        id = await resolveModule(`./${source}`, {
          basedir,
          extensions: resolveExtensions,
        })
      }

      // Try resolving in node_modules
      if (!id) {
        id = await resolveModule(source, {
          basedir,
          extensions: resolveExtensions,
          packageFilter(pkg) {
            pkg.main = pkg.types || pkg.typings
            return pkg
          },
          paths: ['node_modules', 'node_modules/@types'],
        })
      }

      if (id) {
        debug('resolved %s to %s', source, id)
        return id
      }

      debug('mark %s as external', source)
      // Just make it external if can't be resolved, i.e. tsconfig path alias
      return false
    },
  }
}
