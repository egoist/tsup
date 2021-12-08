import test from 'ava'
import { resolve } from 'path'
import execa from 'execa'
import fs from 'fs-extra'
import glob from 'globby'
import waitForExpect from 'wait-for-expect'
import { debouncePromise } from '../src/utils'

const cacheDir = resolve(__dirname, '.cache')
const bin = resolve(__dirname, '../dist/cli-default.js')

test.before(async () => {
  await fs.remove(cacheDir)
  console.log(`Installing dependencies in ./test folder`)
  await execa('pnpm', ['i'], { cwd: __dirname })
  console.log(`Done... start testing..`)
})

function filenamify(input: string) {
  return input.replace(/[^a-zA-Z0-9]/g, '-')
}

async function run(
  title: string,
  files: { [name: string]: string },
  options: {
    entry?: string[]
    flags?: string[]
    env?: Record<string, string>
  } = {}
) {
  const testDir = resolve(cacheDir, filenamify(title))

  // Write entry files on disk
  await Promise.all(
    Object.keys(files).map((name) => {
      return fs.outputFile(resolve(testDir, name), files[name], 'utf8')
    })
  )

  const entry = options.entry || ['input.ts']

  // Run tsup cli
  const { exitCode, stdout, stderr } = await execa(
    bin,
    [...entry, ...(options.flags || [])],
    {
      cwd: testDir,
      env: { ...process.env, ...options.env },
    }
  )
  const logs = stdout + stderr
  if (exitCode !== 0) {
    throw new Error(logs)
  }

  // Get output
  const outFiles = await glob('**/*', {
    cwd: resolve(testDir, 'dist'),
  }).then((res) => res.sort())

  return {
    get output() {
      return fs.readFileSync(resolve(testDir, 'dist/input.js'), 'utf8')
    },
    outFiles,
    logs,
    getFileContent(filename: string) {
      return fs.readFile(resolve(testDir, filename), 'utf8')
    },
  }
}

test('simple', async (t) => {
  const { output, outFiles } = await run(t.title, {
    'input.ts': `import foo from './foo';export default foo`,
    'foo.ts': `export default 'foo'`,
  })
  t.snapshot(output)
  t.deepEqual(outFiles, ['input.js'])
})

test('bundle graphql-tools with --dts flag', async (t) => {
  await run(
    t.title,
    {
      'input.ts': `export { makeExecutableSchema } from 'graphql-tools'`,
    },
    {
      flags: ['--dts'],
    }
  )
  t.pass()
})

test('bundle graphql-tools with --dts-resolve flag', async (t) => {
  await run(
    t.title,
    {
      'input.ts': `export { makeExecutableSchema } from 'graphql-tools'`,
    },
    {
      flags: ['--dts-resolve'],
    }
  )
  t.pass()
})

test('bundle vue and ts-essentials with --dts --dts-resolve flag', async (t) => {
  await run(
    t.title,
    {
      'input.ts': `export * from 'vue'
      export type { MarkRequired } from 'ts-essentials'
      `,
    },
    {
      flags: ['--dts', '--dts-resolve'],
    }
  )
  t.pass()
})

test('bundle @egoist/path-parser with --dts --dts-resolve flag', async (t) => {
  const { getFileContent } = await run(
    t.title,
    {
      'input.ts': `import { PathParser } from '@egoist/path-parser'
      export type Opts = {
        parser: PathParser
        route: string
      }
      `,
    },
    {
      flags: ['--dts', '--dts-resolve'],
    }
  )
  t.pass()
})

test('enable --dts-resolve for specific module', async (t) => {
  const { getFileContent } = await run(t.title, {
    'input.ts': `export * from 'vue'
      export type {MarkRequired} from 'foo'
      `,
    'node_modules/foo/index.d.ts': `
      export type MarkRequired<T, RK extends keyof T> = Exclude<T, RK> & Required<Pick<T, RK>>
      `,
    'node_modules/foo/package.json': `{ "name": "foo", "version": "0.0.0" }`,
    'tsup.config.ts': `
      export default {
        dts: {
          resolve: ['foo']
        },
      }
      `,
  })
  const content = await getFileContent('dist/input.d.ts')
  t.snapshot(content)
})

