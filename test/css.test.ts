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
