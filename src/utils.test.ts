import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import {
  resolveExperimentalDtsConfig,
  resolveInitialExperimentalDtsConfig,
} from './utils'

const setupFixtureTree = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tsup-utils-test-'))
  mkdirSync(path.join(dir, 'src'), { recursive: true })
  mkdirSync(path.join(dir, 'lib'), { recursive: true })
  writeFileSync(path.join(dir, 'src/index.ts'), 'export const a = 1')
  writeFileSync(path.join(dir, 'lib/index.ts'), 'export const b = 2')
  writeFileSync(path.join(dir, 'src/types.ts'), 'export type T = string')
  return dir
}

// tinyglobby returns paths relative to the cwd, even for absolute patterns
const relToCwd = (p: string) => path.relative(process.cwd(), p)

test('experimentalDts entry glob keeps entries with the same basename in different directories', async () => {
  const dir = setupFixtureTree()
  try {
    const config = await resolveInitialExperimentalDtsConfig(
      path.join(dir, '**/*.ts'),
    )
    // Before the fix, both `src/index.ts` and `lib/index.ts` mapped to the
    // key `index` and one of them was silently dropped
    expect(Object.keys(config!.entry).sort()).toEqual([
      'lib/index',
      'src/index',
      'src/types',
    ])
    expect(config!.entry['src/index']).toBe(
      relToCwd(path.join(dir, 'src/index.ts')),
    )
    expect(config!.entry['lib/index']).toBe(
      relToCwd(path.join(dir, 'lib/index.ts')),
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('experimentalDts entry array keeps entries with the same basename in different directories', async () => {
  const dir = setupFixtureTree()
  try {
    const config = await resolveExperimentalDtsConfig(
      {
        entry: [path.join(dir, 'src/index.ts'), path.join(dir, 'lib/index.ts')],
        experimentalDts: {},
      } as any,
      { data: { compilerOptions: {} } },
    )
    expect(Object.keys(config.entry).sort()).toEqual(['lib/index', 'src/index'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('experimentalDts entry keys are unchanged for the common src/ layout', async () => {
  const dir = setupFixtureTree()
  try {
    const config = await resolveInitialExperimentalDtsConfig(
      path.join(dir, 'src/*.ts'),
    )
    expect(config!.entry).toEqual({
      index: relToCwd(path.join(dir, 'src/index.ts')),
      types: relToCwd(path.join(dir, 'src/types.ts')),
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
