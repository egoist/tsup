import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { glob } from './utils'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsup-glob-test-'))
  fs.mkdirSync(path.join(dir, 'src/dir-prefix-foo'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'src/dir-prefix-special'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'src/dir-prefix-foo/a.ts'), 'export const a = 1')
  fs.writeFileSync(
    path.join(dir, 'src/dir-prefix-special/b.ts'),
    'export const b = 2',
  )
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

test('later positive pattern re-includes files excluded by an earlier negative (#1297)', async () => {
  const matches = await glob(
    ['!src/**/dir-prefix*/**/*', 'src/dir-prefix-special/**/*'],
    { cwd: dir },
  )
  expect(matches).toEqual(['src/dir-prefix-special/b.ts'])
})

test('negative pattern after positive still excludes', async () => {
  const matches = await glob(
    ['src/**/*.ts', '!src/**/dir-prefix-foo/**/*'],
    { cwd: dir },
  )
  expect(matches).toEqual(['src/dir-prefix-special/b.ts'])
})

test('patterns without negatives behave like tinyglobby', async () => {
  const matches = await glob(['src/**/*.ts'], { cwd: dir })
  expect([...matches].sort()).toEqual([
    'src/dir-prefix-foo/a.ts',
    'src/dir-prefix-special/b.ts',
  ])
})
