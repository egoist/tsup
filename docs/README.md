```js preact
import { html } from 'docup'

export default () => html`
  <div class="message message_type__warning">
    本站是由社区维护的非官方中文文档，与 tsup 作者及官方项目无隶属关系。tsup
    已不再积极维护，新项目建议考虑
    <a href="https://tsdown.dev/guide/migrate-from-tsup">tsdown</a>。
  </div>
`
```

# tsup 中文文档

基于 [esbuild](https://github.com/evanw/esbuild) 的零配置 TypeScript 库打包工具。

## 可以打包什么？

支持 Node.js 原生支持的 `.js`、`.json`、`.mjs` 文件，以及 TypeScript 的 `.ts`、`.tsx` 文件。CSS 支持仍处于实验阶段。

## 安装

建议把 tsup 安装为项目的开发依赖：

```bash
npm install tsup --save-dev
# Yarn
yarn add tsup --dev
# pnpm
pnpm add tsup --save-dev
```

不推荐全局安装。

## 快速开始

### 打包文件

```bash
tsup src/index.ts
```

构建产物默认写入 `./dist`。一次也可以传入多个入口：

```bash
tsup src/index.ts src/cli.ts
```

### 使用配置文件

tsup 会自动读取 `tsup.config.ts`、`tsup.config.js`、`tsup.config.cjs`、`tsup.config.json`，也支持 `package.json` 中的 `tsup` 字段。

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
})
```

使用 `--config` 指定其他配置文件，或使用 `--no-config` 禁用配置文件。

### 多入口

```bash
tsup --entry src/index.ts --entry src/cli.ts
```

也可以指定输出名称：

```bash
tsup --entry.main src/index.ts --entry.cli src/cli.ts
```

### 排除依赖

`package.json` 中的 `dependencies` 和 `peerDependencies` 默认不会被打进产物。其他模块可通过 `--external` 排除：

```bash
tsup src/index.ts --external react
```

为 Node.js 应用或 API 打包时通常无需打包依赖，也可以使用 `tsup-node`：

```bash
tsup-node src/index.ts
```

### 输出格式

支持 `esm`、`cjs` 和 `iife`，默认输出 `cjs`：

```bash
tsup src/index.ts --format esm,cjs
```

ESM 默认启用代码分割，可使用 `--no-splitting` 关闭。

### 生成类型声明

```bash
tsup src/index.ts --dts
```

只输出声明文件：

```bash
tsup src/index.ts --dts-only
```

声明文件构建应在发布前通过 `tsc` 或 `@arethetypeswrong/cli` 验证。`--experimental-dts` 使用 `@microsoft/api-extractor`，需要单独安装该可选依赖。

### Source Map

```bash
tsup src/index.ts --sourcemap
```

开发场景可使用 `--sourcemap inline`，生产环境不建议内联 Source Map。

### 目标环境

```bash
tsup src/index.ts --target node18
tsup src/index.ts --target es2020
```

支持 Chrome、Edge、Firefox、Node.js、Safari 等运行环境及 ECMAScript 版本。

### 监听模式

```bash
tsup src/index.ts --watch
```

构建成功后执行命令：

```bash
tsup src/index.ts --watch --onSuccess "node dist/index.js"
```

### 压缩

```bash
tsup src/index.ts --minify
```

也可以安装 Terser 后使用 `--minify terser`。

### 编译期环境变量

```bash
tsup src/index.ts --env.NODE_ENV production
```

该选项只替换代码中的 `process.env.NODE_ENV` 和 `import.meta.env.NODE_ENV`。

### Tree Shaking

esbuild 默认启用 Tree Shaking。需要 Rollup 进一步处理时可使用：

```bash
tsup src/index.ts --treeshake
```

### CSS 与静态文件

CSS 支持处于实验阶段。安装 PostCSS 后，tsup 会读取项目中的 PostCSS 配置。

使用 `--publicDir` 可把静态目录复制到输出目录：

```bash
tsup src/index.ts --publicDir public
```

### JavaScript API

```ts
import { build } from 'tsup'

await build({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
})
```

完整配置类型请参考 [tsup API 文档](https://jsdocs.io/package/tsup)。

## 常见问题

### tsup 会进行类型检查吗？

不会。esbuild 只负责转换和打包。开发时可依靠编辑器检查类型，并在 CI 或构建流程中单独运行 `tsc --noEmit`。启用 `--dts` 时 TypeScript 编译器会参与声明文件生成。

### 找不到某个导出

使用装饰器元数据时，类型导入可能在 SWC 转换后被移除。请把仅用作类型的导入改为：

```ts
import type { SomeType } from './types'
```

### 如何查看全部命令行选项？

```bash
tsup --help
```

## 从 tsup 迁移到 tsdown

tsup 已不再积极维护。新项目优先评估 tsdown；现有项目迁移前应检查插件、声明文件和 CJS/ESM 输出行为。请参阅 [官方迁移指南](https://tsdown.dev/guide/migrate-from-tsup)。

## 相关链接

- [英文原文](/en/)
- [tsup GitHub 仓库](https://github.com/egoist/tsup)
- [完整 API 文档](https://jsdocs.io/package/tsup)
- [tsdown 迁移指南](https://tsdown.dev/guide/migrate-from-tsup)

## 许可证与声明

原项目采用 MIT License，版权所有 © EGOIST。本中文站为非官方社区翻译与整理，使用时请同时遵守原项目许可证。
