import {spawn} from 'child_process'

export function runCode(filename: string, {
  args
}: {args: string[]}) {
  console.log(filename, args)
  const cmd = spawn('node', [filename, ...args], {
    stdio: 'inherit'
  })
  cmd.on('exit', code => {
    process.exitCode = code || 0
  })
}