test('bundle graphql-tools with --sourcemap flag', async (t) => {
  await run(
    t.title,
    {
      'input.ts': `export { makeExecutableSchema } from 'graphql-tools'`,
    },
    {
      flags: ['--sourcemap'],
    }
  )
  t.pass()
})

test('bundle graphql-tools with --sourcemap inline flag', async (t) => {
  const { output } = await run(
    t.title,
    {
      'input.ts': `export { makeExecutableSchema } from 'graphql-tools'`,
    },
    {
      flags: ['--sourcemap', 'inline'],
    }
  )

  t.assert(output.includes('//# sourceMappingURL='))
})

test('multiple formats', async (t) => {
  const { output, outFiles } = await run(
    t.title,
    {
      'input.ts': `
    export const a = 1
    `,
    },
    {
      flags: ['--format', 'esm,cjs,iife'],
    }
  )

  t.snapshot(output)
  t.deepEqual(outFiles, ['input.global.js', 'input.js', 'input.mjs'])
})

test('multiple formats and pkg.type is module', async (t) => {
  const { output, outFiles } = await run(
    t.title,
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

  t.snapshot(output)
  t.deepEqual(outFiles, ['input.cjs', 'input.global.js', 'input.js'])
})

test('multiple formats with legacy output', async (t) => {
  const { output, outFiles } = await run(
    t.title,
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

  t.snapshot(output)
  t.deepEqual(outFiles, ['esm/input.js', 'iife/input.js', 'input.js'])
})

test('minify', async (t) => {
  const { output, outFiles } = await run(
    t.title,
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

  t.snapshot(output)
  t.deepEqual(outFiles, ['input.js'])
})

test('--env flag', async (t) => {
  const { output, outFiles } = await run(
    t.title,
    {
      'input.ts': `
    export const env = process.env.NODE_ENV
    `,
    },
    {
      flags: ['--env.NODE_ENV', 'production'],
    }
  )

  t.snapshot(output)
  t.deepEqual(outFiles, ['input.js'])
})

test('import css', async (t) => {
  const { output, outFiles } = await run(t.title, {
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

  t.snapshot(output, `""`)
  t.deepEqual(outFiles, ['input.css', 'input.js'])
})

test('import css in --dts', async (t) => {
  const { output, outFiles } = await run(
    t.title,
    {
      'input.ts': `
    import './foo.css'
    `,
      'foo.css': `  
  .foo {
    color: blue
  }
    `,
    },
    { flags: ['--dts'] }
  )

  t.snapshot(output)
  t.deepEqual(outFiles, ['input.css', 'input.d.ts', 'input.js'])
})

test('node protocol', async (t) => {
  const { output } = await run(t.title, {
    'input.ts': `import fs from 'node:fs'; console.log(fs)`,
  })
  t.snapshot(output)
})

test('external', async (t) => {
  const { output } = await run(t.title, {
    'input.ts': `export {foo} from 'foo'
    export {bar} from 'bar'
    export {baz} from 'baz'
    `,
    'node_modules/foo/index.ts': `export const foo = 'foo'`,
    'node_modules/foo/package.json': `{"name":"foo","version":"0.0.0"}`,
    'node_modules/bar/index.ts': `export const bar = 'bar'`,
    'node_modules/bar/package.json': `{"name":"bar","version":"0.0.0"}`,
    'node_modules/baz/index.ts': `export const baz = 'baz'`,
    'node_modules/baz/package.json': `{"name":"baz","version":"0.0.0"}`,
    'tsup.config.ts': `
    export default {
      external: [/f/, 'bar']
    }
    `,
  })
  t.snapshot(output)
})

test('disable code splitting to get proper module.exports =', async (t) => {
  const { output } = await run(
    t.title,
    {
      'input.ts': `export = 123`,
    },
    {
      flags: ['--no-splitting'],
    }
  )
  t.snapshot(output)
})

test('bundle svelte', async (t) => {
  const { output, getFileContent } = await run(
    t.title,
    {
      'input.ts': `import App from './App.svelte'
      export { App }
      `,
      'App.svelte': `
      <script>
      let msg = 'hello svelte'
      </script>

      <span>{msg}</span>

      <style>
      span {color: red}
      </style>
      `,
    },
    {
      // To make the snapshot leaner
      flags: ['--external', 'svelte/internal'],
    }
  )
  t.snapshot(output, 'output')

  t.snapshot(await getFileContent('dist/input.css'), 'css')
})

test('bundle svelte without styles', async (t) => {
  const { outFiles } = await run(t.title, {
    'input.ts': `import App from './App.svelte'
      export { App }
      `,
    'App.svelte': `
      <script>
      let msg = 'hello svelte'
      </script>

      <span>{msg}</span>
      `,
  })

  t.deepEqual(outFiles, ['input.js'])
})

test('svelte: typescript support', async (t) => {
  const { outFiles, output } = await run(t.title, {
    'input.ts': `import App from './App.svelte'
      export { App }
      `,
    'App.svelte': `
      <script lang="ts">
      import Component from './Component.svelte'
      let say: string = 'hello'
      let name: string = 'svelte'
      </script>

      <Component {name}>{say}</Component>
      `,
    'Component.svelte': `
      <script lang="ts">
      export let name: string
      </script>

      <slot /> {name}
    `,
  })

  t.deepEqual(outFiles, ['input.js'])
  t.assert(output.includes('// Component.svelte'))
})

test('onSuccess', async (t) => {
  const randomNumber = Math.random() + ''
  const { logs } = await run(
    t.title,
    {
      'input.ts': "console.log('test');",
    },
    {
      flags: ['--onSuccess', 'echo ' + randomNumber],
    }
  )

  t.deepEqual(logs.includes(randomNumber), true)
})

test('support baseUrl and paths in tsconfig.json', async (t) => {
  const { getFileContent } = await run(t.title, {
    'input.ts': `export * from '@/foo'`,
    'foo.ts': `export const foo = 'foo'`,
    'tsconfig.json': `{
      "compilerOptions": {
        "baseUrl":".",
        "paths":{"@/*": ["./*"]}
      }
    }`,
  })
  t.snapshot(await getFileContent('dist/input.js'))
})

test('support baseUrl and paths in tsconfig.json in --dts build', async (t) => {
  const { getFileContent } = await run(
    t.title,
    {
      'input.ts': `export * from '@/foo'`,
      'src/foo.ts': `export const foo = 'foo'`,
      'tsconfig.json': `{
      "compilerOptions": {
        "baseUrl":".",
        "paths":{"@/*": ["./src/*"]}
      }
    }`,
    },
    { flags: ['--dts'] }
  )
  t.snapshot(await getFileContent('dist/input.d.ts'))
})

test('support baseUrl and paths in tsconfig.json in --dts-resolve build', async (t) => {
  const { getFileContent } = await run(
    t.title,
    {
      'input.ts': `export * from '@/foo'`,
      'src/foo.ts': `export const foo = 'foo'`,
      'tsconfig.json': `{
      "compilerOptions": {
        "baseUrl":".",
        "paths":{"@/*": ["./src/*"]}
      }
    }`,
    },
    { flags: ['--dts-resolve'] }
  )
  t.snapshot(await getFileContent('dist/input.d.ts'))
})

test(`transform import.meta.url in cjs format`, async (t) => {
  const { getFileContent } = await run(t.title, {
    'input.ts': `export default import.meta.url`,
  })
  t.snapshot(await getFileContent('dist/input.js'))
})

test(`transform __dirname, __filename in esm format`, async (t) => {
  const { getFileContent } = await run(
    t.title,
    {
      'input.ts': `export const a = __dirname
    export const b = __filename
    `,
    },
    {
      flags: ['--format', 'esm'],
    }
  )
  t.snapshot(await getFileContent('dist/input.mjs'))
})

test('debounce promise', async (t) => {
  try {
    const equal = <T>(a: T, b: T) => {
      const result = a === b
      if (!result) throw new Error(`${a} !== ${b}`)
    }

    const sleep = (n: number = ~~(Math.random() * 50) + 20) =>
      new Promise<void>((resolve) => setTimeout(resolve, n))

    let n = 0

    const debounceFunction = debouncePromise(
      async () => {
        await sleep()
        ++n
      },
      100,
      (err: any) => {
        t.fail(err)
      }
    )

    t.deepEqual(n, 0)

    debounceFunction()
    debounceFunction()
    debounceFunction()
    debounceFunction()

    await waitForExpect(() => {
      equal(n, 1)
    })
    await sleep(100)

    t.deepEqual(n, 1)

    debounceFunction()

    await waitForExpect(() => {
      equal(n, 2)
    })
  } catch (err: any) {
    return t.fail(err)
  }
})

test('exclude dependencies', async (t) => {
  const { getFileContent } = await run(t.title, {
    'input.ts': `export {foo} from 'foo';export {nested} from 'foo/nested'`,
    'package.json': `{"dependencies":{"foo":"0.0.0"}}`,
    'node_modules/foo/index.js': `export const foo = 'foo'`,
    'node_modules/foo/package.json': `{"name":"foo"}`,
  })
  const contents = await getFileContent('dist/input.js')
  t.assert(contents.includes('require("foo")'))
  t.assert(contents.includes('require("foo/nested")'))
})

test('code splitting in cjs format', async (t) => {
  const { getFileContent } = await run(
    t.title,
    {
      'input.ts': `const foo = () => import('./foo');export {foo}`,
      'another-input.ts': `const foo = () => import('./foo');export {foo}`,
      'foo.ts': `export const foo = 'bar'`,
    },
    { flags: ['another-input.ts', '--splitting'] }
  )
  t.snapshot(await getFileContent('dist/input.js'))
  t.snapshot(await getFileContent('dist/another-input.js'))
})

test('declaration files with multiple entrypoints #316', async (t) => {
  const { getFileContent } = await run(
    t.title,
    {
      'src/index.ts': `export const foo = 1`,
      'src/bar/index.ts': `export const bar = 'bar'`,
    },
    { flags: ['--dts'], entry: ['src/index.ts', 'src/bar/index.ts'] }
  )
  t.snapshot(await getFileContent('dist/index.d.ts'), 'dist/index.d.ts')
  t.snapshot(await getFileContent('dist/bar/index.d.ts'), 'dist/bar/index.d.ts')
})

test('esbuild metafile', async (t) => {
  const { outFiles } = await run(
    t.title,
    { 'input.ts': `export const foo = 1` },
    {
      flags: ['--metafile'],
    }
  )
  t.deepEqual(outFiles, ['input.js', 'metafile-cjs.json'])
})

test('multiple entry with the same base name', async (t) => {
  const { outFiles } = await run(
    t.title,
    {
      'src/input.ts': `export const foo = 1`,
      'src/bar/input.ts': `export const bar = 2`,
    },
    {
      entry: ['src/input.ts', 'src/bar/input.ts'],
    }
  )
  t.deepEqual(outFiles, ['bar/input.js', 'input.js'])
})

test('windows: backslash in entry', async (t) => {
  const { outFiles } = await run(
    t.title,
    { 'src/input.ts': `export const foo = 1` },
    {
      entry: ['src\\input.ts'],
    }
  )
  t.deepEqual(outFiles, ['input.js'])
})

test('emit declaration files only', async (t) => {
  const { outFiles } = await run(
    t.title,
    {
      'input.ts': `export const foo = 1`,
    },
    {
      flags: ['--dts-only'],
    }
  )
  t.deepEqual(outFiles, ['input.d.ts'])
})

test('decorator metadata', async (t) => {
  const { getFileContent } = await run(t.title, {
    'input.ts': `
        function Injectable() {}

        @Injectable()
        export class Foo {
          @Field()
          bar() {}
        }
      `,
    'tsconfig.json': `{
        "compilerOptions": {
          "emitDecoratorMetadata": true,
        }
      }`,
  })
  const contents = await getFileContent('dist/input.js')
  t.assert(contents.includes(`Reflect.metadata("design:type"`))
})

test('inject style', async (t) => {
  const { outFiles, output } = await run(
    t.title,
    {
      'input.ts': `import './style.css'`,
      'style.css': `.hello { color: red }`,
    },
    {
      flags: ['--inject-style', '--minify'],
    }
  )
  t.deepEqual(outFiles, ['input.js'])
  t.assert(output.includes('.hello{color:red}'))
})
