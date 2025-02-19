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

export const run = async (
  name: string,
  files: Record<string, string>,
  options: {
    entry?: string[] | Record<string, string>;
    flags?: string[];
    env?: Record<string, string>
  } = {},
) => {
  const testDir = path.resolve(cacheDir, filenamify(name))

  // Write entry files on disk
  await Promise.all(
    Object.keys(files).map(async (name) => {
      // Normalize all paths to forward slashes for consistency
      const normalizedName = name.replace(/\\/g, '/')
      const filePath = path.resolve(testDir, normalizedName)
      const parentDir = path.dirname(filePath)
      await fsp.mkdir(parentDir, { recursive: true })
      await fsp.writeFile(filePath, files[name], 'utf8')
    }),
  )

  const normalizeEntry = (entry: string) => {
    // Always normalize to forward slashes for consistency across platforms
    // This handles Windows paths, Unix paths, and preserves glob patterns
    const normalized = entry.replace(/\\/g, '/')

    // If it's a glob pattern, return as is
    if (normalized.includes('*')) {
      return normalized
    }

    // For non-glob entries, just normalize slashes but preserve the path structure
    return normalized
  }

  let entryArgs: string[] = []
  let flagArgs: string[] = []

  // Handle entries first
  if (!options.entry) {
    // Default to input.ts if it exists
    const defaultEntry = path.resolve(testDir, 'input.ts')
    if (fs.existsSync(defaultEntry)) {
      entryArgs.push('input.ts')
    }
  } else if (Array.isArray(options.entry)) {
    // For array entries, normalize each entry
    entryArgs.push(...options.entry.map(normalizeEntry))
  } else {
    // For object entries, normalize values
    flagArgs.push(
      ...Object.entries(options.entry).map(
        ([key, value]) => `--entry.${key}=${normalizeEntry(value)}`
      )
    )
  }

  // Add other flags after entries
  if (options.flags) {
    flagArgs.push(...options.flags)
  }

  // Combine args with entries first, then flags
  const args = [...entryArgs, ...flagArgs]

  // Run tsup cli
  const processPromise = exec(bin, args, {
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
