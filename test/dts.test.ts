import { test, expect } from 'vitest'
import path from 'path'
import { slash } from '../src/utils'
import { getTestName, run } from './utils'

test('not bundle `package/subpath` in dts (resolve)', async () => {
  const { getFileContent } = await run(
    getTestName(),
    {
      'package.json': `{ "dependencies": { "foo": "*" } }`,
      'input.ts': `export const stuff: import('foo/bar').Foobar = { foo: 'foo', bar: 'bar' };`,
      'node_modules/foo/bar.d.ts': `export type Foobar = { foo: 'foo', bar: 'bar' }`,
      'node_modules/foo/package.json': `{ "name": "foo", "version": "0.0.0" }`,
    },
    {
      flags: ['--dts', '--dts-resolve'],
    },
  )
  const content = await getFileContent('dist/input.d.ts')
  expect(content).toMatchSnapshot()
})

test('enable --dts-resolve for specific module', async () => {
  const { getFileContent } = await run(getTestName(), {
    'input.ts': `export * from 'vue'
      export type {MarkRequired} from 'foo'
      `,
    'node_modules/foo/index.d.ts': `
      export type MarkRequired<T, RK extends keyof T> = Exclude<T, RK> & Required<Pick<T, RK>>
      `,
    'node_modules/foo/package.json': `{ "name": "foo", "version": "0.0.0" }`,
    'tsup.config.ts': `
      export default {
        dts: {
          resolve: ['foo']
        },
      }
      `,
  })
  const content = await getFileContent('dist/input.d.ts')
  expect(content).toMatchSnapshot()
})

test(`custom tsconfig should pass to dts plugin`, async () => {
  const { outFiles } = await run(getTestName(), {
    'input.ts': `export const foo = { name: 'foo'}`,
    'tsconfig.json': `{
        "compilerOptions": {
          "baseUrl":".",
          "target": "esnext",
          "incremental": true
        }
      }`,
    'tsconfig.build.json': `{
        "compilerOptions": {
          "baseUrl":".",
          "target": "esnext"
        }
      }`,
    'tsup.config.ts': `
        export default {
          entry: ['src/input.ts'],
          format: 'esm',
          tsconfig: './tsconfig.build.json',
          dts: {
            only: true
          }
        }
      `,
  })
  expect(outFiles).toEqual(['input.d.mts'])
})

test('should emit a declaration file per format', async () => {
  const { outFiles } = await run(getTestName(), {
    'input.ts': `export default 'foo'`,
    'tsup.config.ts': `
        export default {
          entry: ['src/input.ts'],
          format: ['esm', 'cjs'],
          dts: true
        }`,
  })
  expect(outFiles).toEqual([
    'input.d.mts',
    'input.d.ts',
    'input.js',
    'input.mjs',
  ])
})

test('should emit a declaration file per format (type: module)', async () => {
  const { outFiles } = await run(getTestName(), {
    'input.ts': `export default 'foo'`,
    'package.json': `{
      "type": "module"
    }`,
    'tsup.config.ts': `
        export default {
          entry: ['src/input.ts'],
          format: ['esm', 'cjs'],
          dts: true
        }`,
  })
  expect(outFiles).toEqual([
    'input.cjs',
    'input.d.cts',
    'input.d.ts',
    'input.js',
  ])
})

test('should emit dts chunks per format', async () => {
  const { outFiles } = await run(
    getTestName(),
    {
      'src/input1.ts': `
          import type { InternalType } from './shared.js'

          export function getValue(value: InternalType) {
            return value;
          }
      `,
      'src/input2.ts': `
          import type { InternalType } from './shared.js'

          export function getValue(value: InternalType) {
            return value;
          }
      `,
      'src/shared.ts': `export type InternalType = 'foo'`,
      'tsup.config.ts': `
        export default {
          entry: ['./src/input1.ts', './src/input2.ts'],
          format: ['esm', 'cjs'],
          dts: true
        }`,
    },
    { entry: [] },
  )
  expect(outFiles).toEqual([
    'input1.d.mts',
    'input1.d.ts',
    'input1.js',
    'input1.mjs',
    'input2.d.mts',
    'input2.d.ts',
    'input2.js',
    'input2.mjs',
    'shared-jWa9aNVo.d.mts',
    'shared-jWa9aNVo.d.ts',
  ])
})

