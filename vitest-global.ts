import path from 'node:path'
import fs from 'node:fs/promises'
import { x } from 'tinyexec'

export default async function setup() {
  const testDir = path.resolve(__dirname, 'test')
  const cacheDir = path.resolve(testDir, '.cache')
  await fs.rm(cacheDir, { recursive: true, force: true })
  console.log(`Installing dependencies in ./test folder`)
  await x('pnpm', ['i'], { nodeOptions: { cwd: testDir } })
  console.log(`Done... start testing..`)
}
