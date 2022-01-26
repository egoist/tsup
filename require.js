import { createRequire } from 'module'

globalThis.require = globalThis.require || createRequire(import.meta.url)
