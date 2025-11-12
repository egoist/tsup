import { describe, expect, test, vi } from 'vitest'
import { swcPlugin, type SwcPluginConfig } from './swc'
import { localRequire } from '../utils'

vi.mock('../utils')

const getFixture = async (opts: Partial<SwcPluginConfig> = {}) => {
  const swc = {
    transformFile: vi.fn().mockResolvedValue({
      code: 'source-code',
      map: JSON.stringify({
        sources: ['file:///path/to/file.ts'],
      }),
    }),
  }

  const logger = {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }

  const build = {
    initialOptions: {
      keepNames: true,
    },
    onLoad: vi.fn(),
  }

  vi.mocked(localRequire).mockReturnValue(swc)

  const plugin = swcPlugin({
    ...opts,
    logger: logger as never,
  })

  await plugin.setup(build as never)

  const onLoad = build.onLoad.mock.calls[0][1] as Function

  return { swc, onLoad, logger, build }
}
describe('swcPlugin', () => {
  test('swcPlugin transforms TypeScript code with decorators and default plugin swc option', async () => {
    const { swc, onLoad } = await getFixture()

    await onLoad({
      path: 'file.ts',
    })

    expect(swc.transformFile).toHaveBeenCalledWith('file.ts', {
      configFile: false,
      jsc: {
        keepClassNames: true,
        parser: {
          decorators: true,
          syntax: 'typescript',
        },
        target: 'es2022',
        transform: {
          decoratorMetadata: true,
          legacyDecorator: true,
        },
      },
      sourceMaps: true,
      swcrc: false,
    })
  })
  test('swcPlugin transforms TypeScript code and use given plugin swc option', async () => {
    const { swc, onLoad } = await getFixture({
      jsc: {
        transform: {
          useDefineForClassFields: true,
        },
      },
    })

    await onLoad({
      path: 'file.ts',
    })

    expect(swc.transformFile).toHaveBeenCalledWith('file.ts', {
      configFile: false,
      jsc: {
        keepClassNames: true,
        parser: {
          decorators: true,
          syntax: 'typescript',
        },
        target: 'es2022',
        transform: {
          decoratorMetadata: true,
          legacyDecorator: true,
          useDefineForClassFields: true,
        },
      },
      sourceMaps: true,
      swcrc: false,
    })
  })
})
