---
title: 'GitHub Actions 工作流速查'
description: '触发条件、job 与 step、缓存、制品和密钥：读懂并写出一份能稳定跑起来的 CI 配置。'
pubDate: 2026-11-09
category: '工程实践'
tags: ['实战', '工具']
pinned: false
draft: false
---

一份 workflow 就是一个放在 `.github/workflows/*.yml` 里的 YAML：**什么时候跑（on）→ 在哪些机器上跑（jobs）→ 每台机器按顺序做什么（steps）**。三层拆清楚，报错时才知道该看哪一段。

## 骨架

```yaml
name: build
on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:        # 允许手动触发

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: site
          path: dist/
```

| 层级 | 关键字 | 说明 |
| --- | --- | --- |
| 顶层 | `name` / `on` | 名称与触发条件 |
| job | `runs-on` / `needs` / `if` | 运行器、依赖顺序、条件 |
| step | `uses` / `run` / `with` / `env` | 复用 Action 或执行命令 |
| 上下文 | `github` / `env` / `secrets` / `steps` | 在 `${{ ... }}` 里取值 |

每个 job 是**全新虚拟机**，工作目录、环境变量、缓存都不共享；需要传递产物就用 `upload-artifact` / `download-artifact`，需要顺序就用 `needs`。

## 常见触发条件

| 写法 | 含义 |
| --- | --- |
| `on: push` | 任何分支推送 |
| `push: { branches: [main] }` | 仅 main |
| `pull_request` | PR 创建 / 更新（**fork PR 拿不到 secrets**） |
| `schedule: - cron: '0 2 * * *'` | 定时（UTC，且会延迟） |
| `workflow_dispatch` | 手动按钮，可带输入参数 |
| `workflow_run` | 另一条 workflow 跑完后 |

```yaml
on:
  push:
    paths: ['src/**', 'package-lock.json']   # 只在这些路径变动时跑
    paths-ignore: ['**.md']
```

> YAML 1.1 解析器会把裸写的 `on` 当成布尔 `true`，这也是它在部分编辑器里被高亮成布尔值的原因。GitHub 自己能正确解析，但写 `on:` 时保持顶层、不要加引号去「修」它。

## 缓存、制品与密钥

```yaml
- uses: actions/cache@v4
  with:
    path: ~/.npm
    key: ${{ runner.os }}-npm-${{ hashFiles('**/package-lock.json') }}
    restore-keys: ${{ runner.os }}-npm-

- name: 部署
  run: ./deploy.sh
  env:
    TOKEN: ${{ secrets.DEPLOY_TOKEN }}   # 通过环境变量传，不要写进命令
```

| 机制 | 用途 | 注意 |
| --- | --- | --- |
| `actions/cache` | 复用依赖目录 | `key` 要能反映依赖变化，否则用到旧缓存 |
| `upload-artifact` | 跨 job 传文件 / 留存构建产物 | 有保留期，别当长期存储 |
| `secrets.*` | 存敏感值 | 日志里会被遮蔽，但仍不要 `echo` 出来 |
| `env` / `vars` | 普通配置 | 非敏感的环境差异放 `vars` |
| `GITHUB_TOKEN` | 内置临时凭据 | 权限用 `permissions:` 最小化 |

```yaml
permissions:
  contents: read
  pages: write
  id-token: write
```

## 容易踩的坑

- **用 `npm install` 而不是 `npm ci`**：CI 里会悄悄更新锁文件，构建结果不可复现。
- **`secrets` 用在 fork 的 `pull_request` 里**：出于安全默认不注入，改用 `pull_request_target` 前务必先搞清它会以**基仓库权限**运行不可信代码。
- **在 `run` 里直接拼 `${{ github.event.* }}`**：来自 PR 标题、分支名的内容会进 shell，存在注入风险；先放进 `env:` 再引用 `"$VAR"`。
- **缓存 key 不带 `hashFiles`**：依赖升级后仍命中旧缓存，表现为「本地能过、CI 挂」。
- **`schedule` 当成准时**：UTC 且高峰期会排队延迟，重要任务要留时间余量。
- **忘了 `permissions`**：默认权限可能因仓库设置而变，`GITHUB_TOKEN` 突然写不动 Pages / Release。
- **job 之间假设工作目录还在**：每个 job 重新起机器，必须重新 checkout 或下载制品。
- **`uses` 不锁版本**：写 `@main` 会让上游改动直接影响构建；锁到大版本 tag 或 commit SHA。
- **密钥打印到日志**：`set -x`、`echo $TOKEN`、失败命令的回显都可能泄露，遮蔽不是万能的。

## 参考

依据 [GitHub Docs · Workflow syntax for GitHub Actions](https://docs.github.com/zh/actions/writing-workflows/workflow-syntax-for-github-actions) 的知识脉络整理。本文为要点归纳与自写示例；YAML 缩进与类型细节见本知识库的《YAML 语法速查》。
