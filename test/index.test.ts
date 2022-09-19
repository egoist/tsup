import { test, expect, beforeAll } from 'vitest'
import path from 'path'
import execa from 'execa'
import fs from 'fs-extra'
import glob from 'globby'
import waitForExpect from 'wait-for-expect'
import { fileURLToPath } from 'url'
import { debouncePromise } from '../src/utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const cacheDir = path.resolve(__dirname, '.cache')
const bin = path.resolve(__dirname, '../dist/cli-default.js')

const getTestName = () => {
  const name = expect
    .getState()
    .currentTestName?.replace(/^[a-z]+/g, '_')
    .replace(/-/g, '_')

  if (!name) {
    throw new Error('No test name')
  }

  return name
}

beforeAll(async () => {
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
  const testDir = path.resolve(cacheDir, filenamify(title))

  // Write entry files on disk
  await Promise.all(
    Object.keys(files).map((name) => {
      return fs.outputFile(path.resolve(testDir, name), files[name], 'utf8')
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
    cwd: path.resolve(testDir, 'dist'),
  }).then((res) => res.sort())

  return {
    get output() {
      return fs.readFileSync(path.resolve(testDir, 'dist/input.js'), 'utf8')
    },
    outFiles,
    logs,
    outDir: path.resolve(testDir, 'dist'),
    getFileContent(filename: string) {
      return fs.readFile(path.resolve(testDir, filename), 'utf8')
    },
  }
}

test('simple', async () => {
  const { output, outFiles } = await run(getTestName(), {
    'input.ts': `import foo from './foo';export default foo`,
    'foo.ts': `export default 'foo'`,
  })
  expect(output).toMatchSnapshot()
  expect(outFiles).toEqual(['input.js'])
})

test('bundle graphql-tools with --dts flag', async () => {
  await run(
    getTestName(),
    {
      'input.ts': `export { makeExecutableSchema } from 'graphql-tools'`,
    },
    {
      flags: ['--dts'],
    }
  )
})

test('bundle graphql-tools with --dts-resolve flag', async () => {
  await run(
    getTestName(),
    {
      'input.ts': `export { makeExecutableSchema } from 'graphql-tools'`,
    },
    {
      flags: ['--dts-resolve'],
    }
  )
})

test('bundle vue and ts-essentials with --dts --dts-resolve flag', async () => {
  await run(
    getTestName(),
    {
      'input.ts': `export * from 'vue'
      export type { MarkRequired } from 'ts-essentials'
      `,
    },
    {
      flags: ['--dts', '--dts-resolve'],
    }
  )
})

test('bundle @egoist/path-parser with --dts --dts-resolve flag', async () => {
  const { getFileContent } = await run(
    getTestName(),
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
})

test('enable --dts-resolve for specific module', async () => {
  const { getFileContent } = await run(getTestName(), {
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
  expect(content).toMatchSnapshot()
})

test('bundle graphql-tools with --sourcemap flag', async () => {
  const { outFiles } = await run(
    getTestName(),
    {
      'input.ts': `export { makeExecutableSchema } from 'graphql-tools'`,
    },
    {
      flags: ['--sourcemap'],
    }
  )
  expect(outFiles).toEqual(['input.js', 'input.js.map'])
})

test('bundle graphql-tools with --sourcemap inline flag', async () => {
  const { output, outFiles } = await run(
    getTestName(),
    {
      'input.ts': `export { makeExecutableSchema } from 'graphql-tools'`,
    },
    {
      flags: ['--sourcemap', 'inline'],
    }
  )

  expect(output).toContain('//# sourceMappingURL=data:application/json;base64')
  expect(outFiles).toEqual(['input.js'])
})

test('multiple formats', async () => {
  const { output, outFiles } = await run(
    getTestName(),
    {
      'input.ts': `
    export const a = 1
    `,
    },
    {
      flags: ['--format', 'esm,cjs,iife'],
    }
  )

  expect(outFiles).toEqual(['input.global.js', 'input.js', 'input.mjs'])
})

test('multiple formats and pkg.type is module', async () => {
  const { output, outFiles } = await run(
    getTestName(),
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

  expect(outFiles).toEqual(['input.cjs', 'input.global.js', 'input.js'])
})

test('minify', async () => {
  const { output, outFiles } = await run(
    getTestName(),
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

  expect(output).toContain(`return"foo"`)
  expect(outFiles).toEqual(['input.js'])
})

test('minify with es5 target', async () => {
  const { output, outFiles } = await run(
    getTestName(),
    {
      'input.ts': `
    export function foo() {
      return 'foo'
    }
    `,
    },
    {
      flags: ['--minify', '--target', 'es5'],
    }
  )

  expect(output).toContain(`return"foo"`)
  expect(outFiles).toEqual(['input.js'])
})

test('env flag', async () => {
  const { output, outFiles } = await run(
    getTestName(),
    {
      'input.ts': `
    export const env = process.env.NODE_ENV
    `,
    },
    {
      flags: ['--env.NODE_ENV', 'production'],
    }
  )

  expect(output).toContain('var env = "production"')
  expect(outFiles).toEqual(['input.js'])
})

test('import css', async () => {
  const { output, outFiles } = await run(getTestName(), {
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

  expect(output, `""`).toMatchSnapshot()
  expect(outFiles).toEqual(['input.css', 'input.js'])
})

test('import css in --dts', async () => {
  const { output, outFiles } = await run(
    getTestName(),
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

  expect(output).toMatchSnapshot()
  expect(outFiles).toEqual(['input.css', 'input.d.ts', 'input.js'])
})

test('node protocol', async () => {
  const { output } = await run(getTestName(), {
    'input.ts': `import fs from 'node:fs'; console.log(fs)`,
  })
  expect(output).toMatchSnapshot()
})

test('external', async () => {
  const { output } = await run(getTestName(), {
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
  expect(output).toMatchSnapshot()
})

test('noExternal are respected when skipNodeModulesBundle is true', async () => {
  const { output } = await run(getTestName(), {
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
      skipNodeModulesBundle: true,
      noExternal: [/foo/]
    }
    `,
  })
  expect(output).toMatchSnapshot()
})

test('disable code splitting to get proper module.exports =', async () => {
  const { output } = await run(
    getTestName(),
    {
      'input.ts': `export = 123`,
    },
    {
      flags: ['--no-splitting'],
    }
  )
  expect(output).toMatchSnapshot()
})

test('bundle svelte', async () => {
  const { output, getFileContent } = await run(
    getTestName(),
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
  expect(output).not.toContain('<script>')
  const css = await getFileContent('dist/input.css')
  expect(css).toContain('color: red;')
})

test('bundle svelte without styles', async () => {
  const { outFiles } = await run(getTestName(), {
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

  expect(outFiles).toEqual(['input.js'])
})

test('svelte: typescript support', async () => {
  const { outFiles, output } = await run(getTestName(), {
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

  expect(outFiles).toEqual(['input.js'])
  expect(output).toContain('// Component.svelte')
})

test('onSuccess', async () => {
  const { logs } = await run(
    getTestName(),
    {
      'input.ts': "console.log('test');",
    },
    {
      flags: ['--onSuccess', 'echo hello && echo world'],
    }
  )

  expect(logs.includes('hello')).toEqual(true)
  expect(logs.includes('world')).toEqual(true)
})

test('onSuccess: use a function from config file', async () => {
  const { logs } = await run(getTestName(), {
    'input.ts': "console.log('test');",
    'tsup.config.ts': `
        export default {
          onSuccess: async () => {
            console.log('hello')
            await new Promise((resolve) => {
              setTimeout(() => {
                console.log('world')
                resolve('')  
              }, 1_000)
            })
          }
        }`,
  })

  expect(logs.includes('hello')).toEqual(true)
  expect(logs.includes('world')).toEqual(true)
})

test('custom tsconfig', async () => {
  await run(
    getTestName(),
    {
      'input.ts': `export const foo = 'foo'`,
      'tsconfig.build.json': `{
      "compilerOptions": {
        "baseUrl":"."
      }
    }`,
    },
    { flags: ['--tsconfig', 'tsconfig.build.json'] }
  )
})

test('support baseUrl and paths in tsconfig.json', async () => {
  const { getFileContent } = await run(getTestName(), {
    'input.ts': `export * from '@/foo'`,
    'foo.ts': `export const foo = 'foo'`,
    'tsconfig.json': `{
      "compilerOptions": {
        "baseUrl":".",
        "paths":{"@/*": ["./*"]}
      }
    }`,
  })
  expect(await getFileContent('dist/input.js')).toMatchSnapshot()
})

test('support baseUrl and paths in tsconfig.json in --dts build', async () => {
  const { getFileContent } = await run(
    getTestName(),
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
  expect(await getFileContent('dist/input.d.ts')).toMatchSnapshot()
})

test('support baseUrl and paths in tsconfig.json in --dts-resolve build', async () => {
  const { getFileContent } = await run(
    getTestName(),
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
  expect(await getFileContent('dist/input.d.ts')).toMatchSnapshot()
})

test(`transform import.meta.url in cjs format`, async () => {
  const { getFileContent } = await run(
    getTestName(),
    {
      'input.ts': `export default import.meta.url`,
    },
    {
      flags: ['--shims'],
    }
  )
  expect(await getFileContent('dist/input.js')).toContain('getImportMetaUrl')
})

test(`transform __dirname and __filename in esm format`, async () => {
  const { getFileContent } = await run(
    getTestName(),
    {
      'input.ts': `export const a = __dirname
    export const b = __filename
    `,
    },
    {
      flags: ['--format', 'esm', '--shims'],
    }
  )
  const code = await getFileContent('dist/input.mjs')

  expect(code).toContain('getFilename')
  expect(code).toContain('getDirname')
})

test('debounce promise', async () => {
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
        expect.fail(err.message)
      }
    )

    expect(n).toEqual(0)

    debounceFunction()
    debounceFunction()
    debounceFunction()
    debounceFunction()

    await waitForExpect(() => {
      equal(n, 1)
    })
    await sleep(100)

    expect(n).toEqual(1)

    debounceFunction()

    await waitForExpect(() => {
      equal(n, 2)
    })
  } catch (err: any) {
    return expect.fail(err.message)
  }
})

test('exclude dependencies', async () => {
  const { getFileContent } = await run(getTestName(), {
    'input.ts': `export {foo} from 'foo';export {nested} from 'foo/nested'`,
    'package.json': `{"dependencies":{"foo":"0.0.0"}}`,
    'node_modules/foo/index.js': `export const foo = 'foo'`,
    'node_modules/foo/package.json': `{"name":"foo"}`,
  })
  const contents = await getFileContent('dist/input.js')
  expect(contents).toContain('require("foo")')
  expect(contents).toContain('require("foo/nested")')
})

test('code splitting in cjs format', async () => {
  const { getFileContent } = await run(
    getTestName(),
    {
      'input.ts': `const foo = () => import('./foo');export {foo}`,
      'another-input.ts': `const foo = () => import('./foo');export {foo}`,
      'foo.ts': `export const foo = 'bar'`,
    },
    { flags: ['another-input.ts', '--splitting'] }
  )
  expect(await getFileContent('dist/input.js')).toMatchSnapshot()
  expect(await getFileContent('dist/another-input.js')).toMatchSnapshot()
})

test('declaration files with multiple entrypoints #316', async () => {
  const { getFileContent } = await run(
    getTestName(),
    {
      'src/index.ts': `export const foo = 1`,
      'src/bar/index.ts': `export const bar = 'bar'`,
    },
    { flags: ['--dts'], entry: ['src/index.ts', 'src/bar/index.ts'] }
  )
  expect(
    await getFileContent('dist/index.d.ts'),
    'dist/index.d.ts'
  ).toMatchSnapshot()
  expect(
    await getFileContent('dist/bar/index.d.ts'),
    'dist/bar/index.d.ts'
  ).toMatchSnapshot()
})

test('esbuild metafile', async () => {
  const { outFiles } = await run(
    getTestName(),
    { 'input.ts': `export const foo = 1` },
    {
      flags: ['--metafile'],
    }
  )
  expect(outFiles).toEqual(['input.js', 'metafile-cjs.json'])
})

test('multiple entry with the same base name', async () => {
  const { outFiles } = await run(
    getTestName(),
    {
      'src/input.ts': `export const foo = 1`,
      'src/bar/input.ts': `export const bar = 2`,
    },
    {
      entry: ['src/input.ts', 'src/bar/input.ts'],
    }
  )
  expect(outFiles).toEqual(['bar/input.js', 'input.js'])
})

test('windows: backslash in entry', async () => {
  const { outFiles } = await run(
    getTestName(),
    { 'src/input.ts': `export const foo = 1` },
    {
      entry: ['src\\input.ts'],
    }
  )
  expect(outFiles).toEqual(['input.js'])
})

test('emit declaration files only', async () => {
  const { outFiles } = await run(
    getTestName(),
    {
      'input.ts': `export const foo = 1`,
    },
    {
      flags: ['--dts-only'],
    }
  )
  expect(outFiles).toEqual(['input.d.ts'])
})

test('decorator metadata', async () => {
  const { getFileContent } = await run(getTestName(), {
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
  expect(contents).toContain(`__metadata("design:type", Function)`)
})

test('inject style', async () => {
  const { outFiles, output } = await run(
    getTestName(),
    {
      'input.ts': `import './style.css'`,
      'style.css': `.hello { color: red }`,
    },
    {
      flags: ['--inject-style', '--minify'],
    }
  )
  expect(outFiles).toEqual(['input.js'])
  expect(output).toContain('.hello{color:red}')
})

test('inject style in multi formats', async () => {
  const { outFiles, getFileContent } = await run(
    getTestName(),
    {
      'input.ts': `export * from './App.svelte'`,
      'App.svelte': `
      <span>{msg}</span>

      <style>
      span {color: red}
      </style>`,
    },
    {
      flags: ['--inject-style', '--minify', '--format', 'esm,cjs,iife'],
    }
  )
  expect(outFiles).toEqual(['input.global.js', 'input.js', 'input.mjs'])
  for (const file of outFiles) {
    expect(await getFileContent(`dist/${file}`)).toContain('{color:red}')
  }
})

test('shebang', async () => {
  const { outDir } = await run(
    getTestName(),
    {
      'a.ts': `#!/usr/bin/env node\bconsole.log('a')`,
      'b.ts': `console.log('b')`,
    },
    {
      entry: ['a.ts', 'b.ts'],
    }
  )

  if (process.platform === 'win32') {
    return
  }

  expect(() => {
    fs.accessSync(path.join(outDir, 'a.js'), fs.constants.X_OK)
  }).not.toThrow()
  expect(() => {
    fs.accessSync(path.join(outDir, 'b.js'), fs.constants.X_OK)
  }).toThrow()
})

test('es5 target', async () => {
  const { output, outFiles } = await run(
    getTestName(),
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
  expect(output).toMatch(/createClass/)
  expect(outFiles).toEqual(['input.js'])
})

test('es5 minify', async () => {
  const { getFileContent, outFiles } = await run(
    getTestName(),
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
      flags: [
        '--target',
        'es5',
        '--format',
        'iife',
        '--globalName',
        'FooAPI',
        '--minify',
      ],
    }
  )
  expect(outFiles).toEqual(['input.global.js'])
  const iifeBundle = await getFileContent('dist/input.global.js')
  expect(iifeBundle).toMatch(/var FooAPI/)
  expect(iifeBundle).not.toMatch(/createClass/)
})

test('multiple targets', async () => {
  const { output, outFiles } = await run(
    getTestName(),
    {
      'input.ts': `
      export const answer = 42
      `,
    },
    {
      entry: ['input.ts'],
      flags: ['--target', 'es2020,chrome58,firefox57,safari11,edge16'],
    }
  )
  expect(output).toMatchSnapshot()
  expect(outFiles).toEqual(['input.js'])
})

test('dts only: ignore files', async () => {
  const { outFiles } = await run(
    getTestName(),
    {
      'input.ts': `
      import './style.scss'

      export const a = 1
      `,
      'style.scss': `
      @keyframes gallery-loading-spinner {
        0% {}
      }
      `,
    },
    {
      entry: ['input.ts'],
      flags: ['--dts-only'],
    }
  )
  expect(outFiles).toMatchInlineSnapshot(`
    [
      "input.d.ts",
    ]
  `)
})

test('native-node-module plugin should handle *.node(.js) import properly', async () => {
  await run(
    getTestName(),
    {
      'input.tsx': `export * from './hi.node'`,
      'hi.node.js': `export const hi = 'hi'`,
    },
    {
      entry: ['input.tsx'],
    }
  )
})

test('proper sourcemap sources path when swc is enabled', async () => {
  const { getFileContent } = await run(
    getTestName(),
    {
      'input.ts': `export const hi = 'hi'`,
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          emitDecoratorMetadata: true,
        },
      }),
    },
    {
      entry: ['input.ts'],
      flags: ['--sourcemap'],
    }
  )
  const map = await getFileContent('dist/input.js.map')
  expect(map).toContain(`["../input.ts"]`)
})

// Fixing https://github.com/evanw/esbuild/issues/1794
test('use rollup for treeshaking', async () => {
  const { getFileContent } = await run(
    getTestName(),
    {
      'input.ts': `
      export { useRoute } from 'vue-router'
      `,
    },
    {
      entry: ['input.ts'],
      flags: ['--treeshake', '--external', 'vue', '--format', 'esm'],
    }
  )
  expect(await getFileContent('dist/input.mjs')).toContain(
    `function useRoute() {
  return inject(routeLocationKey);
}`
  )
})

test('custom output extension', async () => {
  const { outFiles } = await run(
    getTestName(),
    {
      'input.ts': `export const foo = [1,2,3]`,
      'tsup.config.ts': `export default {
        outExtension({ format }) {
          return {
            js: '.' + format + '.js'
          }
        }
      }`,
    },
    {
      entry: ['input.ts'],
      flags: ['--format', 'esm,cjs'],
    }
  )
  expect(outFiles).toMatchInlineSnapshot(`
    [
      "input.cjs.js",
      "input.esm.js",
    ]
  `)
})

test('custom config file', async () => {
  const { outFiles } = await run(
    getTestName(),
    {
      'input.ts': `export const foo = [1,2,3]`,
      'custom.config.ts': `export default {
        format: ['esm']
      }`,
    },
    {
      entry: ['input.ts'],
      flags: ['--config', 'custom.config.ts'],
    }
  )
  expect(outFiles).toMatchInlineSnapshot(`
    [
      "input.mjs",
    ]
  `)
})

test('use an object as entry from cli flag', async () => {
  const { outFiles } = await run(
    getTestName(),
    {
      'input.ts': `export const foo = [1,2,3]`,
    },
    {
      flags: ['--entry.foo', 'input.ts'],
    }
  )
  expect(outFiles).toMatchInlineSnapshot(`
    [
      "foo.js",
    ]
  `)
})

test('remove unused code', async () => {
  const { getFileContent } = await run(
    getTestName(),
    {
      'input.ts': `if (import.meta.foo) {
        console.log(1)
      } else {
        console.log(2)
      }`,
      'tsup.config.ts': `export default {
        define: {
          'import.meta.foo': false
        },
        treeshake: true
      }`,
    },
    {}
  )
  expect(await getFileContent('dist/input.js')).not.toContain('console.log(1)')
})

test('treeshake should work with hashbang', async () => {
  const { getFileContent } = await run(
    getTestName(),
    {
      'input.ts': '#!/usr/bin/node\nconsole.log(123)',
    },
    {
      flags: ['--treeshake'],
    }
  )
  expect(await getFileContent('dist/input.js')).toMatchInlineSnapshot(`
    "#!/usr/bin/node
    'use strict';

    // input.ts
    console.log(123);
    "
  `)
})
