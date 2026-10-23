import { test } from 'vitest'
import { getTestName, run } from './utils'

test('bundle vue and ts-essentials with --dts --dts-resolve flag', async () => {
  await run(
    getTestName(),
    {
      'input.ts': `export * from 'vue'
      export type { MarkRequired } from 'ts-essentials'
      `,
    },
    {
      flags: ['--dts', '--dts-resolve'],
      // resolving the types of these two needs more than the default heap
      env: { NODE_OPTIONS: '--max-old-space-size=8192' },
    },
  )
})

test('bundle @egoist/path-parser with --dts --dts-resolve flag', async () => {
  await run(
    getTestName(),
    {
      'input.ts': `import type { PathParser } from '@egoist/path-parser'
      export type Opts = {
        parser: PathParser
        route: string
      }
      `,
    },
    {
      flags: ['--dts', '--dts-resolve'],
    },
  )
})
