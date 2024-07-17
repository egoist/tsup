import { reportSize } from '../lib/report-size'
import type { Plugin } from '../plugin'

export const sizeReporter = (): Plugin => {
  return {
    name: 'size-reporter',

    buildEnd({ writtenFiles }) {
      reportSize(
        this.logger,
        this.format,
        writtenFiles.reduce((res, file) => {
          return {
            ...res,
            [file.name]: file.size,
          }
        }, {}),
      )
    },
  }
}
