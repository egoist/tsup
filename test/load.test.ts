import fsp from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from 'vitest'
import { loadTsupConfig } from '../src/load'
import { getTestName } from './utils'

test('bundled config temp file is written to node_modules/.tsup-temp, not next to the config (#1349)', async () => {
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

  // The preserved temp file landed in node_modules/.tsup-temp instead,
  // inside the project so imports in the config still resolve against
  // the project's dependencies
  const tempDir = path.join(dir, 'node_modules', '.tsup-temp')
  const tmpFiles = (await fsp.readdir(tempDir)).filter((f) =>
    f.startsWith('tsup.config.bundled_'),
  )
  expect(tmpFiles.length).toBe(1)
  await fsp.unlink(path.join(tempDir, tmpFiles[0]))
})

test('bundled config can import a project-local dependency', async () => {
  const dir = path.resolve(
    __dirname,
    '.cache',
    getTestName().replace(/[^a-zA-Z0-9]/g, '-'),
  )
  const depDir = path.join(dir, 'node_modules', 'project-local-dep')
  await fsp.mkdir(depDir, { recursive: true })
  await fsp.writeFile(
    path.join(depDir, 'package.json'),
    JSON.stringify({
      name: 'project-local-dep',
      version: '0.0.0',
      main: 'index.js',
    }),
  )
  await fsp.writeFile(
    path.join(depDir, 'index.js'),
    `module.exports = { entry: ['src/from-dep.ts'] }\n`,
  )
  await fsp.writeFile(
    path.join(dir, 'tsup.config.ts'),
    `import dep from 'project-local-dep'\n\nexport default { entry: dep.entry }\n`,
  )

  const { data } = await loadTsupConfig(dir)
  expect(data).toMatchObject({ entry: ['src/from-dep.ts'] })
})

test('bundled config falls back to the config directory when node_modules/.tsup-temp cannot be created', async () => {
  const dir = path.resolve(
    __dirname,
    '.cache',
    getTestName().replace(/[^a-zA-Z0-9]/g, '-'),
  )
  const depDir = path.join(dir, 'node_modules', 'project-local-dep')
  await fsp.mkdir(depDir, { recursive: true })
  await fsp.writeFile(
    path.join(depDir, 'package.json'),
    JSON.stringify({
      name: 'project-local-dep',
      version: '0.0.0',
      main: 'index.js',
    }),
  )
  await fsp.writeFile(
    path.join(depDir, 'index.js'),
    `module.exports = { entry: ['src/from-dep.ts'] }\n`,
  )
  // Block node_modules/.tsup-temp with a regular file so creating the
  // directory fails, the same way it does when node_modules is read-only
  await fsp.writeFile(path.join(dir, 'node_modules', '.tsup-temp'), '')
  await fsp.writeFile(
    path.join(dir, 'tsup.config.ts'),
    `import dep from 'project-local-dep'\n\nexport default { entry: dep.entry }\n`,
  )

  process.env.BUNDLE_REQUIRE_PRESERVE = '1'
  try {
    const { data } = await loadTsupConfig(dir)
    // The config still loads and its imports still resolve, because the
    // bundled file stayed inside the project. An OS temp dir fallback
    // would fail here with ERR_MODULE_NOT_FOUND.
    expect(data).toMatchObject({ entry: ['src/from-dep.ts'] })
  } finally {
    delete process.env.BUNDLE_REQUIRE_PRESERVE
  }

  // The preserved temp file landed in the config directory itself
  const bundled = (await fsp.readdir(dir)).filter((f) =>
    f.includes('.bundled_'),
  )
  expect(bundled.length).toBe(1)
  await fsp.unlink(path.join(dir, bundled[0]))
  await fsp.unlink(path.join(dir, 'node_modules', '.tsup-temp'))
})

test('bundled config sees import.meta.dirname and filename of the original config file', async () => {
  const dir = path.resolve(
    __dirname,
    '.cache',
    getTestName().replace(/[^a-zA-Z0-9]/g, '-'),
  )
  await fsp.mkdir(dir, { recursive: true })
  const configPath = path.join(dir, 'tsup.config.ts')
  await fsp.writeFile(
    configPath,
    `export default {\n  entry: ['src/index.ts'],\n  metaDirname: import.meta.dirname,\n  metaFilename: import.meta.filename,\n}\n`,
  )

  const { data } = await loadTsupConfig(dir)
  expect(data).toMatchObject({ entry: ['src/index.ts'] })
  // Not node_modules/.tsup-temp, where the bundled file actually lives
  expect((data as any).metaDirname).toBe(dir)
  expect((data as any).metaFilename).toBe(configPath)
})
