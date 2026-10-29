import { expect, test } from 'vitest'
import { getTestName, run } from './utils'

test('clean does not delete d.ts files copied from publicDir (#1366)', async () => {
  const { getFileContent, outFiles } = await run(
    getTestName(),
    {
      'input.ts': `export const foo: string = 'foo'`,
      'public/legacy.d.ts': `export declare const legacy: string;\n`,
    },
    {
      flags: ['--dts', '--clean', '--publicDir'],
    },
  )
  expect(outFiles).toContain('input.d.ts')
  expect(outFiles).toContain('legacy.d.ts')
  expect(await getFileContent('dist/legacy.d.ts')).toBe(
    `export declare const legacy: string;\n`,
  )
})
