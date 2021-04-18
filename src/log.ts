import colors from 'chalk'

export const makeLabel = (input: string, type: 'info' | 'success' | 'error') =>
  colors[type === 'info' ? 'bgBlue' : type === 'error' ? 'bgRed' : 'bgGreen'](
    colors.black(` ${input.toUpperCase()} `)
  )

let silent = false
export function setSilent(isSilent?: boolean) {
  silent = !!isSilent
}

export function log(
  label: string,
  type: 'info' | 'success' | 'error',
  ...data: unknown[]
) {
  switch (type) {
    case 'error': {
      return console.error(makeLabel(label, type), ...data)
    }
    default:
      if (silent) return

      console.log(makeLabel(label, type), ...data)
  }
}
