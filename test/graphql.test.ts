import { expect, test } from 'vitest'
import { getTestName, run } from './utils'

test('bundle graphql-tools with --dts flag', async () => {
  await run(
    getTestName(),
    {
      'input.ts': `export { makeExecutableSchema } from 'graphql-tools'`,
    },
    {
      flags: ['--dts'],
    },
  )
})

test('bundle graphql-tools with --dts-resolve flag', async () => {
  await run(
    getTestName(),
    {
      'input.ts': `export { makeExecutableSchema } from 'graphql-tools'`,
    },
    {
      flags: ['--dts-resolve'],
    },
  )
})

test('bundle graphql-tools with --sourcemap flag', async () => {
  const { outFiles } = await run(
    getTestName(),
    {
      'input.ts': `export { makeExecutableSchema } from 'graphql-tools'`,
    },
    {
      flags: ['--sourcemap'],
    },
  )
  expect(outFiles).toEqual(['input.js', 'input.js.map'])
})

test('bundle graphql-tools with --sourcemap inline flag', async () => {
  const { output, outFiles } = await run(
    getTestName(),
    {
      'input.ts': `export { makeExecutableSchema } from 'graphql-tools'`,
    },
    {
      flags: ['--sourcemap', 'inline'],
    },
  )

  expect(output).toContain('//# sourceMappingURL=data:application/json;base64')
  expect(outFiles).toEqual(['input.js'])
})
