import path from 'node:path'
import fs from 'node:fs/promises'

export default async function setup() {
  // Fixture dependencies live in the `tsup-test` workspace package and are
  // installed by `pnpm install` in the project root
  const cacheDir = path.resolve(__dirname, 'test', '.cache')
  await fs.rm(cacheDir, { recursive: true, force: true })
}
