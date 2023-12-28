import { test, expect } from 'vitest'
import path from 'path'
import fs from 'fs'
import waitForExpect from 'wait-for-expect'
import { debouncePromise } from '../src/utils'
import { getTestName, run } from './utils'

test('simple', async () => {
  const { output, outFiles } = await run(getTestName(), {
    'input.ts': `import foo from './foo';export default foo`,
    'foo.ts': `export default 'foo'`,
  })
  expect(output).toMatchSnapshot()
  expect(outFiles).toEqual(['input.js'])
})

test('should not filter unknown directives during bundle', async () => {
  const { output, outFiles } = await run(getTestName(), {
    'input.ts': `'use client'\nexport default 'foo'`,
  })
  expect(output).toContain('use client')
  expect(outFiles).toEqual(['input.js'])
})

test('multiple formats', async () => {
  const { outFiles } = await run(
    getTestName(),
    {
      'input.ts': `
    export const a = 1
    `,
    },
    {
      flags: ['--format', 'esm,cjs,iife'],
    },
  )

  expect(outFiles).toEqual(['input.global.js', 'input.js', 'input.mjs'])
})

test('multiple formats and pkg.type is module', async () => {
  const { outFiles } = await run(
    getTestName(),
    {
      'input.ts': `
    export const a = 1
    `,
      'package.json': JSON.stringify({ type: 'module' }),
    },
    {
      flags: ['--format', 'esm,cjs,iife'],
    },
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
    },
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
    },
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
    },
  )

  expect(output).toContain('var env = "production"')
  expect(outFiles).toEqual(['input.js'])
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
    export {qux} from 'qux'
    `,
    'node_modules/foo/index.ts': `export const foo = 'foo'`,
    'node_modules/foo/package.json': `{"name":"foo","version":"0.0.0"}`,
    'node_modules/bar/index.ts': `export const bar = 'bar'`,
    'node_modules/bar/package.json': `{"name":"bar","version":"0.0.0"}`,
    'node_modules/baz/index.ts': `export const baz = 'baz'`,
    'node_modules/baz/package.json': `{"name":"baz","version":"0.0.0"}`,
    'node_modules/qux/index.ts': `export const qux = 'qux'`,
    'node_modules/qux/package.json': `{"name":"qux","version":"0.0.0"}`,
    'another/package.json': `{"name":"another-pkg","dependencies":{"qux":"0.0.0"}}`,
    'tsup.config.ts': `
    export default {
      external: [/f/, 'bar', 'another/package.json']
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
  expect(output).toContain(`var foo = "foo"`)
  expect(output).not.toContain(`var bar = "bar"`)
  expect(output).not.toContain(`var baz = "baz"`)
})

test('disable code splitting to get proper module.exports =', async () => {
  const { output } = await run(
    getTestName(),
    {
      'input.ts': `export = 123`,
    },
    {
      flags: ['--no-splitting'],
    },
  )
  expect(output).toMatchSnapshot()
})

test('onSuccess', async () => {
  const { logs } = await run(
    getTestName(),
    {
      'input.ts': "console.log('test');",
    },
    {
      flags: ['--onSuccess', 'echo hello && echo world'],
    },
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

test(`transform import.meta.url in cjs format`, async () => {
  const { getFileContent } = await run(
    getTestName(),
    {
      'input.ts': `export default import.meta.url`,
    },
    {
      flags: ['--shims'],
    },
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
    },
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
      },
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
    { flags: ['another-input.ts', '--splitting'] },
  )
  expect(await getFileContent('dist/input.js')).toMatchSnapshot()
  expect(await getFileContent('dist/another-input.js')).toMatchSnapshot()
})

test('esbuild metafile', async () => {
  const { outFiles } = await run(
    getTestName(),
    { 'input.ts': `export const foo = 1` },
    {
      flags: ['--metafile'],
    },
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
    },
  )
  expect(outFiles).toEqual(['bar/input.js', 'input.js'])
})

test('windows: backslash in entry', async () => {
  const { outFiles } = await run(
    getTestName(),
    { 'src/input.ts': `export const foo = 1` },
    {
      entry: ['src\\input.ts'],
    },
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
    },
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
  expect(contents).toContain(`_ts_metadata("design:type", Function)`)
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
    },
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
    },
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
    },
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
    },
  )
  expect(output).toMatch(/_create_class/)
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
    },
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
    },
  )
  expect(output).toMatchSnapshot()
  expect(outFiles).toEqual(['input.js'])
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
    },
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
    },
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
    },
  )
  expect(await getFileContent('dist/input.mjs')).toContain(
    `function useRoute(_name) {
  return inject(routeLocationKey);
}`,
  )
})

