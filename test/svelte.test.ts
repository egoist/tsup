import { expect, test } from 'vitest'
import { getTestName, run } from './utils'

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
    },
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

test('svelte: sass support', async () => {
  const { outFiles, output, getFileContent } = await run(getTestName(), {
    'input.ts': `import App from './App.svelte'
      export { App }
      `,
    'App.svelte': `
      <div class="test">Hello</div>
      <style lang="scss">
      .test { &:hover { color: red } }
      </style>
      `,
  })

  expect(outFiles).toEqual(['input.css', 'input.js'])
  const outputCss = await getFileContent('dist/input.css')
  expect(outputCss).toMatch(/\.svelte-\w+:hover/)
})
