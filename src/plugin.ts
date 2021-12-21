import path from 'path'
import { OutputFile, BuildOptions as EsbuildOptions, Metafile } from 'esbuild'
import { SourceMapConsumer, SourceMapGenerator, RawSourceMap } from 'source-map'
import { Format, NormalizedOptions } from '.'
import { outputFile } from './fs'
import { Logger } from './log'

export type ChunkInfo = {
  type: 'chunk'
  code: string
  map?: string | RawSourceMap | null
  path: string
  /**
   * Sets the file mode
   */
  mode?: number
}

export type AssetInfo = {
  type: 'asset'
  path: string
  contents: Uint8Array
}

type MaybePromise<T> = T | Promise<T>

export type RenderChunk = (
  this: PluginContext,
  code: string,
  chunkInfo: ChunkInfo
) => MaybePromise<
  | {
      code: string
      map?: object | string
    }
  | undefined
  | null
  | void
>

export type BuildStart = (this: PluginContext) => MaybePromise<void>
export type BuildEnd = (
  this: PluginContext,
  ctx: { writtenFiles: WrittenFile[] }
) => MaybePromise<void>

export type ModifyEsbuildOptions = (
  this: PluginContext,
  options: EsbuildOptions
) => void

export type Plugin = {
  name: string

  esbuildOptions?: ModifyEsbuildOptions

  buildStart?: BuildStart

  renderChunk?: RenderChunk

  buildEnd?: BuildEnd
}

export type PluginContext = {
  format: Format
  splitting?: boolean
  options: NormalizedOptions
  logger: Logger
}

export type WrittenFile = { readonly name: string; readonly size: number }

const parseSourceMap = (map?: string | object | null) => {
  return typeof map === 'string' ? JSON.parse(map) : map
}

const isJS = (path: string) => /\.(js|mjs|cjs)$/.test(path)
const isCSS = (path: string) => /\.css$/.test(path)

export class PluginContainer {
  plugins: Plugin[]
  context?: PluginContext

  constructor(plugins: Plugin[]) {
    this.plugins = plugins
  }

  setContext(context: PluginContext) {
    this.context = context
  }

  getContext() {
    if (!this.context) throw new Error(`Plugin context is not set`)
    return this.context
  }

  modifyEsbuildOptions(options: EsbuildOptions) {
    for (const plugin of this.plugins) {
      if (plugin.esbuildOptions) {
        plugin.esbuildOptions.call(this.getContext(), options)
      }
    }
  }

  async buildStarted() {
    for (const plugin of this.plugins) {
      if (plugin.buildStart) {
        await plugin.buildStart.call(this.getContext())
      }
    }
  }

  async buildFinished({
    outputFiles,
    metafile,
  }: {
    outputFiles: OutputFile[]
    metafile?: Metafile
  }) {
    const files: Array<ChunkInfo | AssetInfo> = outputFiles
      .filter((file) => !file.path.endsWith('.map'))
      .map((file) => {
        if (isJS(file.path) || isCSS(file.path)) {
          return {
            type: 'chunk',
            path: file.path,
            code: file.text,
            map: outputFiles.find((f) => f.path === `${file.path}.map`)?.text,
          }
        } else {
          return { type: 'asset', path: file.path, contents: file.contents }
        }
      })

    const writtenFiles: WrittenFile[] = []

    await Promise.all(
      files.map(async (info) => {
        for (const plugin of this.plugins) {
          if (info.type === 'chunk' && plugin.renderChunk) {
            const result = await plugin.renderChunk.call(
              this.getContext(),
              info.code,
              info
            )
            if (result) {
              info.code = result.code
              if (result.map) {
                const originalConsumer = await new SourceMapConsumer(
                  parseSourceMap(info.map)
                )
                const newConsumer = await new SourceMapConsumer(
                  parseSourceMap(result.map)
                )
                const generator =
                  SourceMapGenerator.fromSourceMap(originalConsumer)
                generator.applySourceMap(newConsumer, info.path)
                info.map = generator.toJSON()
                originalConsumer.destroy()
                newConsumer.destroy()
              }
            }
          }
        }

        const inlineSourceMap = this.context!.options.sourcemap === 'inline'
        const contents =
          info.type === 'chunk'
            ? info.code +
              getSourcemapComment(
                inlineSourceMap,
                info.map,
                info.path,
                isCSS(info.path)
              )
            : info.contents
        await outputFile(info.path, contents, {
          mode: info.type === 'chunk' ? info.mode : undefined,
        })
        writtenFiles.push({
          get name() {
            return path.relative(process.cwd(), info.path)
          },
          get size() {
            return contents.length
          },
        })
        if (info.type === 'chunk' && info.map && !inlineSourceMap) {
          const map =
            typeof info.map === 'string' ? JSON.parse(info.map) : info.map
          const outPath = `${info.path}.map`
          const contents = JSON.stringify(map)
          await outputFile(outPath, contents)
          writtenFiles.push({
            get name() {
              return path.relative(process.cwd(), outPath)
            },
            get size() {
              return contents.length
            },
          })
        }
      })
    )

    for (const plugin of this.plugins) {
      if (plugin.buildEnd) {
        await plugin.buildEnd.call(this.getContext(), { writtenFiles })
      }
    }
  }
}

const getSourcemapComment = (
  inline: boolean,
  map: RawSourceMap | string | null | undefined,
  filepath: string,
  isCssFile: boolean
) => {
  if (!map) return ''
  const prefix = isCssFile ? '/*' : '//'
  const suffix = isCssFile ? ' */' : ''
  const url = inline
    ? `data:application/json;base64,${Buffer.from(
        typeof map === 'string' ? map : JSON.stringify(map)
      ).toString('base64')}`
    : `${path.basename(filepath)}.map`
  return `${prefix}# sourceMappingURL=${url}${suffix}`
}
