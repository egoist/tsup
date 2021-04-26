#!/usr/bin/env node
import { handleError } from './errors'
import { main } from './cli-main'

main({
  skipNodeModulesBundle: true,
}).catch(handleError)
