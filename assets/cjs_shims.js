export const importMetaUrlShim =
  typeof document === 'undefined'
    ? new (require('u' + 'rl').URL)('file:' + __filename).href
    : (document.currentScript && document.currentScript.src) ||
      new URL('main.js', document.baseURI).href
