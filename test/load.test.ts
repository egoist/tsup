import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import { loadTsupConfig } from '../src/load'
import { getTestName } from './utils'

test('bundled config temp file is written to os.tmpdir(), not the project dir (#1349)', async () => {
  const dir = path.resolve(
    __dirname,
    '.cache',
    getTestName().replace(/[^a-zA-Z0-9]/g, '-'),
  )
  await fsp.mkdir(dir, { recursive: true })
  await fsp.writeFile(
    path.join(dir, 'tsup.config.ts'),
    `export default { entry: ['src/index.ts'] }\n`,
  )

  const tmpBefore = new Set(await fsp.readdir(os.tmpdir()))
  process.env.BUNDLE_REQUIRE_PRESERVE = '1'
  try {
    const { data } = await loadTsupConfig(dir)
    expect(data).toMatchObject({ entry: ['src/index.ts'] })
  } finally {
    delete process.env.BUNDLE_REQUIRE_PRESERVE
  }

  // No temp file left next to the config file
  const leftovers = (await fsp.readdir(dir)).filter((f) =>
    f.includes('.bundled_'),
  )
  expect(leftovers).toEqual([])

  // The preserved temp file landed in the OS temp dir instead
  const tmpFiles = (await fsp.readdir(os.tmpdir())).filter(
    (f) => !tmpBefore.has(f) && f.startsWith('tsup.config.bundled_'),
  )
  expect(tmpFiles.length).toBeGreaterThan(0)
  await Promise.all(
    tmpFiles.map((f) => fsp.unlink(path.join(os.tmpdir(), f))),
  )
})
