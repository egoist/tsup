import path from 'path'
import Module from 'module'

// https://github.com/floatdrop/require-from-string/blob/master/index.js
export function requireFromString(
  code: string,
  filename: string,
  opts?: { appendPaths?: string[]; prependPaths?: string[] }
) {
  opts = opts || {}

  const appendPaths = opts.appendPaths || []
  const prependPaths = opts.prependPaths || []

  if (typeof code !== 'string') {
    throw new Error('code must be a string, not ' + typeof code)
  }

  // @ts-ignore
  const paths = Module._nodeModulePaths(path.dirname(filename))

  const parent = module.parent || undefined
  const m = new Module(filename, parent)
  m.filename = filename
  m.paths = [...prependPaths, ...paths, ...appendPaths]
  // @ts-ignore
  m._compile(code, filename)

  const exports = m.exports
  parent &&
    parent.children &&
    parent.children.splice(parent.children.indexOf(m), 1)

  return exports
}
