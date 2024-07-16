import path from 'path'
import { copyDirSync } from '../fs'
import { slash } from '../utils'

export const copyPublicDir = (
  publicDir: string | boolean | undefined,
  outDir: string,
) => {
  if (!publicDir) return
  copyDirSync(path.resolve(publicDir === true ? 'public' : publicDir), outDir)
}

export const isInPublicDir = (
  publicDir: string | boolean | undefined,
  filePath: string,
) => {
  if (!publicDir) return false
  const publicPath = slash(
    path.resolve(publicDir === true ? 'public' : publicDir),
  )
  return slash(path.resolve(filePath)).startsWith(`${publicPath}/`)
}
