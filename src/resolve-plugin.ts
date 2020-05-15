import { builtinModules } from 'module'
import { dirname } from 'path'
import { Plugin } from 'rollup'
import JoyCon from 'joycon'
import nodeResolvePlugin from '@rollup/plugin-node-resolve'
import { isExternal } from './utils'

const PACKAGE_NAME_RE = /^[@a-z]/

const joycon = new JoyCon()

export const resolvePlugin = ({
  bundle,
  external,
  dts,
}: {
  bundle?: boolean
  external?: string[]
  dts?: boolean
}): Plugin => {
  const nodeResolve = nodeResolvePlugin({
    mainFields: dts ? ['types', 'typings'] : ['module', 'main'],
    extensions: dts ? ['.d.ts'] : ['.mjs', '.js', '.json', '.node'],
    customResolveOptions: {
      moduleDirectory: dts
        ? ['node_modules/@types', 'node_modules']
        : 'node_modules',
    },
  })

  return {
    ...nodeResolve,

    async resolveId(source, importer) {
      // Always exclude builtin modules
      if (builtinModules.includes(source)) {
        return false
      }

      if (bundle) {
        const cwd = importer && dirname(importer)
        if (cwd && PACKAGE_NAME_RE.test(source)) {
          // Exclude specified packages
          if (external && isExternal(external, source, importer)) {
            return false
          }

          // Exclude "dependencies" in package.json
          const pkg = joycon.loadSync(['package.json'], process.cwd())

          const deps = Object.keys((pkg.data && pkg.data.dependencies) || {})

          if (deps.includes(source)) {
            return false
          }
        }

        const result = await nodeResolve.resolveId!.call(this, source, importer)

        if (result !== null) {
          return result
        }
      }

      return null
    },
  }
}
