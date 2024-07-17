import { dirname } from 'node:path'
import { loadTsConfig } from 'bundle-require'
import ts from 'typescript'
import { handleError } from './errors'
import { createLogger } from './log'
import { ensureTempDeclarationDir, toAbsolutePath } from './utils'
import type { ExportDeclaration } from './exports'
import type { NormalizedOptions } from './options'

const logger = createLogger()

class AliasPool {
  private seen = new Set<string>()

  assign(name: string): string {
    let suffix = 0
    let alias = name === 'default' ? 'default_alias' : name

    while (this.seen.has(alias)) {
      alias = `${name}_alias_${++suffix}`
      if (suffix >= 1000) {
        throw new Error(
          'Alias generation exceeded limit. Possible infinite loop detected.',
        )
      }
    }

    this.seen.add(alias)
    return alias
  }
}

/**
 * Get all export declarations from root files.
 */
function getExports(
  program: ts.Program,
  fileMapping: Map<string, string>,
): ExportDeclaration[] {
  const checker = program.getTypeChecker()
  const aliasPool = new AliasPool()
  const assignAlias = aliasPool.assign.bind(aliasPool)

  function extractExports(sourceFileName: string): ExportDeclaration[] {
    const cwd = program.getCurrentDirectory()
    sourceFileName = toAbsolutePath(sourceFileName, cwd)

    const sourceFile = program.getSourceFile(sourceFileName)
    if (!sourceFile) {
      return []
    }

    const destFileName = fileMapping.get(sourceFileName)
    if (!destFileName) {
      return []
    }

    const moduleSymbol = checker.getSymbolAtLocation(sourceFile)
    if (!moduleSymbol) {
      return []
    }

    const exports: ExportDeclaration[] = []

    const exportSymbols = checker.getExportsOfModule(moduleSymbol)
    exportSymbols.forEach((symbol) => {
      const name = symbol.getName()
      exports.push({
        kind: 'named',
        sourceFileName,
        destFileName,
        name,
        alias: assignAlias(name),
        isTypeOnly: false,
      })
    })

    return exports
  }

  return program.getRootFileNames().flatMap(extractExports)
}

/**
 * Use TypeScript compiler to emit declaration files.
 *
 * @returns The mapping from source TS file paths to output declaration file paths
 */
function emitDtsFiles(program: ts.Program, host: ts.CompilerHost) {
  const fileMapping = new Map<string, string>()

  const writeFile: ts.WriteFileCallback = (
    fileName,
    text,
    writeByteOrderMark,
    onError,
    sourceFiles,
    data,
  ) => {
    const sourceFile = sourceFiles?.[0]
    const sourceFileName = sourceFile?.fileName

    if (sourceFileName && !fileName.endsWith('.map')) {
      const cwd = program.getCurrentDirectory()
      fileMapping.set(
        toAbsolutePath(sourceFileName, cwd),
        toAbsolutePath(fileName, cwd),
      )
    }

    return host.writeFile(
      fileName,
      text,
      writeByteOrderMark,
      onError,
      sourceFiles,
      data,
    )
  }

  const emitResult = program.emit(undefined, writeFile, undefined, true)

  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .concat(emitResult.diagnostics)

  const diagnosticMessages: string[] = []

  diagnostics.forEach((diagnostic) => {
    if (diagnostic.file) {
      const { line, character } = ts.getLineAndCharacterOfPosition(
        diagnostic.file,
        diagnostic.start!,
      )
      const message = ts.flattenDiagnosticMessageText(
        diagnostic.messageText,
        '\n',
      )
      diagnosticMessages.push(
        `${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`,
      )
    } else {
      const message = ts.flattenDiagnosticMessageText(
        diagnostic.messageText,
        '\n',
      )
      diagnosticMessages.push(message)
    }
  })

  const diagnosticMessage = diagnosticMessages.join('\n')
  if (diagnosticMessage) {
    logger.error(
      'TSC',
      `Failed to emit declaration files.\n\n${diagnosticMessage}`,
    )
    throw new Error('TypeScript compilation failed')
  }

  return fileMapping
}

function emit(compilerOptions?: any, tsconfig?: string) {
  const cwd = process.cwd()
  const rawTsconfig = loadTsConfig(cwd, tsconfig)
  if (!rawTsconfig) {
    throw new Error(`Unable to find ${tsconfig || 'tsconfig.json'} in ${cwd}`)
  }

  const declarationDir = ensureTempDeclarationDir()

  const parsedTsconfig = ts.parseJsonConfigFileContent(
    {
      ...rawTsconfig.data,
      compilerOptions: {
        ...rawTsconfig.data?.compilerOptions,

        // Enable declaration emit and disable javascript emit
        noEmit: false,
        declaration: true,
        declarationMap: true,
        declarationDir,
        emitDeclarationOnly: true,
      },
    },
    ts.sys,
    tsconfig ? dirname(tsconfig) : './',
  )

  const options: ts.CompilerOptions = parsedTsconfig.options

  const host: ts.CompilerHost = ts.createCompilerHost(options)
  const program: ts.Program = ts.createProgram(
    parsedTsconfig.fileNames,
    options,
    host,
  )

  const fileMapping = emitDtsFiles(program, host)
  return getExports(program, fileMapping)
}

export function runTypeScriptCompiler(options: NormalizedOptions) {
  try {
    const start = Date.now()
    const getDuration = () => {
      return `${Math.floor(Date.now() - start)}ms`
    }
    logger.info('tsc', 'Build start')
    const dtsOptions = options.experimentalDts!
    const exports = emit(dtsOptions.compilerOptions, options.tsconfig)
    logger.success('tsc', `⚡️ Build success in ${getDuration()}`)
    return exports
  } catch (error) {
    handleError(error)
    logger.error('tsc', 'Build error')
  }
}
