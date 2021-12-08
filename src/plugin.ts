import path from 'path'
import { OutputFile } from 'esbuild'
import { SourceMapConsumer, SourceMapGenerator, RawSourceMap } from 'source-map'
import { Format, NormalizedOptions } from '.'
import { outputFile } from './fs'

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

export type Plugin = {
  name: string

  renderChunk?: RenderChunk
}

export type PluginContext = {
  format: Format
  splitting?: boolean
  options: NormalizedOptions
}

const parseSourceMap = (map?: string | object | null) => {
  return typeof map === 'string' ? JSON.parse(map) : map
}

const isJS = (path: string) => /\.(js|mjs|cjs)$/.test(path)
const isCSS = (path: string) => /\.css$/.test(path)

export class PluginContainer {
  plugins: Plugin[]

  constructor(plugins: Plugin[]) {
    this.plugins = plugins
  }

  async buildFinished({
    files,
    context,
  }: {
    files: OutputFile[]
    context: PluginContext
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
              context,
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
            ? info.code + getSourcemapComment(!!info.map, info.path)
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
  }
}

const getSourcemapComment = (hasMap: boolean, filepath: string) => {
  return hasMap ? `//# sourceMappingURL=${path.basename(filepath)}.map` : ''
}
