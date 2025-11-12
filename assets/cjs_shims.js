// Shim globals in cjs bundle
// There's a weird bug that esbuild will always inject importMetaUrl
// if we export it as `const importMetaUrl = ... __filename ...`
// But using a function will not cause this issue

const getImportMetaUrl = () => 
  typeof document === "undefined" 
    ? new URL(`file:${__filename}`).href 
    : (document.currentScript && document.currentScript.tagName.toUpperCase() === 'SCRIPT') 
      ? document.currentScript.src 
      : new URL("main.js", document.baseURI).href;

const getImportMetaFilename = () =>
  typeof document === 'undefined'
    ? __filename
    : undefined

const getImportMetaDirname = () =>
  typeof document === 'undefined'
    ? __dirname
    : undefined

export const importMetaUrl = /* @__PURE__ */ getImportMetaUrl()
export const importMetaFilename = /* @__PURE__ */ getImportMetaFilename()
export const importMetaDirname = /* @__PURE__ */ getImportMetaDirname()