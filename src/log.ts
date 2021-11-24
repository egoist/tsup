import * as colors from 'colorette'

export const makeLabel = (
  name: string | undefined,
  input: string,
  type: 'info' | 'success' | 'error'
) => {
  return [
    name && `${colors.dim('[')}${name.toUpperCase()}${colors.dim(']')}`,
    colors[type === 'info' ? 'blue' : type === 'error' ? 'red' : 'green'](
      input.toUpperCase()
    ),
  ]
    .filter(Boolean)
    .join(colors.dim(' '))
}

let silent = false

export function setSilent(isSilent?: boolean) {
  silent = !!isSilent
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

    log(label: string, type: 'info' | 'success' | 'error', ...data: unknown[]) {
      switch (type) {
        case 'error': {
          return console.error(makeLabel(name, label, type), ...data)
        }
        default:
          if (silent) return

          console.log(makeLabel(name, label, type), ...data)
      }
    },
  }
}
