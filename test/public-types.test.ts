import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import treeKill from 'tree-kill'
import { expect, test } from 'vitest'

const root = fileURLToPath(new URL('../', import.meta.url))

async function run(argv: string[], cwd: string, timeout: number) {
  return new Promise<{ code: number | null; output: string }>(
    (resolve, reject) => {
      const child = spawn(argv[0], argv.slice(1), {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
      })
      let output = ''
      let timedOut = false
      child.stdout.on('data', (data) => (output += data.toString()))
      child.stderr.on('data', (data) => (output += data.toString()))
      const timer = setTimeout(() => {
        timedOut = true
        if (!child.pid || child.exitCode !== null || child.signalCode !== null)
          return
        if (process.platform === 'win32') {
          treeKill(child.pid, 'SIGKILL', () => {})
        } else {
          try {
            process.kill(-child.pid, 'SIGKILL')
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ESRCH') reject(error)
          }
        }
      }, timeout)
      child.once('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.once('close', (code, signal) => {
        clearTimeout(timer)
        if (timedOut || signal) {
          reject(
            new Error(
              `${argv.join(' ')}: timeout=${timedOut}, signal=${signal}\n${output}`,
            ),
          )
        } else {
          resolve({ code, output })
        }
      })
    },
  )
}

async function payload(
  directory: string,
  prefix = '',
): Promise<[string, string][]> {
  const files: [string, string][] = []
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (!prefix && entry.name === 'node_modules') continue
    const name = `${prefix}${entry.name}`
    const filename = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await payload(filename, `${name}/`)))
    } else {
      expect(entry.isFile(), `Unexpected package entry: ${name}`).toBe(true)
      files.push([
        name,
        createHash('sha256')
          .update(await fs.readFile(filename))
          .digest('hex'),
      ])
    }
  }
  return files.sort(([left], [right]) => left.localeCompare(right))
}

