// Shim globals in cjs bundle

export const importMetaUrlShim =
  typeof document === 'undefined'
    ? new URL('file:' + __filename).href
    : (document.currentScript && document.currentScript.src) ||
      new URL('main.js', document.baseURI).href
