import { test, expect } from 'vitest'
import { getTestName, run } from './utils'

test('custom tsconfig', async () => {
  await run(
    getTestName(),
    {
      'input.ts': `export const foo = 'foo'`,
      'tsconfig.build.json': `{
      "compilerOptions": {
        "baseUrl":"."
      }
    }`,
    },
    { flags: ['--tsconfig', 'tsconfig.build.json'] },
  )
})

test('support baseUrl and paths in tsconfig.json', async () => {
  const { getFileContent } = await run(getTestName(), {
    'input.ts': `export * from '@/foo'`,
    'foo.ts': `export const foo = 'foo'`,
    'tsconfig.json': `{
      "compilerOptions": {
        "baseUrl":".",
        "paths":{"@/*": ["./*"]}
      }
    }`,
  })
  expect(await getFileContent('dist/input.js')).toMatchSnapshot()
})

test('support baseUrl and paths in tsconfig.json in --dts build', async () => {
  const { getFileContent } = await run(
    getTestName(),
    {
      'input.ts': `export * from '@/foo'`,
      'src/foo.ts': `export const foo = 'foo'`,
      'tsconfig.json': `{
      "compilerOptions": {
        "baseUrl":".",
        "paths":{"@/*": ["./src/*"]}
      }
    }`,
    },
    { flags: ['--dts'] },
  )
  expect(await getFileContent('dist/input.d.ts')).toMatchSnapshot()
})

test('support baseUrl and paths in tsconfig.json in --dts-resolve build', async () => {
  const { getFileContent } = await run(
    getTestName(),
    {
      'input.ts': `export * from '@/foo'`,
      'src/foo.ts': `export const foo = 'foo'`,
      'tsconfig.json': `{
      "compilerOptions": {
        "baseUrl":".",
        "paths":{"@/*": ["./src/*"]}
      }
    }`,
    },
    { flags: ['--dts-resolve'] },
  )
  expect(await getFileContent('dist/input.d.ts')).toMatchSnapshot()
})
