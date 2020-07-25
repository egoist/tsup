import { join } from 'path'
import execa from 'execa'
import fs from 'fs-extra'
import glob from 'fast-glob'

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
    const { exitCode, stdout, stderr } = await execa(
      bin,
      ['input.ts', ...(options.flags || [])],
      {
        cwd: testDir,
      }
    )
    if (exitCode !== 0) {
      throw new Error(stdout + stderr)
    }
    if (options.snapshot !== false) {
      const output = await fs.readFile(join(testDir, 'dist/input.js'), 'utf8')
      expect(output).toMatchSnapshot('output file')
      const files = await glob('**/*', {
        cwd: join(testDir, 'dist'),
      })
      expect(files).toMatchSnapshot('output file list')
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
    flags: ['--dts'],
  }
)

runTest(
  'es5 target',
  {
    'input.ts': `
  export class Foo {
    hi (): void {
      let a = () => 'foo'

      console.log(a())
    }
  }
  `,
  },
  {
    flags: ['--target', 'es5'],
  }
)

runTest(
  'multiple formats',
  {
    'input.ts': `
  export const a = 1
  `,
  },
  {
    flags: ['--format', 'esm,cjs,iife'],
  }
)

runTest(
  'multiple formats and pkg.type is module',
  {
    'input.ts': `
  export const a = 1
  `,
    'package.json': JSON.stringify({ type: 'module' }),
  },
  {
    flags: ['--format', 'esm,cjs,iife'],
  }
)