test('use rollup for treeshaking --format cjs', async () => {
  const { getFileContent } = await run(
    getTestName(),
    {
      'package.json': `{
        "dependencies": {
          "react-select": "5.7.0",
          "react": "17.0.2",
          "react-dom": "17.0.2"
        }
      }`,
      'input.tsx': `
      import ReactSelect from 'react-select'
      
      export const Component = (props: {}) => {
        return <ReactSelect {...props} />
      };
      `,
      'tsconfig.json': `{
        "compilerOptions": {
          "baseUrl": ".",
          "esModuleInterop": true,
          "isolatedModules": true,
          "jsx": "react-jsx",
          "lib": ["dom", "dom.iterable", "esnext"],
          "module": "esnext",
          "moduleResolution": "node",
          "noEmit": true,
          "rootDir": ".",
          "skipLibCheck": true,
          "sourceMap": true,
          "strict": true,
          "target": "es6",
          "importHelpers": true,
          "outDir": "dist"
        }
      }`,
    },
    {
      entry: ['input.tsx'],
      flags: ['--treeshake', '--target', 'es2022', '--format', 'cjs'],
    },
  )

  expect(await getFileContent('dist/input.js')).toContain(
    `jsxRuntime.jsx(ReactSelect__default.default`,
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
    },
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
    },
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
    },
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
          'import.meta.foo': 'false'
        },
        treeshake: true
      }`,
    },
    {},
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
    },
  )
  expect(await getFileContent('dist/input.js')).toMatchInlineSnapshot(`
    "#!/usr/bin/node
    'use strict';

    // input.ts
    console.log(123);
    "
  `)
})

test('support target in tsconfig.json', async () => {
  const { getFileContent } = await run(
    getTestName(),
    {
      'input.ts': `await import('./foo')`,
      'foo.ts': `export default 'foo'`,
      'tsconfig.json': `{
        "compilerOptions": {
          "baseUrl":".",
          "target": "esnext"
        }
      }`,
    },
    {
      flags: ['--format', 'esm'],
    },
  )
  expect(await getFileContent('dist/input.mjs')).contains('await import(')
})

test('override target in tsconfig.json', async () => {
  await expect(
    run(
      getTestName(),
      {
        'input.ts': `await import('./foo')`,
        'foo.ts': `export default 'foo'`,
        'tsconfig.json': `{
          "compilerOptions": {
            "baseUrl":".",
            "target": "esnext"
          }
        }`,
      },
      {
        flags: ['--format', 'esm', '--target', 'es2018'],
      },
    ),
  ).rejects.toThrowError(
    `Top-level await is not available in the configured target environment ("es2018")`,
  )
})

test(`should generate export {} when there are no exports in source file`, async () => {
  const { outFiles, getFileContent } = await run(getTestName(), {
    'input.ts': `const a = 'a'`,
    'tsconfig.json': `{
        "compilerOptions": {
          "baseUrl":".",
          "target": "esnext",
        }
      }`,
    'tsup.config.ts': `
        export default {
          entry: ['src/input.ts'],
          format: 'esm',
          dts: true
        }
      `,
  })
  expect(outFiles).toEqual(['input.d.mts', 'input.mjs'])
  expect(await getFileContent('dist/input.d.mts')).toMatch(/export {\s*}/)
})

test('custom inject style function', async () => {
  const { outFiles, getFileContent } = await run(getTestName(), {
    'input.ts': `import './style.css'`,
    'style.css': `.hello { color: red }`,
    'tsup.config.ts': `
        export default {
          entry: ['src/input.ts'],
          minify: true,
          format: ['esm', 'cjs'],
          injectStyle: (css) => {
            return "__custom_inject_style__(" + css +")";
          }
        }`,
  })
  expect(outFiles).toEqual(['input.js', 'input.mjs'])
  expect(await getFileContent('dist/input.mjs')).toContain(
    '__custom_inject_style__(`.hello{color:red}\n`)',
  )
  expect(await getFileContent('dist/input.js')).toContain(
    '__custom_inject_style__(`.hello{color:red}\n`)',
  )
})

test('preserve top-level variable for IIFE format', async () => {
  const { outFiles, getFileContent } = await run(getTestName(), {
    'input.ts': `export default 'foo'`,
    'tsup.config.ts': `
        export default {
          entry: ['src/input.ts'],
          globalName: 'globalFoo',
          minify: 'terser',
          format: ['iife']
        }`,
  })
  expect(outFiles).toEqual(['input.global.js'])
  expect(await getFileContent('dist/input.global.js')).toMatch(/globalFoo\s*=/)
})

test('should load postcss esm config', async () => {
  const { outFiles, getFileContent } = await run(getTestName(), {
    'input.ts': `
    import './foo.css'
    `,
    'package.json': `{
      "type": "module"
    }`,
    'postcss.config.js': `
    export default {
      plugins: {'postcss-simple-vars': {}}
    }
    `,
    'foo.css': `
  $color: blue;

  .foo {
    color: $color;
  }
    `,
  })

  expect(outFiles).toEqual(['input.cjs', 'input.css'])
  expect(await getFileContent('dist/input.css')).toContain('color: blue;')
})

test('generate sourcemap with --treeshake', async () => {
  const { outFiles, getFileContent } = await run(
    getTestName(),
    {
      'src/input.ts': 'export function getValue(val: any){ return val; }',
    },
    {
      entry: ['src/input.ts'],
      flags: ['--treeshake', '--sourcemap', '--format=cjs,esm,iife'],
    },
  )

  expect(outFiles.length).toBe(6)

  await Promise.all(
    outFiles
      .filter((fileName) => fileName.endsWith('.map'))
      .map(async (sourceMapFile) => {
        const sourceMap = await getFileContent(`dist/${sourceMapFile}`).then(
          (rawContent) => JSON.parse(rawContent),
        )

        expect(sourceMap.sources[0]).toBe('../src/input.ts')
        expect(sourceMap.sourcesContent[0]).toBe(
          'export function getValue(val: any){ return val; }',
        )

        const outputFileName = sourceMapFile.replace('.map', '')
        expect(sourceMap.file).toBe(outputFileName)
      }),
  )
})
