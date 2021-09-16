import { resolve } from 'path'
import execa from 'execa'
import fs from 'fs-extra'
import glob from 'globby'
import waitForExpect from 'wait-for-expect'
import { debouncePromise } from '../src/utils'

jest.setTimeout(60000)

const cacheDir = resolve(__dirname, '.cache')
const bin = resolve(__dirname, '../dist/cli-default.js')

beforeAll(async () => {
  await fs.remove(cacheDir)
  console.log(`Installing dependencies in ./test folder`)
  await execa('npm', ['i'], { cwd: __dirname })
  console.log(`Done... start testing..`)
})

async function run(
  testDir: string,
  files: { [name: string]: string },
  options: {
    flags?: string[]
    env?: Record<string, string>
  } = {}
) {
  testDir = resolve(cacheDir, testDir)

  // Write entry files on disk
  await Promise.all(
    Object.keys(files).map((name) => {
      return fs.outputFile(resolve(testDir, name), files[name], 'utf8')
    })
  )

  // Run tsup cli
  const { exitCode, stdout, stderr } = await execa(
    bin,
    ['input.ts', ...(options.flags || [])],
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
  const output = await fs.readFile(resolve(testDir, 'dist/input.js'), 'utf8')
  const outFiles = await glob('**/*', {
    cwd: resolve(testDir, 'dist'),
  }).then((res) => res.sort())

  return {
    output,
    outFiles,
    logs,
    getFileContent(filename: string) {
      return fs.readFile(resolve(testDir, filename), 'utf8')
    },
  }
}

// https://stackoverflow.com/questions/52788380/get-the-current-test-spec-name-in-jest
const getTestName = () => expect.getState().currentTestName

test('simple', async () => {
  const { output, outFiles } = await run(getTestName(), {
    'input.ts': `import foo from './foo';export default foo`,
    'foo.ts': `export default 'foo'`,
  })
  expect(output).toMatchInlineSnapshot(`
    "var __defProp = Object.defineProperty;
    var __markAsModule = (target) => __defProp(target, \\"__esModule\\", { value: true });
    var __require = typeof require !== \\"undefined\\" ? require : (x) => {
      throw new Error('Dynamic require of \\"' + x + '\\" is not supported');
    };
    var __export = (target, all) => {
      __markAsModule(target);
      for (var name in all)
        __defProp(target, name, { get: all[name], enumerable: true });
    };

    // input.ts
    __export(exports, {
      default: () => input_default
    });

    // ../../../assets/cjs_shims.js
    var importMetaUrlShim = typeof document === \\"undefined\\" ? new (require(\\"url\\")).URL(\\"file:\\" + __filename).href : document.currentScript && document.currentScript.src || new URL(\\"main.js\\", document.baseURI).href;

    // foo.ts
    var foo_default = \\"foo\\";

    // input.ts
    var input_default = foo_default;
    // Annotate the CommonJS export names for ESM import in node:
    0 && (module.exports = {});
    "
  `)
  expect(outFiles).toMatchInlineSnapshot(`
    Array [
      "input.js",
    ]
  `)
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
  const content = await getFileContent('dist/input.d.ts')
  expect(content).toMatchInlineSnapshot(`
    "declare type PathParams = Record<string, string | string[]>;
    /**
     * A param in a url like \`/users/:id\`
     */
    interface PathParserParamKey {
        name: string;
        repeatable: boolean;
        optional: boolean;
    }
    interface PathParser {
        /**
         * The regexp used to match a url
         */
        re: RegExp;
        /**
         * The score of the parser
         */
        score: Array<number[]>;
        /**
         * Keys that appeared in the path
         */
        keys: PathParserParamKey[];
        /**
         * Parses a url and returns the matched params or nul if it doesn't match. An
         * optional param that isn't preset will be an empty string. A repeatable
         * param will be an array if there is at least one value.
         *
         * @param path - url to parse
         * @returns a Params object, empty if there are no params. \`null\` if there is
         * no match
         */
        parse(path: string): PathParams | null;
        /**
         * Creates a string version of the url
         *
         * @param params - object of params
         * @returns a url
         */
        stringify(params: PathParams): string;
    }

    declare type Opts = {
        parser: PathParser;
        route: string;
    };

    export { Opts };
    "
  `)
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
  expect(content).toMatchInlineSnapshot(`
    "export * from 'vue';

    type MarkRequired<T, RK extends keyof T> = Exclude<T, RK> & Required<Pick<T, RK>>

    export { MarkRequired };
    "
  `)
})

test('bundle graphql-tools with --sourcemap flag', async () => {
  await run(
    getTestName(),
    {
      'input.ts': `export { makeExecutableSchema } from 'graphql-tools'`,
    },
    {
      flags: ['--sourcemap'],
    }
  )
})

test('bundle graphql-tools with --sourcemap inline flag', async () => {
  const { output } = await run(
    getTestName(),
    {
      'input.ts': `export { makeExecutableSchema } from 'graphql-tools'`,
    },
    {
      flags: ['--sourcemap', 'inline'],
    }
  )

  expect(output).toContain('//# sourceMappingURL=')
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
  expect(output).toMatchInlineSnapshot(`
    "var __defProp = Object.defineProperty;
    var __markAsModule = function (target) { return __defProp(target, \\"__esModule\\", { value: true }); };
    var __require = typeof require !== \\"undefined\\" ? require : function (x) {
      throw new Error('Dynamic require of \\"' + x + '\\" is not supported');
    };
    var __export = function (target, all) {
      __markAsModule(target);
      for (var name in all)
        { __defProp(target, name, { get: all[name], enumerable: true }); }
    };

    // input.ts
    __export(exports, {
      Foo: function () { return Foo; }
    });

    // ../../../assets/cjs_shims.js
    var importMetaUrlShim = typeof document === \\"undefined\\" ? new (require(\\"url\\")).URL(\\"file:\\" + __filename).href : document.currentScript && document.currentScript.src || new URL(\\"main.js\\", document.baseURI).href;

    // input.ts
    var Foo = /*@__PURE__*/(function () {
      function Foo () {}

      Foo.prototype.hi = function hi () {
        var a = function () { return \\"foo\\"; };
        console.log(a());
      };

      return Foo;
    }());
    // Annotate the CommonJS export names for ESM import in node:
    0 && (module.exports = {
      Foo: Foo
    });
    "
  `)
  expect(outFiles).toMatchInlineSnapshot(`
    Array [
      "input.js",
    ]
  `)
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

  expect(output).toMatchInlineSnapshot(`
    "var __defProp = Object.defineProperty;
    var __markAsModule = (target) => __defProp(target, \\"__esModule\\", { value: true });
    var __require = typeof require !== \\"undefined\\" ? require : (x) => {
      throw new Error('Dynamic require of \\"' + x + '\\" is not supported');
    };
    var __export = (target, all) => {
      __markAsModule(target);
      for (var name in all)
        __defProp(target, name, { get: all[name], enumerable: true });
    };

    // input.ts
    __export(exports, {
      a: () => a
    });

    // ../../../assets/cjs_shims.js
    var importMetaUrlShim = typeof document === \\"undefined\\" ? new (require(\\"url\\")).URL(\\"file:\\" + __filename).href : document.currentScript && document.currentScript.src || new URL(\\"main.js\\", document.baseURI).href;

    // input.ts
    var a = 1;
    // Annotate the CommonJS export names for ESM import in node:
    0 && (module.exports = {
      a
    });
    "
  `)
  expect(outFiles).toMatchInlineSnapshot(`
    Array [
      "input.global.js",
      "input.js",
      "input.mjs",
    ]
  `)
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

  expect(output).toMatchInlineSnapshot(`
    "// input.ts
    var a = 1;
    export {
      a
    };
    "
  `)
  expect(outFiles).toMatchInlineSnapshot(`
    Array [
      "input.cjs",
      "input.global.js",
      "input.js",
    ]
  `)
})

test('multiple formats with legacy output', async () => {
  const { output, outFiles } = await run(
    getTestName(),
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

  expect(output).toMatchInlineSnapshot(`
    "var __defProp = Object.defineProperty;
    var __markAsModule = (target) => __defProp(target, \\"__esModule\\", { value: true });
    var __require = typeof require !== \\"undefined\\" ? require : (x) => {
      throw new Error('Dynamic require of \\"' + x + '\\" is not supported');
    };
    var __export = (target, all) => {
      __markAsModule(target);
      for (var name in all)
        __defProp(target, name, { get: all[name], enumerable: true });
    };

    // input.ts
    __export(exports, {
      a: () => a
    });

    // ../../../assets/cjs_shims.js
    var importMetaUrlShim = typeof document === \\"undefined\\" ? new (require(\\"url\\")).URL(\\"file:\\" + __filename).href : document.currentScript && document.currentScript.src || new URL(\\"main.js\\", document.baseURI).href;

    // input.ts
    var a = 1;
    // Annotate the CommonJS export names for ESM import in node:
    0 && (module.exports = {
      a
    });
    "
  `)
  expect(outFiles).toMatchInlineSnapshot(`
    Array [
      "esm/input.js",
      "iife/input.js",
      "input.js",
    ]
  `)
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

  expect(output).toMatchInlineSnapshot(`
    "var t=Object.defineProperty;var o=e=>t(e,\\"__esModule\\",{value:!0});var f=typeof require!=\\"undefined\\"?require:e=>{throw new Error('Dynamic require of \\"'+e+'\\" is not supported')};var c=(e,r)=>{o(e);for(var n in r)t(e,n,{get:r[n],enumerable:!0})};c(exports,{foo:()=>i});var u=typeof document==\\"undefined\\"?new(require(\\"url\\")).URL(\\"file:\\"+__filename).href:document.currentScript&&document.currentScript.src||new URL(\\"main.js\\",document.baseURI).href;function i(){return\\"foo\\"}0&&(module.exports={foo});
    "
  `)
  expect(outFiles).toMatchInlineSnapshot(`
    Array [
      "input.js",
    ]
  `)
})

test('--env flag', async () => {
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

  expect(output).toMatchInlineSnapshot(`
    "var __defProp = Object.defineProperty;
    var __markAsModule = (target) => __defProp(target, \\"__esModule\\", { value: true });
    var __require = typeof require !== \\"undefined\\" ? require : (x) => {
      throw new Error('Dynamic require of \\"' + x + '\\" is not supported');
    };
    var __export = (target, all) => {
      __markAsModule(target);
      for (var name in all)
        __defProp(target, name, { get: all[name], enumerable: true });
    };

    // input.ts
    __export(exports, {
      env: () => env
    });

    // ../../../assets/cjs_shims.js
    var importMetaUrlShim = typeof document === \\"undefined\\" ? new (require(\\"url\\")).URL(\\"file:\\" + __filename).href : document.currentScript && document.currentScript.src || new URL(\\"main.js\\", document.baseURI).href;

    // input.ts
    var env = \\"production\\";
    // Annotate the CommonJS export names for ESM import in node:
    0 && (module.exports = {
      env
    });
    "
  `)
  expect(outFiles).toMatchInlineSnapshot(`
    Array [
      "input.js",
    ]
  `)
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

  expect(output).toMatchInlineSnapshot(`
    "// ../../../assets/cjs_shims.js
    var importMetaUrlShim = typeof document === \\"undefined\\" ? new (require(\\"url\\")).URL(\\"file:\\" + __filename).href : document.currentScript && document.currentScript.src || new URL(\\"main.js\\", document.baseURI).href;
    "
  `)
  expect(outFiles).toMatchInlineSnapshot(`
    Array [
      "input.css",
      "input.js",
    ]
  `)
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

  expect(output).toMatchInlineSnapshot(`
    "// ../../../assets/cjs_shims.js
    var importMetaUrlShim = typeof document === \\"undefined\\" ? new (require(\\"url\\")).URL(\\"file:\\" + __filename).href : document.currentScript && document.currentScript.src || new URL(\\"main.js\\", document.baseURI).href;
    "
  `)
  expect(outFiles).toMatchInlineSnapshot(`
    Array [
      "input.css",
      "input.d.ts",
      "input.js",
    ]
  `)
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
  expect(output).toMatchInlineSnapshot(`
    "var __create = Object.create;
    var __defProp = Object.defineProperty;
    var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames = Object.getOwnPropertyNames;
    var __getProtoOf = Object.getPrototypeOf;
    var __hasOwnProp = Object.prototype.hasOwnProperty;
    var __markAsModule = (target) => __defProp(target, \\"__esModule\\", { value: true });
    var __require = typeof require !== \\"undefined\\" ? require : (x) => {
      throw new Error('Dynamic require of \\"' + x + '\\" is not supported');
    };
    var __export = (target, all) => {
      __markAsModule(target);
      for (var name in all)
        __defProp(target, name, { get: all[name], enumerable: true });
    };
    var __reExport = (target, module2, desc) => {
      if (module2 && typeof module2 === \\"object\\" || typeof module2 === \\"function\\") {
        for (let key of __getOwnPropNames(module2))
          if (!__hasOwnProp.call(target, key) && key !== \\"default\\")
            __defProp(target, key, { get: () => module2[key], enumerable: !(desc = __getOwnPropDesc(module2, key)) || desc.enumerable });
      }
      return target;
    };
    var __toModule = (module2) => {
      return __reExport(__markAsModule(__defProp(module2 != null ? __create(__getProtoOf(module2)) : {}, \\"default\\", module2 && module2.__esModule && \\"default\\" in module2 ? { get: () => module2.default, enumerable: true } : { value: module2, enumerable: true })), module2);
    };

    // input.ts
    __export(exports, {
      bar: () => import_bar.bar,
      baz: () => baz,
      foo: () => import_foo.foo
    });

    // ../../../assets/cjs_shims.js
    var importMetaUrlShim = typeof document === \\"undefined\\" ? new (require(\\"url\\")).URL(\\"file:\\" + __filename).href : document.currentScript && document.currentScript.src || new URL(\\"main.js\\", document.baseURI).href;

    // input.ts
    var import_foo = __toModule(require(\\"foo\\"));
    var import_bar = __toModule(require(\\"bar\\"));

    // node_modules/baz/index.ts
    var baz = \\"baz\\";
    // Annotate the CommonJS export names for ESM import in node:
    0 && (module.exports = {
      bar,
      baz,
      foo
    });
    "
  `)
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
  expect(output).toMatchInlineSnapshot(`
    "// ../../../assets/cjs_shims.js
    var importMetaUrlShim = typeof document === \\"undefined\\" ? new (require(\\"url\\")).URL(\\"file:\\" + __filename).href : document.currentScript && document.currentScript.src || new URL(\\"main.js\\", document.baseURI).href;

    // input.ts
    module.exports = 123;
    "
  `)
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
  expect(output).toMatchInlineSnapshot(`
    "var __create = Object.create;
    var __defProp = Object.defineProperty;
    var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames = Object.getOwnPropertyNames;
    var __getProtoOf = Object.getPrototypeOf;
    var __hasOwnProp = Object.prototype.hasOwnProperty;
    var __markAsModule = (target) => __defProp(target, \\"__esModule\\", { value: true });
    var __require = typeof require !== \\"undefined\\" ? require : (x) => {
      throw new Error('Dynamic require of \\"' + x + '\\" is not supported');
    };
    var __export = (target, all) => {
      __markAsModule(target);
      for (var name in all)
        __defProp(target, name, { get: all[name], enumerable: true });
    };
    var __reExport = (target, module2, desc) => {
      if (module2 && typeof module2 === \\"object\\" || typeof module2 === \\"function\\") {
        for (let key of __getOwnPropNames(module2))
          if (!__hasOwnProp.call(target, key) && key !== \\"default\\")
            __defProp(target, key, { get: () => module2[key], enumerable: !(desc = __getOwnPropDesc(module2, key)) || desc.enumerable });
      }
      return target;
    };
    var __toModule = (module2) => {
      return __reExport(__markAsModule(__defProp(module2 != null ? __create(__getProtoOf(module2)) : {}, \\"default\\", module2 && module2.__esModule && \\"default\\" in module2 ? { get: () => module2.default, enumerable: true } : { value: module2, enumerable: true })), module2);
    };

    // input.ts
    __export(exports, {
      App: () => App_default
    });

    // ../../../assets/cjs_shims.js
    var importMetaUrlShim = typeof document === \\"undefined\\" ? new (require(\\"url\\")).URL(\\"file:\\" + __filename).href : document.currentScript && document.currentScript.src || new URL(\\"main.js\\", document.baseURI).href;

    // App.svelte
    var import_internal = __toModule(require(\\"svelte/internal\\"));
    function create_fragment(ctx) {
      let span;
      return {
        c() {
          span = (0, import_internal.element)(\\"span\\");
          span.textContent = \`\${msg}\`;
          (0, import_internal.attr)(span, \\"class\\", \\"svelte-1jo4k3z\\");
        },
        m(target, anchor) {
          (0, import_internal.insert)(target, span, anchor);
        },
        p: import_internal.noop,
        i: import_internal.noop,
        o: import_internal.noop,
        d(detaching) {
          if (detaching)
            (0, import_internal.detach)(span);
        }
      };
    }
    var msg = \\"hello svelte\\";
    var App = class extends import_internal.SvelteComponent {
      constructor(options) {
        super();
        (0, import_internal.init)(this, options, null, create_fragment, import_internal.safe_not_equal, {});
      }
    };
    var App_default = App;
    // Annotate the CommonJS export names for ESM import in node:
    0 && (module.exports = {
      App
    });
    "
  `)

  expect(await getFileContent('dist/input.css')).toMatchInlineSnapshot(`
    "/* svelte-css:App.svelte.css */
    span.svelte-1jo4k3z {
      color: red;
    }
    "
  `)
})

test('onSuccess', async () => {
  const randomNumber = Math.random() + ''
  const { logs } = await run(
    getTestName(),
    {
      'input.ts': "console.log('test');",
    },
    {
      flags: ['--onSuccess', 'echo ' + randomNumber],
    }
  )

  expect(logs.includes(randomNumber)).toBe(true)
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
  expect(await getFileContent('dist/input.js')).toMatchInlineSnapshot(`
    "var __defProp = Object.defineProperty;
    var __markAsModule = (target) => __defProp(target, \\"__esModule\\", { value: true });
    var __require = typeof require !== \\"undefined\\" ? require : (x) => {
      throw new Error('Dynamic require of \\"' + x + '\\" is not supported');
    };
    var __export = (target, all) => {
      __markAsModule(target);
      for (var name in all)
        __defProp(target, name, { get: all[name], enumerable: true });
    };

    // input.ts
    __export(exports, {
      foo: () => foo
    });

    // ../../../assets/cjs_shims.js
    var importMetaUrlShim = typeof document === \\"undefined\\" ? new (require(\\"url\\")).URL(\\"file:\\" + __filename).href : document.currentScript && document.currentScript.src || new URL(\\"main.js\\", document.baseURI).href;

    // foo.ts
    var foo = \\"foo\\";
    // Annotate the CommonJS export names for ESM import in node:
    0 && (module.exports = {
      foo
    });
    "
  `)
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
  expect(await getFileContent('dist/input.d.ts')).toMatchInlineSnapshot(`
    "declare const foo = \\"foo\\";

    export { foo };
    "
  `)
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
  expect(await getFileContent('dist/input.d.ts')).toMatchInlineSnapshot(`
    "declare const foo = \\"foo\\";

    export { foo };
    "
  `)
})

test(`transform import.meta.url in cjs format`, async () => {
  const { getFileContent } = await run(getTestName(), {
    'input.ts': `export default import.meta.url`,
  })
  expect(await getFileContent('dist/input.js')).toMatchInlineSnapshot(`
    "var __defProp = Object.defineProperty;
    var __markAsModule = (target) => __defProp(target, \\"__esModule\\", { value: true });
    var __require = typeof require !== \\"undefined\\" ? require : (x) => {
      throw new Error('Dynamic require of \\"' + x + '\\" is not supported');
    };
    var __export = (target, all) => {
      __markAsModule(target);
      for (var name in all)
        __defProp(target, name, { get: all[name], enumerable: true });
    };

    // input.ts
    __export(exports, {
      default: () => input_default
    });

    // ../../../assets/cjs_shims.js
    var importMetaUrlShim = typeof document === \\"undefined\\" ? new (require(\\"url\\")).URL(\\"file:\\" + __filename).href : document.currentScript && document.currentScript.src || new URL(\\"main.js\\", document.baseURI).href;

    // input.ts
    var input_default = importMetaUrlShim;
    // Annotate the CommonJS export names for ESM import in node:
    0 && (module.exports = {});
    "
  `)
})

test('debounce promise', async (t) => {
  try {
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

    expect(n).toEqual(0)

    debounceFunction()
    debounceFunction()
    debounceFunction()
    debounceFunction()

    await waitForExpect(() => {
      expect(n).toBe(1)
    })
    await sleep(100)

    expect(n).toBe(1)

    debounceFunction()

    await waitForExpect(() => {
      expect(n).toBe(2)
    })
  } catch (err) {
    return t.fail(err)
  }

  t()
})

test('exclude dependencies', async () => {
  const { getFileContent } = await run(getTestName(), {
    'input.ts': `export {foo} from 'foo';export {nested} from 'foo/nested'`,
    'package.json': `{"dependencies":{"foo":"0.0.0"}}`,
    'node_modules/foo/index.js': `export const foo = 'foo'`,
    'node_modules/foo/package.json': `{"name":"foo"}`,
  })
  expect(await getFileContent('dist/input.js')).toMatchInlineSnapshot(`
    "var __create = Object.create;
    var __defProp = Object.defineProperty;
    var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames = Object.getOwnPropertyNames;
    var __getProtoOf = Object.getPrototypeOf;
    var __hasOwnProp = Object.prototype.hasOwnProperty;
    var __markAsModule = (target) => __defProp(target, \\"__esModule\\", { value: true });
    var __require = typeof require !== \\"undefined\\" ? require : (x) => {
      throw new Error('Dynamic require of \\"' + x + '\\" is not supported');
    };
    var __export = (target, all) => {
      __markAsModule(target);
      for (var name in all)
        __defProp(target, name, { get: all[name], enumerable: true });
    };
    var __reExport = (target, module2, desc) => {
      if (module2 && typeof module2 === \\"object\\" || typeof module2 === \\"function\\") {
        for (let key of __getOwnPropNames(module2))
          if (!__hasOwnProp.call(target, key) && key !== \\"default\\")
            __defProp(target, key, { get: () => module2[key], enumerable: !(desc = __getOwnPropDesc(module2, key)) || desc.enumerable });
      }
      return target;
    };
    var __toModule = (module2) => {
      return __reExport(__markAsModule(__defProp(module2 != null ? __create(__getProtoOf(module2)) : {}, \\"default\\", module2 && module2.__esModule && \\"default\\" in module2 ? { get: () => module2.default, enumerable: true } : { value: module2, enumerable: true })), module2);
    };

    // input.ts
    __export(exports, {
      foo: () => import_foo.foo,
      nested: () => import_nested.nested
    });

    // ../../../assets/cjs_shims.js
    var importMetaUrlShim = typeof document === \\"undefined\\" ? new (require(\\"url\\")).URL(\\"file:\\" + __filename).href : document.currentScript && document.currentScript.src || new URL(\\"main.js\\", document.baseURI).href;

    // input.ts
    var import_foo = __toModule(require(\\"foo\\"));
    var import_nested = __toModule(require(\\"foo/nested\\"));
    // Annotate the CommonJS export names for ESM import in node:
    0 && (module.exports = {
      foo,
      nested
    });
    "
  `)
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
  expect(await getFileContent('dist/input.js')).toMatchInlineSnapshot(`
    "\\"use strict\\";Object.defineProperty(exports, \\"__esModule\\", {value: true});


    var _chunkB4ZWWPIUjs = require('./chunk-B4ZWWPIU.js');

    // input.ts
    var foo = () => Promise.resolve().then(() => _chunkB4ZWWPIUjs.__toModule.call(void 0, _chunkB4ZWWPIUjs.__require.call(void 0, \\"./foo-D4Y7X4AA.js\\")));


    exports.foo = foo;
    "
  `)
  expect(await getFileContent('dist/another-input.js')).toMatchInlineSnapshot(`
    "\\"use strict\\";Object.defineProperty(exports, \\"__esModule\\", {value: true});


    var _chunkB4ZWWPIUjs = require('./chunk-B4ZWWPIU.js');

    // another-input.ts
    var foo = () => Promise.resolve().then(() => _chunkB4ZWWPIUjs.__toModule.call(void 0, _chunkB4ZWWPIUjs.__require.call(void 0, \\"./foo-D4Y7X4AA.js\\")));


    exports.foo = foo;
    "
  `)
})
