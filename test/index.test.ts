import { join } from 'path'
import execa from 'execa'
import fs from 'fs-extra'
import glob from 'globby'

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
  'bundle vue and type-fest with --dts=bundle flag',
  {
    'input.ts': `export * from 'vue'
    export * as TypeFest from 'type-fest'
    `,
  },
  {
    snapshot: false,
    flags: [
      '--dts',
      'bundle',
      // For type-only modules you need to externalize it, `--dts bundle` will ignore this option
      '--external',
      'type-fest',
    ],
  }
)

runTest(
  'bundle graphql-tools with --sourcemap flag',
  {
    'input.ts': `export { makeExecutableSchema } from 'graphql-tools'`,
  },
  {
    snapshot: false,
    flags: ['--sourcemap'],
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

runTest(
  'multiple formats with legacy output',
  {
    'input.ts': `
  export const a = 1
  `,
    'package.json': JSON.stringify({ type: 'module' }),
  },
  {
    flags: ['--format', 'esm,cjs,iife', '--legacy-output'],
  }
)

runTest(
  'minify',
  {
    'input.ts': `
  export function foo() {
    return 'foo'
  }
  `,
  },
  {
    flags: ['--minify'],
  }
)

runTest(
  '--env flag',
  {
    'input.ts': `
  export const env = process.env.NODE_ENV
  `,
  },
  {
    flags: ['--env.NODE_ENV', 'production'],
  }
)

runTest('import css', {
  'input.ts': `
  import './foo.css'
  `,
  'postcss.config.js': `
  module.exports = {
    plugins: [require('postcss-simple-vars')()]
  }
  `,
  'foo.css': `
$color: blue;

.foo {
  color: $color;
}
  `,
})
