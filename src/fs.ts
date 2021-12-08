import path from 'path'
import fs from 'fs'

export const outputFile = async (filepath: string, data: any) => {
  await fs.promises.mkdir(path.dirname(filepath), { recursive: true })
  await fs.promises.writeFile(filepath, data)
}
