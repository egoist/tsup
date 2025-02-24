import { expect, test } from 'vitest'
import { getTestName, run } from './utils'

test('import css', async () => {
  const { output, outFiles, getFileContent } = await run(getTestName(), {
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
  expect(await getFileContent("dist/input.css")).not.toContain("$color")
  expect(outFiles).toEqual(['input.css', 'input.js'])
})

test('support alternative postcss file extension', async () => {
  const { output, outFiles, getFileContent } = await run(getTestName(), {
    'input.ts': `
    import './foo.postcss'
    `,
    'postcss.config.js': `
    module.exports = {
      plugins: [require('postcss-simple-vars')()]
    }
    `,
    'foo.postcss': `
  $color: blue;

  .foo {
    color: $color;
  }
    `,
    'tsup.config.ts': `
      export default {
        loader: {
          '.postcss': 'css'
        },
        postcssFileExtensions: ['postcss']
      }
      `,
  })
  

  expect(output, `""`).toMatchSnapshot()
  expect(await getFileContent("dist/input.css")).not.toContain("$color")
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
