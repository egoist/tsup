import path from 'node:path'
import { slash, trimDtsExtension, truthy } from './utils'

export type ExportDeclaration = ModuleExport | NamedExport

interface ModuleExport {
  kind: 'module'
  sourceFileName: string
  destFileName: string
  moduleName: string
  isTypeOnly: boolean
}

interface NamedExport {
  kind: 'named'
  sourceFileName: string
  destFileName: string
  alias: string
  name: string
  isTypeOnly: boolean
}

export function formatAggregationExports(
  exports: ExportDeclaration[],
  declarationDirPath: string,
): string {
  const lines = exports
    .map((declaration) =>
      formatAggregationExport(declaration, declarationDirPath),
    )
    .filter(truthy)

  if (lines.length === 0) {
    lines.push('export {};')
  }

  return `${lines.join('\n')}\n`
}

function formatAggregationExport(
  declaration: ExportDeclaration,
  declarationDirPath: string,
): string {
  const dest = trimDtsExtension(
    `./${path.posix.normalize(
      slash(path.relative(declarationDirPath, declaration.destFileName)),
    )}`,
  )

  if (declaration.kind === 'module') {
    // No implemeted
    return ''
  } else if (declaration.kind === 'named') {
    return [
      'export',
      declaration.isTypeOnly ? 'type' : '',
      '{',
      declaration.name,
      declaration.name === declaration.alias ? '' : `as ${declaration.alias}`,
      '} from',
      `'${dest}';`,
    ]
      .filter(truthy)
      .join(' ')
  } else {
    throw new Error('Unknown declaration')
  }
}

export function formatDistributionExports(
  exports: ExportDeclaration[],
  fromFilePath: string,
  toFilePath: string,
) {
  let importPath = trimDtsExtension(
    path.posix.relative(
      path.posix.dirname(path.posix.normalize(slash(fromFilePath))),
      path.posix.normalize(slash(toFilePath)),
    ),
  )
  if (!/^\.+\//.test(importPath)) {
    importPath = `./${importPath}`
  }

  const seen = {
    named: new Set<string>(),
    module: new Set<string>(),
  }

  const lines = exports
    .filter((declaration) => {
      if (declaration.kind === 'module') {
        if (seen.module.has(declaration.moduleName)) {
          return false
        }
        seen.module.add(declaration.moduleName)
        return true
      } else if (declaration.kind === 'named') {
        if (seen.named.has(declaration.name)) {
          return false
        }
        seen.named.add(declaration.name)
        return true
      } else {
        return false
      }
    })
    .map((declaration) => formatDistributionExport(declaration, importPath))
    .filter(truthy)

  if (lines.length === 0) {
    lines.push('export {};')
  }

  return `${lines.join('\n')}\n`
}

function formatDistributionExport(
  declaration: ExportDeclaration,
  dest: string,
): string {
  if (declaration.kind === 'named') {
    return [
      'export',
      declaration.isTypeOnly ? 'type' : '',
      '{',
      declaration.alias,
      declaration.name === declaration.alias ? '' : `as ${declaration.name}`,
      '} from',
      `'${dest}';`,
    ]
      .filter(truthy)
      .join(' ')
  } else if (declaration.kind === 'module') {
    return `export * from '${declaration.moduleName}';`
  }
  return ''
}
