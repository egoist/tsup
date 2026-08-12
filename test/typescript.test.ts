import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { describe, expect, test, vi } from 'vitest'
import { exec } from 'tinyexec'
import { loadTypeScript } from '../src/lib/typescript'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(__dirname, '..')
const fixtureRoot = path.resolve(__dirname, '.cache/typescript-7-dts')
const fixtureModules = path.resolve(fixtureRoot, 'node_modules')
const noDtsFixtureRoot = path.resolve(
  __dirname,
  '.cache/typescript-7-without-dts',
)
const noDtsFixtureModules = path.resolve(noDtsFixtureRoot, 'node_modules')

describe('loadTypeScript', () => {
  test('uses the compiler API from the installed TypeScript package', () => {
    const typescript = { version: '6.0.2', createProgram: vi.fn() }
    const requireModule = vi.fn((id: string) => {
      if (id === 'typescript') return typescript
      throw new Error(`Unexpected module: ${id}`)
    })

    expect(loadTypeScript(requireModule)).toBe(typescript)
    expect(requireModule).toHaveBeenCalledOnce()
  })

  test('falls back to the TypeScript 6 compatibility API for TypeScript 7', () => {
    const typescript7 = { version: '7.0.0' }
    const compatibilityApi = { version: '6.0.2', createProgram: vi.fn() }
    const requireModule = vi.fn((id: string) => {
      if (id === 'typescript') return typescript7
      if (id === '@typescript/typescript6') return compatibilityApi
      throw new Error(`Unexpected module: ${id}`)
    })

    expect(loadTypeScript(requireModule)).toBe(compatibilityApi)
    expect(requireModule).toHaveBeenNthCalledWith(1, 'typescript')
    expect(requireModule).toHaveBeenNthCalledWith(2, '@typescript/typescript6')
  })

  test('explains how TypeScript 7 users can provide the compiler API', () => {
    const requireModule = vi.fn((id: string) => {
      if (id === 'typescript') return { version: '7.0.0' }
      throw new Error(`Cannot find module '${id}'`)
    })

    expect(() => loadTypeScript(requireModule)).toThrowError(
      /npm install -D @typescript\/typescript6/,
    )
  })
})

test('does not require the compatibility API when declarations are disabled', async () => {
  await fs.rm(noDtsFixtureRoot, { recursive: true, force: true })

  await Promise.all([
    fs.cp(
      path.resolve(repositoryRoot, 'dist'),
      path.resolve(noDtsFixtureModules, 'tsup/dist'),
      { recursive: true },
    ),
    writePackage(noDtsFixtureModules, 'typescript', {
      'package.json': JSON.stringify({
        name: 'typescript',
        version: '7.0.0',
        main: 'index.js',
      }),
      'index.js': `module.exports = { version: '7.0.0' }`,
    }),
    fs
      .mkdir(noDtsFixtureRoot, { recursive: true })
      .then(() =>
        fs.writeFile(
          path.resolve(noDtsFixtureRoot, 'input.ts'),
          `export const answer: number = 42`,
        ),
      ),
  ])

  const cli = path.resolve(noDtsFixtureModules, 'tsup/dist/cli-default.js')
  const result = exec(cli, ['input.ts'], {
    nodeOptions: { cwd: noDtsFixtureRoot },
  })
  await result

  expect(result.exitCode).toBe(0)
  await expect(
    fs.readFile(path.resolve(noDtsFixtureRoot, 'dist/input.js'), 'utf8'),
  ).resolves.toContain('var answer = 42')
})

test('emits declarations with TypeScript 7 and the TypeScript 6 compatibility API', async () => {
  await fs.rm(fixtureRoot, { recursive: true, force: true })

  await Promise.all([
    fs.cp(
      path.resolve(repositoryRoot, 'dist'),
      path.resolve(fixtureModules, 'tsup/dist'),
      { recursive: true },
    ),
    writePackage(fixtureModules, 'typescript', {
      'package.json': JSON.stringify({
        name: 'typescript',
        version: '7.0.0',
        main: 'index.js',
      }),
      'index.js': `module.exports = { version: '7.0.0' }`,
    }),
    writePackage(fixtureModules, '@typescript/typescript6', {
      'package.json': JSON.stringify({
        name: '@typescript/typescript6',
        version: '6.0.2',
        main: 'index.js',
      }),
      'index.js': `module.exports = require(${JSON.stringify(
        createRequire(import.meta.url).resolve('typescript'),
      )})`,
    }),
    fs
      .mkdir(fixtureRoot, { recursive: true })
      .then(() =>
        fs.writeFile(
          path.resolve(fixtureRoot, 'input.ts'),
          `export const answer: number = 42`,
        ),
      ),
  ])

  const cli = path.resolve(fixtureModules, 'tsup/dist/cli-default.js')
  const result = exec(cli, ['input.ts', '--dts'], {
    nodeOptions: { cwd: fixtureRoot },
  })
  await result

  expect(result.exitCode).toBe(0)
  await expect(
    fs.readFile(path.resolve(fixtureRoot, 'dist/input.d.ts'), 'utf8'),
  ).resolves.toContain('declare const answer: number')
})

async function writePackage(
  modulesRoot: string,
  name: string,
  files: Record<string, string>,
): Promise<void> {
  const packageRoot = path.resolve(modulesRoot, name)
  await fs.mkdir(packageRoot, { recursive: true })
  await Promise.all(
    Object.entries(files).map(([filename, content]) =>
      fs.writeFile(path.resolve(packageRoot, filename), content),
    ),
  )
}
