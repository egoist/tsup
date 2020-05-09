import {builtinModules} from 'module'
import { dirname } from 'path'
import { Plugin } from 'rollup'
import r, { Opts as ResolveOpts } from 'resolve'

const resolvePackage = (id: string, options: ResolveOpts): Promise<string> =>
  new Promise((resolve, reject) => {
    r(id, options, (err, result) => {
      if (err) {
        return reject(err)
      }
      resolve(result)
    })
  })

const PACKAGE_NAME_RE = /^[@a-z]/

export const resolvePlugin = (): Plugin => {
  return {
    name: 'resolve',

    async resolveId(source, importer) {
      // Always exclude builtin modules
      if (builtinModules.includes(source)) {
        return false
      }

      const cwd = importer && dirname(importer)
      if (cwd && PACKAGE_NAME_RE.test(source)) {
        const id = await resolvePackage(source, { basedir: cwd })
        return id
      }
      return null
    },
  }
}
