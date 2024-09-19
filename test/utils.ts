import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from 'vitest'
import { exec } from 'tinyexec'
import { glob } from 'tinyglobby'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const cacheDir = path.resolve(__dirname, '.cache')
const bin = path.resolve(__dirname, '../dist/cli-default.js')

export function getTestName() {
  const name = expect
    .getState()
    .currentTestName?.replace(/^[a-z]+/g, '_')
    .replace(/-/g, '_')

  if (!name) {
    throw new Error('No test name')
  }

  return name
}

export async function run(
  title: string,
  files: { [name: string]: string },
  options: {
    entry?: string[]
    flags?: string[]
    env?: Record<string, string>
  } = {},
) {
  const testDir = path.resolve(cacheDir, filenamify(title))

  // Write entry files on disk
  await Promise.all(
    Object.keys(files).map(async (name) => {
      const filePath = path.resolve(testDir, name)
      const parentDir = path.dirname(filePath)
      // Thanks to `recursive: true`, this doesn't fail even if the directory already exists.
      await fsp.mkdir(parentDir, { recursive: true })
      return fsp.writeFile(filePath, files[name], 'utf8')
    }),
  )

  const entry = options.entry || ['input.ts']

  // Run tsup cli
  const processPromise = exec(bin, [...entry, ...(options.flags || [])], {
    nodeOptions: {
      cwd: testDir,
      env: { ...process.env, ...options.env },
    },
  })
  const { stdout, stderr } = await processPromise

  const logs = stdout + stderr
  if (processPromise.exitCode !== 0) {
    throw new Error(logs)
  }

  // Get output
  const outFiles = await glob(['**/*'], {
    cwd: path.resolve(testDir, 'dist'),
  }).then((res) => res.sort())

  return {
    get output() {
      return fs.readFileSync(path.resolve(testDir, 'dist/input.js'), 'utf8')
    },
    outFiles,
    logs,
    outDir: path.resolve(testDir, 'dist'),
    getFileContent(filename: string) {
      return fsp.readFile(path.resolve(testDir, filename), 'utf8')
    },
  }
}

function filenamify(input: string) {
  return input.replace(/[^a-zA-Z0-9]/g, '-')
}
