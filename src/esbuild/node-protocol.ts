import { Plugin } from 'esbuild'

/**
 * The node: protocol was added to require in Node v14.18.0
 * https://nodejs.org/api/esm.html#node-imports
 */
export const nodeProtocolPlugin = (): Plugin => {
  const nodeProtocol = 'node:'

  return {
    name: 'node-protocol-plugin',
    setup({ onResolve }) {
      onResolve(
        {
          filter: /^node:/,
        },
        ({ path }) => ({
          path: path.slice(nodeProtocol.length),
          external: true,
        })
      )
    },
  }
}
