import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

type WorkerBehavior = (worker: FakeWorker) => void

let nextWorkerBehavior: WorkerBehavior = () => {}

class FakeWorker extends EventEmitter {
  terminated = false

  postMessage() {
    queueMicrotask(() => nextWorkerBehavior(this))
  }

  terminate() {
    this.terminated = true
    queueMicrotask(() => this.emit('exit', 0))
    return Promise.resolve(0)
  }
}

vi.mock('node:worker_threads', () => ({
  Worker: FakeWorker,
}))

describe('dts worker lifecycle', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsup-dts-worker-'))
    fs.writeFileSync(path.join(tmpDir, 'index.ts'), 'export const a = 1\n')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  test('rejects when dts worker exits with non-zero code without sending a result', async () => {
    nextWorkerBehavior = (worker) => {
      worker.emit('exit', 1)
    }

    const { build } = await import('../src/index')
    await expect(
      build({
        entry: [path.join(tmpDir, 'index.ts')],
        outDir: path.join(tmpDir, 'dist'),
        dts: { only: true },
        config: false,
        silent: true,
      }),
    ).rejects.toThrow('dts worker exited with code 1')
  })

  test('rejects when dts worker exits with code 0 before sending a result', async () => {
    nextWorkerBehavior = (worker) => {
      worker.emit('exit', 0)
    }

    const { build } = await import('../src/index')
    await expect(
      build({
        entry: [path.join(tmpDir, 'index.ts')],
        outDir: path.join(tmpDir, 'dist'),
        dts: { only: true },
        config: false,
        silent: true,
      }),
    ).rejects.toThrow('dts worker exited unexpectedly before completing')
  })

  test('rejects when dts worker emits an error event', async () => {
    nextWorkerBehavior = (worker) => {
      worker.emit('error', new Error('worker crashed'))
    }

    const { build } = await import('../src/index')
    await expect(
      build({
        entry: [path.join(tmpDir, 'index.ts')],
        outDir: path.join(tmpDir, 'dist'),
        dts: { only: true },
        config: false,
        silent: true,
      }),
    ).rejects.toThrow('worker crashed')
  })

  test('resolves when dts worker reports success before exiting', async () => {
    nextWorkerBehavior = (worker) => {
      worker.emit('message', 'success')
    }

    const { build } = await import('../src/index')
    await expect(
      build({
        entry: [path.join(tmpDir, 'index.ts')],
        outDir: path.join(tmpDir, 'dist'),
        dts: { only: true },
        config: false,
        silent: true,
      }),
    ).resolves.toBeUndefined()
  })
})