test('should emit dts chunks per format (type: module)', async () => {
  const { outFiles } = await run(
    getTestName(),
    {
      'src/input1.ts': `
          import type { InternalType } from './shared.js'

          export function getValue(value: InternalType) {
            return value;
          }
      `,
      'src/input2.ts': `
          import type { InternalType } from './shared.js'

          export function getValue(value: InternalType) {
            return value;
          }
      `,
      'src/shared.ts': `export type InternalType = 'foo'`,
      'tsup.config.ts': `
        export default {
          entry: ['./src/input1.ts', './src/input2.ts'],
          format: ['esm', 'cjs'],
          dts: true
        }`,
      'package.json': `{
          "type": "module"
        }`,
    },
    { entry: [] },
  )
  expect(outFiles).toEqual([
    'input1.cjs',
    'input1.d.cts',
    'input1.d.ts',
    'input1.js',
    'input2.cjs',
    'input2.d.cts',
    'input2.d.ts',
    'input2.js',
    'shared-jWa9aNVo.d.cts',
    'shared-jWa9aNVo.d.ts',
  ])
})

test('should emit declaration files with experimentalDts', async () => {
  const files = {
    'package.json': `
        {
          "name": "tsup-playground",
          "private": true,
          "version": "0.0.0",
          "main": "dist/index.js",
          "module": "dist/index.mjs",
          "types": "dist/index.d.ts",
          "exports": {
              ".": {
                  "types": "./dist/index.d.ts",
                  "require": "./dist/index.js",
                  "import": "./dist/index.mjs",
                  "default": "./dist/index.js"
              },
              "./client": {
                  "types": "./dist/my-lib-client.d.ts",
                  "require": "./dist/my-lib-client.js",
                  "import": "./dist/my-lib-client.mjs",
                  "default": "./dist/my-lib-client.js"
              },
              "./server": {
                  "types": "./dist/server/index.d.ts",
                  "require": "./dist/server/index.js",
                  "import": "./dist/server/index.mjs",
                  "default": "./dist/server/index.js"
              }
          }
        }
    `,
    'tsconfig.json': `
        {
          "compilerOptions": {
              "target": "ES2020",
              "skipLibCheck": true,
              "noEmit": true
          },
          "include": ["./src"]
        }
    `,
    'tsup.config.ts': `
        export default {
          name: 'tsup',
          target: 'es2022',
          format: [
            'esm',
            'cjs'
          ],
          entry: {
            index: './src/index.ts',
            'my-lib-client': './src/client.ts',
            'server/index': './src/server.ts',
          },
        }
    `,
    'src/shared.ts': `
        export function sharedFunction<T>(value: T): T | null {
          return value || null
        }
        
        type sharedType = {
          shared: boolean
        }
        
        export type { sharedType }
    `,
    'src/server.ts': `
        export * from './shared'

        /**
         * Comment for server render function 
         */
        export function render(options: ServerRenderOptions): string {
          return JSON.stringify(options)
        }
        
        export interface ServerRenderOptions {
          /**
           * Comment for ServerRenderOptions.stream
           * 
           * @public
           * 
           * @my_custom_tag
           */
          stream: boolean
        }

        export const serverConstant = 1

        export { serverConstant as serverConstantAlias }

        export class ServerClass {};

        export default function serverDefaultExport(options: ServerRenderOptions): void {};

        // Export a third party module as a namespace
        import * as ServerThirdPartyNamespace from 'react-dom';
        export { ServerThirdPartyNamespace }

        // Export a third party module 
        export * from 'react-dom/server';

    `,
    'src/client.ts': `
        export * from './shared'

        export function render(options: ClientRenderOptions): string {
          return JSON.stringify(options)
        }
        
        export interface ClientRenderOptions {
          document: boolean
        }
    `,
    'src/index.ts': `
        export * from './client'
        export * from './shared'

        export const VERSION = '0.0.0' as const
    `,
  }
  const { outFiles, getFileContent } = await run(getTestName(), files, {
    entry: [],
    flags: ['--experimental-dts'],
  })
  const snapshots: string[] = []
  await Promise.all(
    outFiles
      .filter((outFile) => outFile.includes('.d.'))
      .map(async (outFile) => {
        const filePath = path.join('dist', outFile)
        const content = await getFileContent(filePath)
        snapshots.push(
          [
            '',
            '/'.repeat(70),
            `// ${path.posix.normalize(slash(filePath))}`,
            '/'.repeat(70),
            '',
            content,
          ].join('\n'),
        )
      }),
  )
  expect(snapshots.sort().join('\n')).toMatchSnapshot()
})

