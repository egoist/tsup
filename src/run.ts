import {spawn} from 'child_process'

export function runCode(filename: string, {
  args
}: {args: string[]}) {
  spawn('node', [filename, ...args], {
    stdio: 'inherit'
  })
}