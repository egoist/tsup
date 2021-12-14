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
  ctx: { metafile?: Metafile }
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
    files,
    metafile,
  }: {
    files: OutputFile[]
    metafile?: Metafile
  }) {
    await Promise.all(
      files.map(async (file) => {
        const info: AssetInfo | ChunkInfo =
          isJS(file.path) || isCSS(file.path)
            ? {
                type: 'chunk',
                path: file.path,
                code: file.text,
                map: files.find((f) => f.path === `${file.path}.map`)?.text,
              }
            : {
                type: 'asset',
                path: file.path,
                contents: file.contents,
              }
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
                generator.applySourceMap(newConsumer)
                info.map = generator.toJSON()
                originalConsumer.destroy()
                newConsumer.destroy()
              }
            }
          }
        }

        await outputFile(
          info.path,
          info.type === 'chunk'
            ? info.code + getSourcemapComment(!!info.map, info.path, isCSS(file.path))
            : info.contents,
          { mode: info.type === 'chunk' ? info.mode : undefined }
        )
        if (info.type === 'chunk' && info.map) {
          const map =
            typeof info.map === 'string' ? JSON.parse(info.map) : info.map
          // map.sources = map.sources?.map((name: string) =>
          //   path.relative(path.dirname(info.path), name)
          // )
          await outputFile(`${info.path}.map`, JSON.stringify(map))
        }
      })
    )

    for (const plugin of this.plugins) {
      if (plugin.buildEnd) {
        await plugin.buildEnd.call(this.getContext(), { metafile })
      }
    }
  }
}

const getSourcemapComment = (hasMap: boolean, filepath: string, isCssFile: boolean) => {
  if (!hasMap) return ''
  const prefix = isCssFile ? '/*' : '//'
  const suffix = isCssFile ? ' */' : ''
  return `${prefix}# sourceMappingURL=${path.basename(filepath)}${suffix}`
}
