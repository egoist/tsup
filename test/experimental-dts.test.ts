import type { Options } from 'tsup'
import { test } from 'vitest'
import { getTestName, run } from './utils'

test.for([
  { moduleResolution: 'NodeNext', module: 'NodeNext' },
  { moduleResolution: 'Node16', module: 'Node16' },
  { moduleResolution: 'Bundler', module: 'ESNext' },
  { moduleResolution: 'Bundler', module: 'Preserve' },
  { moduleResolution: 'Node10', module: 'ESNext' },
  { moduleResolution: 'Node10', module: 'CommonJS' },
  { moduleResolution: 'Node', module: 'ESNext' },
  { moduleResolution: 'Node', module: 'CommonJS' },
] as const)(
  "experimentalDts works with TypeScript's $moduleResolution module resolution and module set to $module",
  async ({ moduleResolution, module }, { expect, task }) => {
    const { getFileContent, outFiles } = await run(
      getTestName(),
      {
        'src/types.ts': `export type Person = { name: string }`,
        'src/index.ts': `export const foo = [1, 2, 3]\nexport type { Person } from './types.js'`,
        'tsup.config.ts': `export default ${JSON.stringify(
          {
            name: task.name,
            entry: { index: 'src/index.ts' },
            format: ['esm', 'cjs'],
            experimentalDts: true,
          } satisfies Options,
          null,
          2,
        )}`,
        'package.json': JSON.stringify(
          {
            name: 'testing-experimental-dts',
            description: task.name,
            type: 'module',
          },
          null,
          2,
        ),
        'tsconfig.json': JSON.stringify(
          {
            compilerOptions: {
              module,
              moduleResolution,
              outDir: './dist',
              rootDir: './src',
              skipLibCheck: true,
              strict: true,
            },
            include: ['src'],
          },
          null,
          2,
        ),
      },
      {
        entry: [],
      },
    )

    expect(outFiles).toStrictEqual([
      'index.cjs',
      'index.d.cts',
      'index.d.ts',
      'index.js',
    ])

    const indexDtsContent = `export declare const foo: number[];\r\n\r\nexport declare type Person = {\r\n    name: string;\r\n};\r\n\r\nexport { }\r\n`

    expect(await getFileContent('dist/index.d.ts')).toStrictEqual(
      indexDtsContent,
    )

    expect(await getFileContent('dist/index.d.cts')).toStrictEqual(
      indexDtsContent,
    )
  },
)
