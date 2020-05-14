import { join } from 'path'
import execa from 'execa'
import fs from 'fs-extra'

const cacheDir = join(__dirname, '.cache')
const bin = join(__dirname, '../dist/cli.js')

beforeAll(async () => {
  await fs.remove(cacheDir)
})

function runTest(title: string, files: { [name: string]: string }) {
  const testDir = join(cacheDir, title)
  test(title, async () => {
    await Promise.all(
      Object.keys(files).map((name) => {
        return fs.outputFile(join(testDir, name), files[name], 'utf8')
      })
    )
    const { exitCode } = await execa(bin, ['input.js'], {
      cwd: testDir,
    })
    expect(exitCode).toBe(0)
    const output = await fs.readFile(join(testDir, 'dist/input.js'), 'utf8')
    expect(output).toMatchInlineSnapshot(`
      "'use strict';

      Object.defineProperty(exports, '__esModule', { value: true });

      var foo2 = \\"foo\\";

      exports.default = foo2;
      "
    `)
  })
}

runTest('simple', {
  'input.js': `import foo from './foo';export default foo`,
  'foo.js': `export default 'foo'`,
})