test('packed public SWC options are strict without the optional SWC runtime', async () => {
  const manifest = JSON.parse(
    await fs.readFile(path.join(root, 'package.json'), 'utf8'),
  )
  const managerEntry = process.env.npm_execpath
  expect(
    managerEntry,
    'Run through the canonical pnpm test script',
  ).toBeTruthy()
  expect(process.env.npm_config_user_agent).toMatch(
    new RegExp(
      `^pnpm/${manifest.devEngines.packageManager.version.replaceAll('.', '\\.')} `,
    ),
  )
  const manager = /\.[cm]?js$/.test(managerEntry!)
    ? [process.execPath, managerEntry!]
    : [managerEntry!]
  const temporary = await fs.mkdtemp(
    path.join(os.tmpdir(), 'tsup-public-types-'),
  )
  try {
    const packDeadline = Date.now() + 5000
    const pack = await run(
      [...manager, 'pack', '--pack-destination', temporary],
      root,
      5000,
    )
    expect(pack.code, pack.output).toBe(0)
    const archives = (await fs.readdir(temporary)).filter((name) =>
      name.endsWith('.tgz'),
    )
    expect(archives).toHaveLength(1)
    const archive = path.join(temporary, archives[0])
    const remainingPackTime = () => {
      const remaining = packDeadline - Date.now()
      expect(
        remaining,
        'Pack and inspect within the existing 5s child budget',
      ).toBeGreaterThan(0)
      return remaining
    }
    const listing = await run(
      ['tar', '-tzf', archive],
      temporary,
      remainingPackTime(),
    )
    expect(listing.code, listing.output).toBe(0)
    for (const name of listing.output.trim().split('\n')) {
      expect(name.startsWith('package/')).toBe(true)
      expect(name.split('/')).not.toContain('..')
      expect(name).not.toContain('\\')
    }
    const unpacked = path.join(temporary, 'unpacked')
    await fs.mkdir(unpacked)
    const extraction = await run(
      ['tar', '-xzf', archive, '-C', unpacked],
      temporary,
      remainingPackTime(),
    )
    expect(extraction.code, extraction.output).toBe(0)
    const originalPayload = await payload(path.join(unpacked, 'package'))
    const archiveHash = createHash('sha256')
      .update(await fs.readFile(archive))
      .digest('hex')
    const consumer = path.join(temporary, 'consumer')
    await fs.mkdir(consumer)
    // Keep the owner's explicit build policy in this isolated consumer.
    const workspacePolicy = await fs.readFile(
      path.join(root, 'pnpm-workspace.yaml'),
    )
    await fs.writeFile(
      path.join(consumer, 'pnpm-workspace.yaml'),
      workspacePolicy,
    )
    await expect(
      fs.stat(path.join(consumer, 'test/package.json')),
    ).rejects.toMatchObject({ code: 'ENOENT' })
    await fs.writeFile(
      path.join(consumer, 'package.json'),
      JSON.stringify({
        name: 'tsup-public-types-consumer',
        private: true,
        type: 'module',
        dependencies: { tsup: `file:${archive}` },
        devDependencies: {
          '@types/node': manifest.devDependencies['@types/node'],
        },
      }),
    )
    const installed = await run([...manager, 'install'], consumer, 20000)
    expect(installed.code, installed.output).toBe(0)
    const consumerRequire = createRequire(path.join(consumer, 'package.json'))
    const installedManifest = await fs.realpath(
      consumerRequire.resolve('tsup/package.json'),
    )
    const installedRoot = path.dirname(installedManifest)
    expect(
      JSON.parse(await fs.readFile(installedManifest, 'utf8')).version,
    ).toBe(manifest.version)
    expect(await payload(installedRoot)).toEqual(originalPayload)
    const packageRequire = createRequire(installedManifest)
    const assertNoOptionalRuntime = () => {
      expect(() => packageRequire.resolve('@swc/core')).toThrow(
        expect.objectContaining({ code: 'MODULE_NOT_FOUND' }),
      )
    }
    assertNoOptionalRuntime()
    const lock = await fs.readFile(path.join(consumer, 'pnpm-lock.yaml'))
    const frozen = await run(
      [...manager, 'install', '--frozen-lockfile'],
      consumer,
      5000,
    )
    expect(frozen.code, frozen.output).toBe(0)
    expect(
      await fs.readFile(path.join(consumer, 'pnpm-workspace.yaml')),
    ).toEqual(workspacePolicy)
    expect(await fs.readFile(path.join(consumer, 'pnpm-lock.yaml'))).toEqual(
      lock,
    )
    expect(
      await fs.realpath(consumerRequire.resolve('tsup/package.json')),
    ).toBe(installedManifest)
    expect(await payload(installedRoot)).toEqual(originalPayload)
    expect(
      createHash('sha256')
        .update(await fs.readFile(archive))
        .digest('hex'),
    ).toBe(archiveHash)
    assertNoOptionalRuntime()
    const controls = [
      [
        'positive',
        `import type { Options } from 'tsup'
const minimal: Options = {}
const jsc: NonNullable<NonNullable<Options['swc']>['jsc']> = {
  parser: { syntax: 'typescript', tsx: true, decorators: true },
  target: 'es2022',
  transform: { legacyDecorator: true, decoratorMetadata: true },
}
const terser: NonNullable<Options['terserOptions']> = { compress: { passes: 2 } }
void [minimal, jsc, terser]
`,
        null,
      ],
      [
        'invalid-syntax',
        `import type { Options } from 'tsup'
const jsc: NonNullable<NonNullable<Options['swc']>['jsc']> = { parser: { syntax: 'not-a-parser' } }
void jsc
`,
        2322,
      ],
      [
        'invalid-target',
        `import type { Options } from 'tsup'
const jsc: NonNullable<NonNullable<Options['swc']>['jsc']> = { target: 42 }
void jsc
`,
        2322,
      ],
      [
        'invalid-terser',
        `import type { Options } from 'tsup'
const value: NonNullable<Options['terserOptions']> = { compress: 42 }
void value
`,
        2322,
      ],
    ] as const
    for (const [name, source] of controls) {
      await fs.writeFile(path.join(consumer, `${name}.ts`), source)
    }
    const compilerOptions = {
      target: 'ESNext',
      module: 'Preserve',
      moduleResolution: 'Bundler',
      strict: true,
      skipLibCheck: false,
      paths: {},
      noEmit: true,
      types: ['node'],
    }
    for (const [name, files] of [
      ['positive', ['positive.ts']],
      [
        'negative',
        ['invalid-syntax.ts', 'invalid-target.ts', 'invalid-terser.ts'],
      ],
    ] as const) {
      await fs.writeFile(
        path.join(consumer, `${name}.json`),
        JSON.stringify({ compilerOptions, files }),
      )
    }
    // Share the original three 5s compiler allowances across these two loads.
    // Each child receives only the time left in the single compiler phase.
    const compilerDeadline = performance.now() + 15000
    const compile = async (name: string) => {
      const remaining = compilerDeadline - performance.now()
      expect(
        remaining,
        'The shared 15s compiler phase is exhausted',
      ).toBeGreaterThan(0)
      const compiled = await run(
        [
          process.execPath,
          path.join(root, 'node_modules/typescript/bin/tsc'),
          '--project',
          path.join(consumer, `${name}.json`),
          '--pretty',
          'false',
        ],
        consumer,
        remaining,
      )
      expect(
        performance.now(),
        'The shared 15s compiler phase elapsed',
      ).toBeLessThanOrEqual(compilerDeadline)
      return compiled
    }
    // Keep the positive independent. The negative modules can share one
    // load of the public declaration graph without sharing local bindings.
    const positive = await compile('positive')
    expect(positive.code, positive.output).toBe(0)
    expect(positive.output.match(/error TS\d+:/g) ?? []).toEqual([])
    const negative = await compile('negative')
    expect(negative.code, negative.output).toBe(2)
    const diagnostics = negative.output
      .trim()
      .split(/\r?\n/)
      .map((line) => {
        const match = line.match(/^(.+)\((\d+),(\d+)\): error TS(\d+): (.+)$/)
        if (!match) throw new Error(`Unexpected compiler output: ${line}`)
        return {
          file: path.resolve(consumer, match[1]),
          line: Number(match[2]),
          column: Number(match[3]),
          code: Number(match[4]),
        }
      })
    expect(diagnostics, negative.output).toEqual([
      {
        file: path.join(consumer, 'invalid-syntax.ts'),
        line: 2,
        column: 74,
        code: 2322,
      },
      {
        file: path.join(consumer, 'invalid-target.ts'),
        line: 2,
        column: 64,
        code: 2322,
      },
      {
        file: path.join(consumer, 'invalid-terser.ts'),
        line: 2,
        column: 56,
        code: 2322,
      },
    ])
  } finally {
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
