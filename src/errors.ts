import colors from 'colorette'

export function handlError(error: any) {
  if (error.loc) {
    console.error(
      colors.bold(
        colors.red(
          `Error parsing: ${error.loc.file}:${error.loc.line}:${error.loc.column}`
        )
      )
    )
  }
  if (error.frame) {
    console.error(colors.red(error.message))
    console.error(colors.dim(error.frame))
  } else {
    console.error(colors.red(error.stack))
  }
  process.exitCode = 1
}
