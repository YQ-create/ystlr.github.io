---
title: 'package.json 与依赖版本速查'
description: '常用字段、^ 与 ~ 的差别、锁文件与 scripts：把「换个机器就装不上」挡在提交之前。'
pubDate: 2026-11-09
category: '工程实践'
tags: ['工具', 'npm', 'Node.js']
pinned: false
draft: false
---

`package.json` 描述的是**意图**（我需要哪些包、允许什么范围），锁文件记录的是**事实**（上次到底装了哪些确切版本）。两者一起提交，才能保证别人 `npm ci` 装出和你一样的环境。

## 常用字段

| 字段 | 作用 | 备注 |
| --- | --- | --- |
| `name` / `version` | 包名与版本 | 发布到 registry 时必填 |
| `private` | 设为 `true` 防止误发布 | 应用项目建议一律加上 |
| `type` | `module` 或 `commonjs` | 决定 `.js` 按 ESM 还是 CJS 解析 |
| `scripts` | 自定义命令 | `npm run <name>` |
| `dependencies` | 运行时依赖 | 会随应用一起部署 |
| `devDependencies` | 开发 / 构建期依赖 | 生产安装时用 `--omit=dev` 跳过 |
| `engines` | 声明 Node / npm 版本 | 配合 CI 校验，避免「版本不对」 |
| `exports` / `main` | 包入口 | 库项目用于限制对外暴露的路径 |
| `bin` | 可执行文件映射 | 提供 CLI 时用 |

```json
{
  "name": "my-site",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "vite --host",
    "build": "vite build",
    "preview": "vite preview",
    "check": "npm run build && npm run lint"
  },
  "dependencies": { "astro": "^5.0.0" },
  "devDependencies": { "typescript": "~5.6.0" }
}
```

`scripts` 里可以直接引用同文件的其他脚本，`pre<script>` / `post<script>` 会在对应脚本前后自动执行（例如 `prebuild`）；但别把关键逻辑藏在隐式钩子后面，别人不容易发现。

## 版本号与范围符号

语义化版本是 `主版本.次版本.补丁`（`MAJOR.MINOR.PATCH`）：不兼容改动升主版本、向后兼容的新功能升次版本、修 bug 升补丁。

| 写法 | 允许升级到 | 适合 |
| --- | --- | --- |
| `1.2.3` | 只有 `1.2.3` | 需要严格钉死时 |
| `^1.2.3` | `>=1.2.3 <2.0.0` | 默认，允许次版本与补丁 |
| `~1.2.3` | `>=1.2.3 <1.3.0` | 只允许补丁，较保守 |
| `>=1.2.0 <2` | 显式区间 | 自定义策略 |
| `*` / `latest` | 任意 | **别用在生产依赖上** |
| `file:../lib` | 本地路径 | 本地联调，不适合长期提交 |

`0.x` 是个特例：`^0.2.3` 只允许 `<0.3.0`，因为主版本为 0 时次版本变更也可能不兼容。

## 安装、锁文件与 scripts

```bash
npm install            # 按 package.json 解析，更新依赖与锁文件
npm ci                 # 严格按锁文件全新安装，CI / 部署一律用它
npm install vite -D    # 加到 devDependencies
npm update             # 在允许范围内升级
npm outdated           # 看看有哪些可升级
npm audit              # 检查已知漏洞（不能替代人工判断）
```

`npm ci` 会先删掉 `node_modules` 再按锁文件装，锁文件与 `package.json` 冲突时直接报错而不是悄悄改 —— 这正是 CI 需要的行为。**锁文件必须提交，且不要手改**。

`npx` 用来临时执行包里的命令；`npm run` 执行 scripts 时会自动把 `node_modules/.bin` 加进 PATH，所以脚本里可以直接写 `vite build` 而不必带路径。

## 容易踩的坑

- **只提交 `package.json` 不提交锁文件**：同一份范围声明，隔一周装出来的依赖树可能完全不同，「昨天还能构建」就来了。
- **CI 里用 `npm install`**：它会顺手更新锁文件，把「构建通过」建立在漂移的依赖上；用 `npm ci`。
- **把运行时依赖装进 `devDependencies`**：本地一切正常，生产用 `--omit=dev` 安装后直接找不到模块。
- **手工改 `node_modules` 里的代码**：重装即消失，需要补丁就用 `patch-package` 之类的方案，或提上游 PR。
- **用 `*` 或 `latest`**：上游一次破坏性更新就能让部署挂掉，且很难回溯到「哪个版本是好的」。
- **忽略 `engines`**：本地 Node 22、CI Node 18，构建到一半才报语法或 API 不支持；CI 里固定同一个版本。
- **在 `postinstall` 里跑需要网络的脚本**：离线环境、镜像构建、受限 CI 都会卡在这里。
- **`npm audit` 一有告警就无脑 `--force`**：跨大版本的强制修复可能引入不兼容，先看变更内容再决定。

## 参考

依据 [菜鸟教程 · NPM 使用介绍](https://www.runoob.com/nodejs/nodejs-npm.html) 的知识脉络（package.json、依赖管理、常用命令）整理，字段部分参照 [npm 文档 · package.json](https://docs.npmjs.com/cli/v11/configuring-npm/package-json)。本文为要点归纳与自写示例，具体命令行为以本机 npm 版本为准。
