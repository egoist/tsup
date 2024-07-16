import execa from 'execa'
import path from 'path'
import fs from 'fs/promises'

export default async function setup() {
  const testDir = path.resolve(__dirname, 'test')
  const cacheDir = path.resolve(testDir, '.cache')
  await fs.rm(cacheDir, { recursive: true, force: true })
  console.log(`Installing dependencies in ./test folder`)
  await execa('pnpm', ['i'], { cwd: testDir })
  console.log(`Done... start testing..`)
}
