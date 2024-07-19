import util from 'node:util'
import { isMainThread, parentPort } from 'node:worker_threads'
import * as colors from 'picocolors'

type LOG_TYPE = 'info' | 'success' | 'error' | 'warn'

export const colorize = (type: LOG_TYPE, data: any, onlyImportant = false) => {
  if (onlyImportant && (type === 'info' || type === 'success')) return data

  const color =
    type === 'info'
      ? 'blue'
      : type === 'error'
        ? 'red'
        : type === 'warn'
          ? 'yellow'
          : 'green'
  return colors[color](data)
}

export const makeLabel = (
  name: string | undefined,
  input: string,
  type: LOG_TYPE,
) => {
  return [
    name && `${colors.dim('[')}${name.toUpperCase()}${colors.dim(']')}`,
    colorize(type, input.toUpperCase()),
  ]
    .filter(Boolean)
    .join(' ')
}

let silent = false

export function setSilent(isSilent?: boolean) {
  silent = !!isSilent
}

export function getSilent() {
  return silent
}

export type Logger = ReturnType<typeof createLogger>

export const createLogger = (name?: string) => {
  return {
    setName(_name: string) {
      name = _name
    },

    success(label: string, ...args: any[]) {
      return this.log(label, 'success', ...args)
    },

    info(label: string, ...args: any[]) {
      return this.log(label, 'info', ...args)
    },

    error(label: string, ...args: any[]) {
      return this.log(label, 'error', ...args)
    },

    warn(label: string, ...args: any[]) {
      return this.log(label, 'warn', ...args)
    },

    log(
      label: string,
      type: 'info' | 'success' | 'error' | 'warn',
      ...data: unknown[]
    ) {
      const args = [
        makeLabel(name, label, type),
        ...data.map((item) => colorize(type, item, true)),
      ]
      switch (type) {
        case 'error': {
          if (!isMainThread) {
            parentPort?.postMessage({
              type: 'error',
              text: util.format(...args),
            })
            return
          }

          return console.error(...args)
        }
        default:
          if (silent) return

          if (!isMainThread) {
            parentPort?.postMessage({
              type: 'log',
              text: util.format(...args),
            })
            return
          }

          console.log(...args)
      }
    },
  }
}
