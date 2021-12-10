import { Plugin } from '../plugin'
import { reportSize } from '../lib/report-size'

export const sizeReporter = (): Plugin => {
  return {
    name: 'size-reporter',

    buildEnd({ metafile }) {
      if (!metafile) return
      reportSize(
        this.logger,
        this.format,
        Object.keys(metafile.outputs).reduce((res, name) => {
          return {
            ...res,
            [name]: metafile!.outputs[name].bytes,
          }
        }, {})
      )
    },
  }
}
