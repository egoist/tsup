import { join } from 'path'
import execa from 'execa'
import fs from 'fs-extra'

jest.setTimeout(60000)

const cacheDir = join(__dirname, '.cache')
const bin = join(__dirname, '../dist/cli.js')

beforeAll(async () => {
  await fs.remove(cacheDir)
  await execa('yarn', { cwd: __dirname })
})

function runTest(
  title: string,
  files: { [name: string]: string },
  options: { flags?: string[]; snapshot?: boolean } = {}
) {
  const testDir = join(cacheDir, title)
  test(title, async () => {
    await Promise.all(
      Object.keys(files).map((name) => {
        return fs.outputFile(join(testDir, name), files[name], 'utf8')
      })
    )
    const { exitCode } = await execa(
      bin,
      ['input.ts', ...(options.flags || [])],
      {
        cwd: testDir,
      }
    )
    expect(exitCode).toBe(0)
    if (options.snapshot !== false) {
      const output = await fs.readFile(join(testDir, 'dist/input.js'), 'utf8')
      expect(output).toMatchSnapshot()
    }
  })
}

runTest('simple', {
  'input.ts': `import foo from './foo';export default foo`,
  'foo.ts': `export default 'foo'`,
})

runTest(
  'bundle graphql-tools with --dts flag',
  {
    'input.ts': `export { makeExecutableSchema } from 'graphql-tools'`,
  },
  {
    snapshot: false,
    flags: ['--dts']
  }
)
