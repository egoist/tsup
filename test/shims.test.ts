import { test } from 'vitest'
import type { Options } from '../src/index.js'
import { getTestName, run } from './utils.js'

test('removeNodeProtocol works on shims', async ({ expect, task }) => {
  const { getFileContent, outFiles } = await run(
    getTestName(),
    {
      'src/index.ts': 'export const foo = __dirname',
      'tsup.config.ts': `export default ${JSON.stringify(
        {
          name: task.name,
          entry: { index: 'src/index.ts' },
          format: ['esm'],
          shims: true,
          removeNodeProtocol: true,
        } satisfies Options,
        null,
        2,
      )}`,
      'package.json': JSON.stringify(
        {
          name: 'remove-node-protocol-works-on-shims',
          description: task.name,
          type: 'commonjs',
          sideEffects: false,
        },
        null,
        2,
      ),
      'tsconfig.json': JSON.stringify(
        {
          compilerOptions: {
            outDir: './dist',
            rootDir: './src',
            skipLibCheck: true,
            strict: true,
          },
          include: ['src'],
        },
        null,
        2,
      ),
    },
    {
      entry: [],
    },
  )

  expect(outFiles).toStrictEqual(['index.mjs'])

  const indexMjsContent = `// ../../../assets/esm_shims.js
import path from "path";
import { fileURLToPath } from "url";
var getFilename = () => fileURLToPath(import.meta.url);
var getDirname = () => path.dirname(getFilename());
var __dirname = /* @__PURE__ */ getDirname();

// src/index.ts
var foo = __dirname;
export {
  foo
};
`

  expect(await getFileContent('dist/index.mjs')).toStrictEqual(indexMjsContent)
})

test('disabling removeNodeProtocol retains node protocol in shims', async ({
  expect,
  task,
}) => {
  const { getFileContent, outFiles } = await run(
    getTestName(),
    {
      'src/index.ts': `export const foo = __dirname`,
      'tsup.config.ts': `export default ${JSON.stringify(
        {
          name: task.name,
          entry: { index: 'src/index.ts' },
          format: ['esm'],
          shims: true,
          removeNodeProtocol: false,
        } satisfies Options,
        null,
        2,
      )}`,
      'package.json': JSON.stringify(
        {
          name: 'disabling-remove-node-protocol-retains-node-protocol-in-shims',
          description: task.name,
          type: 'commonjs',
          sideEffects: false,
        },
        null,
        2,
      ),
      'tsconfig.json': JSON.stringify(
        {
          compilerOptions: {
            outDir: './dist',
            rootDir: './src',
            skipLibCheck: true,
            strict: true,
          },
          include: ['src'],
        },
        null,
        2,
      ),
    },
    {
      entry: [],
    },
  )

  expect(outFiles).toStrictEqual(['index.mjs'])

  const indexMjsContent = `// ../../../assets/esm_shims.js
import path from "node:path";
import { fileURLToPath } from "node:url";
var getFilename = () => fileURLToPath(import.meta.url);
var getDirname = () => path.dirname(getFilename());
var __dirname = /* @__PURE__ */ getDirname();

// src/index.ts
var foo = __dirname;
export {
  foo
};
`

  expect(await getFileContent('dist/index.mjs')).toStrictEqual(indexMjsContent)
})
