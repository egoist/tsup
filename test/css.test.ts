import { expect, test } from 'vitest'
import { getTestName, run } from './utils'

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

test('support tailwindcss postcss plugin', async () => {
  const { output, outFiles } = await run(getTestName(), {
    'input.ts': `
      import './foo.css'
    `,
    'postcss.config.js': `
      module.exports = {
        plugins: {
          tailwindcss: {},
          autoprefixer: {},
        }
      }
    `,
    'foo.css': `
      @tailwind base;
      @tailwind components;
      @tailwind utilities;
    `,
  })
  expect(output).toMatchSnapshot()
  expect(outFiles).toEqual(['input.css', 'input.js'])
})

test('CSS Modules via esbuild local-css loader', async () => {
  const { output, outFiles } = await run(getTestName(), {
    'input.ts': `
      import styles from './foo.module.css'
      export default styles.foo
    `,
    'foo.module.css': `
      .foo {
        color: blue;
      }
    `,
    'tsup.config.ts': `
      import { defineConfig } from 'tsup'
      export default defineConfig({
        esbuildOptions: (options) => {
          options.loader = { ...options.loader, '.module.css': 'local-css' }
        },
      })
    `,
  })

  // With the local-css loader active, the default import resolves to a scoped
  // class-name map — `styles.foo` should be a non-empty string, not undefined.
  expect(output).toMatch(/foo/)
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
    { flags: ['--dts'] },
  )

  expect(output).toMatchSnapshot()
  expect(outFiles).toEqual(['input.css', 'input.d.ts', 'input.js'])
})
