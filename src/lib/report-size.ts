import * as colors from 'colorette'
import { Logger } from '../log'

const prettyBytes = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const unit = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
  const exp = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, exp)).toFixed(2)} ${unit[exp]}`
}

const getLengthOfLongestString = (strings: string[]) => {
  return strings.reduce((max, str) => {
    return Math.max(max, str.length)
  }, 0)
}

const padRight = (str: string, maxLength: number) => {
  return str + ' '.repeat(maxLength - str.length)
}

export const reportSize = (
  logger: Logger,
  format: string,
  files: { [name: string]: number },
) => {
  const filenames = Object.keys(files)
  const maxLength = getLengthOfLongestString(filenames) + 1
  for (const name of filenames) {
    logger.success(
      format,
      `${colors.bold(padRight(name, maxLength))}${colors.green(
        prettyBytes(files[name]),
      )}`,
    )
  }
}
