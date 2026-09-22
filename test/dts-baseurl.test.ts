import { expect, test } from 'vitest'
import { getDtsCompilerOptions } from '../src/rollup'

// https://github.com/egoist/tsup/issues/1413
// TypeScript 6.0 graduated TS5101 (`baseUrl` without `paths`) from a warning
// to a hard error, so the DTS compiler host must not get an injected
// `baseUrl` when the tsconfig doesn't define one.

test('dts compiler options: no baseUrl injected when tsconfig omits it', () => {
  const options = getDtsCompilerOptions({})
  expect('baseUrl' in options).toBe(false)
})

test('dts compiler options: no baseUrl injected for undefined baseUrl', () => {
  const options = getDtsCompilerOptions({ baseUrl: undefined })
  expect('baseUrl' in options).toBe(false)
})

test('dts compiler options: baseUrl kept when tsconfig defines it', () => {
  const options = getDtsCompilerOptions({
    baseUrl: '.',
    paths: { '@/*': ['./src/*'] },
  })
  expect(options.baseUrl).toBe('.')
  expect(options.paths).toEqual({ '@/*': ['./src/*'] })
})

test('dts compiler options: forced dts settings still applied', () => {
  const options = getDtsCompilerOptions({})
  expect(options.declaration).toBe(true)
  expect(options.emitDeclarationOnly).toBe(true)
  expect(options.noEmitOnError).toBe(true)
  expect(options.skipLibCheck).toBe(true)
})
