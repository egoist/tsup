#!/usr/bin/env node
import { readFileSync } from 'fs'
import {join} from 'path'
import { cac } from 'cac'

const cli = cac('tsup')

cli.command('[file]', 'Bundle a speific file')
.option('--format <format>', 'Bundle format')
  .action(async (file: string, options) => {
    const {rollup} = await import('rollup')

    return rollup({
      input: file,
      plugins: [
        require('rollup-plugin-hashbang')(),
        require('rollup-plugin-babel')({
          extensions: ['.js', '.jsx', '.ts', '.tsx'],
          presets: [
            [require.resolve('@babel/preset-env'), {
              modules: false
            }],
            require.resolve('@babel/preset-typescript')
          ]
        })
      ]
    }).then(result => {
      result.write({
        dir: 'dist',
        format: options.format || 'cjs'
      })
    })
  })

cli.help()

const pkgPath = join(__dirname, '../package.json')
cli.version(JSON.parse(readFileSync(pkgPath, 'utf8')).version)

cli.parse()