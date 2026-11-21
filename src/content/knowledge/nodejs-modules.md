---
title: 'Node.js 模块系统与包管理'
description: 'CommonJS 与 ESM 的区别、package.json 的关键字段、以及 npm 常用的那些命令。'
pubDate: 2026-11-20
category: '后端运行时'
tags: ['Node.js', '工具']
stage: '核心'
topics: ['运行时']
pinned: false
draft: false
---

Node.js 有两套模块规范并行：老的 **CommonJS（CJS）** 和新的 **ESM**。写代码时先分清自己在用哪套，很多「奇怪的报错」都源于两者混用。

## CommonJS vs ESM

```js
// CommonJS（.js 默认，或 .cjs）
const fs = require('node:fs');
module.exports = { hello };
exports.hello = hello;

// ESM（.mjs，或 package.json 里 "type": "module"）
import fs from 'node:fs';
export default hello;
export { hello };
```

| 区别 | CommonJS | ESM |
| --- | --- | --- |
| 加载时机 | 运行时，`require` 到哪算哪 | 静态分析，编译时就确定依赖 |
| 导出 | 值拷贝 | 只读的引用（live binding） |
| 顶层 this | `module.exports` | `undefined` |
| 能否顶层 await | 不能 | 能 |
| 默认导出 | 无 | 有 `export default` |

## package.json 的关键字段

```json
{
  "name": "my-pkg",
  "version": "1.2.0",          // 遵循语义化版本 major.minor.patch
  "type": "module",            // 有它 .js 按 ESM 解析
  "main": "dist/index.cjs",    // CommonJS 入口
  "module": "dist/index.js",   // ESM 入口
  "exports": {                 // 现代入口声明，优先级高于 main
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "scripts": { "dev": "vite", "build": "vite build" },
  "dependencies": {},          // 运行时依赖
  "devDependencies": {}        // 只在开发/构建时用
}
```

`exports` 字段一旦声明，就**只允许**访问它列出的路径，外部 `import pkg/subpath` 若没列出会直接报错——这其实是好事，锁死了内部结构。

## 版本号与锁文件

- **语义化版本**：`^1.2.3`（兼容 1.x，不升 2）、`~1.2.3`（只升 patch）、`1.2.3`（精确）、`*`（随便）。
- **package-lock.json**：记录每个依赖的**精确版本和哈希**，保证团队和 CI 装出来完全一致。要提交到仓库，不要删。
- `npm install` 会按 lock 装，`npm update` 才按范围升。

## 常用的 npm 命令

```bash
npm init -y                 # 快速生成 package.json
npm install <pkg>           # 装到 dependencies
npm install -D <pkg>        # 装到 devDependencies
npm install                 # 按 lock 安装全部
npm uninstall <pkg>
npm ci                      # CI 里用：严格按 lock，删除后重装
npm outdated                # 看哪些依赖有新版
npm update                  # 在版本范围内升级
npm run <script>            # 跑 scripts 里的命令
npx <pkg>                   # 不安装，临时执行一个包
```

## 依赖管理上的坑

- **`node_modules` 不要提交**，加进 `.gitignore`。
- **别乱 `npm i -g`**：全局装的工具版本难以复现，尽量放 `devDependencies` 里用 `npx`。
- **幽灵依赖**：装了 A，A 依赖 B，代码里直接 `import B` 能用但很危险（B 升级可能消失）。用 pnpm 能避免。
- **审计**：`npm audit` 看已知漏洞，`npm audit fix` 自动修能修的。
- **升级大版本**前先看 changelog，语义化里 `major` 变了意味着**可能有破坏性改动**。

## 内建模块用 `node:` 前缀

```js
const fs = require('node:fs');   // 而不是 require('fs')
import path from 'node:path';
```

加 `node:` 前缀能明确「这是 Node 内建模块」，避免和第三方包同名时被劫持。这是现在的推荐写法。

一句话总结：**搞清楚 CJS/ESM 差异 + 看懂 package.json 的 exports/type + 用好锁文件**，就能避开绝大多数 Node 项目的坑。
