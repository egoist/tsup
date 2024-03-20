import type { ExportDefaultExpression, ModuleDeclaration } from '@swc/core'
import type { Visitor } from '@swc/core/Visitor'
import fs from 'fs/promises'
import { PrettyError } from '../errors'
import { Plugin } from '../plugin'
import { localRequire } from '../utils'

export const cjsInterop = (): Plugin => {
  return {
    name: 'cjs-interop',

    async renderChunk(code, info) {
      if (
        !this.options.cjsInterop ||
        this.format !== 'cjs' ||
        info.type !== 'chunk' ||
        !/\.(js|cjs)$/.test(info.path) ||
        !info.entryPoint
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

        let entrySource: string | undefined
        try {
          entrySource = await fs.readFile(info.entryPoint!, {
            encoding: 'utf8',
          })
        } catch {}
        if (!entrySource) return

        const ast = await swc.parse(entrySource, {
          syntax: 'typescript',
          decorators: true,
          tsx: true,
        })
        const visitor = createExportVisitor(Visitor)
        visitor.visitProgram(ast)

        if (
          !visitor.hasExportDefaultExpression ||
          visitor.hasNonDefaultExportDeclaration
        )
          return
      }

      return {
        code: code + '\nmodule.exports=module.exports.default;\n',
        map: info.map,
      }
    },
  }
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
