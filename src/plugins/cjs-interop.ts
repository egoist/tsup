import type {
  ExportDefaultExpression,
  ModuleDeclaration,
  ParseOptions,
} from '@swc/core'
import type { Visitor } from '@swc/core/Visitor'
import fs from 'fs/promises'
import path from 'path'
import { PrettyError } from '../errors'
import { Plugin } from '../plugin'
import { localRequire } from '../utils'

export const cjsInterop = (): Plugin => {
  return {
    name: 'cjs-interop',

    async renderChunk(code, info) {
      const { entryPoint } = info
      if (
        !this.options.cjsInterop ||
        this.format !== 'cjs' ||
        info.type !== 'chunk' ||
        !/\.(js|cjs)$/.test(info.path) ||
        !entryPoint
      ) {
        return
      }

      if (this.splitting) {
        // there is exports metadata when cjs+splitting is set
        if (info.exports?.length !== 1 || info.exports[0] !== 'default') return
      } else {
        const swc: typeof import('@swc/core') = localRequire('@swc/core')
        const { Visitor }: typeof import('@swc/core/Visitor') =
          localRequire('@swc/core/Visitor')
        if (!swc || !Visitor) {
          throw new PrettyError(
            `@swc/core is required for cjsInterop when splitting is not enabled. Please install it with \`npm install @swc/core -D\``
          )
        }

        try {
          const entrySource = await fs.readFile(entryPoint, {
            encoding: 'utf8',
          })
          const parseOptions = getParseOptions(entryPoint)
          if (!parseOptions) return
          const ast = await swc.parse(entrySource, parseOptions)
          const visitor = createExportVisitor(Visitor)
          visitor.visitProgram(ast)

          if (
            !visitor.hasExportDefaultExpression ||
            visitor.hasNonDefaultExportDeclaration
          )
            return
        } catch {
          return
        }
      }

      return {
        code: code + '\nmodule.exports=module.exports.default;\n',
        map: info.map,
      }
    },
  }
}

function getParseOptions(filename: string): ParseOptions | null {
  if (/\.([cm]?js|jsx)$/.test(filename))
    return {
      syntax: 'ecmascript',
      decorators: true,
      jsx: filename.endsWith('.jsx'),
    }
  if (/\.([cm]?ts|tsx)$/.test(filename))
    return {
      syntax: 'typescript',
      decorators: true,
      tsx: filename.endsWith('.tsx'),
    }
  return null
}

function createExportVisitor(VisitorCtor: typeof Visitor) {
  class ExportVisitor extends VisitorCtor {
    hasNonDefaultExportDeclaration = false
    hasExportDefaultExpression = false
    constructor() {
      super()
      type ExtractDeclName<T> = T extends `visit${infer N}` ? N : never
      const nonDefaultExportDecls: ExtractDeclName<keyof Visitor>[] = [
        'ExportDeclaration', // export const a = {}
        'ExportNamedDeclaration', // export {}, export * as a from './a'
        'ExportAllDeclaration', // export * from './a'
      ]

      nonDefaultExportDecls.forEach((decl) => {
        this[`visit${decl}`] = (n: any) => {
          this.hasNonDefaultExportDeclaration = true
          return n
        }
      })
    }
    visitExportDefaultExpression(
      n: ExportDefaultExpression
    ): ModuleDeclaration {
      this.hasExportDefaultExpression = true
      return n
    }
  }
  return new ExportVisitor()
}