test('should only include exported declarations with experimentalDts', async () => {
  const files = {
    'package.json': `{ "name": "tsup-playground", "private": true }`,
    'tsconfig.json': `{ "compilerOptions": { "skipLibCheck": true } }`,
    'tsup.config.ts': `
        export default {
          entry: ['./src/entry1.ts', './src/entry2.ts']
        }
    `,
    'src/shared.ts': `
        export const declare1 = 'declare1'
        export const declare2 = 'declare2'
    `,
    'src/entry1.ts': `
        export { declare1 } from './shared'
    `,
    'src/entry2.ts': `
        export { declare2 } from './shared'
    `,
  }
  const { getFileContent } = await run(getTestName(), files, {
    entry: [],
    flags: ['--experimental-dts'],
  })

  let entry1dts = await getFileContent('dist/entry1.d.ts')
  let entry2dts = await getFileContent('dist/entry2.d.ts')

  expect(entry1dts).toContain('declare1')
  expect(entry1dts).not.toContain('declare2')

  expect(entry2dts).toContain('declare2')
  expect(entry2dts).not.toContain('declare1')
})

test('.d.ts files should be cleaned when --clean and --experimental-dts are provided', async () => {
  const filesFoo = {
    'package.json': `{ "name": "tsup-playground", "private": true }`,
    'foo.ts': `export const foo = 1`,
  }

  const filesFooBar = {
    ...filesFoo,
    'bar.ts': `export const bar = 2`,
  }

  // First run with both foo and bar
  const result1 = await run(getTestName(), filesFooBar, {
    entry: ['foo.ts', 'bar.ts'],
    flags: ['--experimental-dts'],
  })

  expect(result1.outFiles).toContain('foo.d.ts')
  expect(result1.outFiles).toContain('foo.js')
  expect(result1.outFiles).toContain('bar.d.ts')
  expect(result1.outFiles).toContain('bar.js')

  // Second run with only foo
  const result2 = await run(getTestName(), filesFoo, {
    entry: ['foo.ts'],
    flags: ['--experimental-dts'],
  })

  // When --clean is not provided, the previous bar.* files should still exist
  expect(result2.outFiles).toContain('foo.d.ts')
  expect(result2.outFiles).toContain('foo.js')
  expect(result2.outFiles).toContain('bar.d.ts')
  expect(result2.outFiles).toContain('bar.js')

  // Third run with only foo and --clean
  const result3 = await run(getTestName(), filesFoo, {
    entry: ['foo.ts'],
    flags: ['--experimental-dts', '--clean'],
  })

  // When --clean is provided, the previous bar.* files should be deleted
  expect(result3.outFiles).toContain('foo.d.ts')
  expect(result3.outFiles).toContain('foo.js')
  expect(result3.outFiles).not.toContain('bar.d.ts')
  expect(result3.outFiles).not.toContain('bar.js')
})

test('dts only: ignore files', async () => {
  const { outFiles } = await run(
    getTestName(),
    {
      'input.ts': `
      import './style.scss'

      export const a = 1
      `,
      'style.scss': `
      @keyframes gallery-loading-spinner {
        0% {}
      }
      `,
    },
    {
      entry: ['input.ts'],
      flags: ['--dts-only'],
    },
  )
  expect(outFiles).toMatchInlineSnapshot(`
    [
      "input.d.ts",
    ]
  `)
})

test('declaration files with multiple entrypoints #316', async () => {
  const { getFileContent } = await run(
    getTestName(),
    {
      'src/index.ts': `export const foo = 1`,
      'src/bar/index.ts': `export const bar = 'bar'`,
    },
    { flags: ['--dts'], entry: ['src/index.ts', 'src/bar/index.ts'] },
  )
  expect(
    await getFileContent('dist/index.d.ts'),
    'dist/index.d.ts',
  ).toMatchSnapshot()
  expect(
    await getFileContent('dist/bar/index.d.ts'),
    'dist/bar/index.d.ts',
  ).toMatchSnapshot()
})
