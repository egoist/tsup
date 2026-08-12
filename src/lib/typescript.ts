import path from 'node:path'
import { createRequire } from 'node:module'
import type * as TypeScript from 'typescript'

type Require = (id: string) => unknown

export function loadTypeScript(
  requireModule: Require = createRequire(
    path.resolve(process.cwd(), 'package.json'),
  ),
): typeof TypeScript {
  let typescript: any

  try {
    typescript = requireModule('typescript')
  } catch {
    // The project does not have TypeScript installed.
  }

  if (typeof typescript?.createProgram === 'function') {
    return typescript
  }

  try {
    return requireModule('@typescript/typescript6') as typeof TypeScript
  } catch {
    if (typescript) {
      throw new Error(
        `tsup requires the TypeScript compiler API to emit declarations. The installed typescript@${typescript.version} does not provide it, and the \`@typescript/typescript6\` fallback is not installed.\n` +
          'TypeScript 7 users must additionally install the compatibility package:\n' +
          '  npm install -D @typescript/typescript6',
      )
    }

    throw new Error(
      'tsup requires TypeScript to emit declarations. Install typescript 4.5 - 6.x, or typescript 7 together with `@typescript/typescript6`.',
    )
  }
}
