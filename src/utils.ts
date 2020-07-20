import JoyCon from 'joycon'

const joycon = new JoyCon()

// No backslash in path
function slash(input: string) {
  return input.replace(/\\/g, '/')
}

export type External =
  | string
  | RegExp
  | ((id: string, parentId?: string) => boolean)

export function isExternal(
  externals: External | External[],
  id: string,
  parentId?: string
) {
  id = slash(id)

  if (!Array.isArray(externals)) {
    externals = [externals]
  }

  for (const external of externals) {
    if (
      typeof external === 'string' &&
      (id === external || id.includes(`/node_modules/${external}/`))
    ) {
      return true
    }
    if (external instanceof RegExp) {
      if (external.test(id)) {
        return true
      }
    }
    if (typeof external === 'function') {
      if (external(id, parentId)) {
        return true
      }
    }
  }

  return false
}

export function resolveTsConfig(cwd: string) {
  return joycon.resolveSync(['tsconfig.build.json', 'tsconfig.json'], cwd)
}

export async function getDeps(cwd: string) {
  const { data } = await joycon.load(['package.json'], cwd)

  const deps = Object.keys(data?.dependencies || {})

  return deps
}
