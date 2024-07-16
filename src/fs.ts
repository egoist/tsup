import path from 'path'
import fs from 'fs'

export const outputFile = async (
  filepath: string,
  data: any,
  options?: { mode?: fs.Mode },
) => {
  await fs.promises.mkdir(path.dirname(filepath), { recursive: true })
  await fs.promises.writeFile(filepath, data, options)
}

export function copyDirSync(srcDir: string, destDir: string): void {
  if (!fs.existsSync(srcDir)) return

  fs.mkdirSync(destDir, { recursive: true })
  for (const file of fs.readdirSync(srcDir)) {
    const srcFile = path.resolve(srcDir, file)
    if (srcFile === destDir) {
      continue
    }
    const destFile = path.resolve(destDir, file)
    const stat = fs.statSync(srcFile)
    if (stat.isDirectory()) {
      copyDirSync(srcFile, destFile)
    } else {
      fs.copyFileSync(srcFile, destFile)
    }
  }
}
