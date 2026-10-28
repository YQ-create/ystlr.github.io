# ystlr.com 个人博客

基于 [Astro](https://astro.build) 构建的纯静态个人博客：米白暖调杂志纸张风，包含文章发布、照片墙、发现书签与关于页。自动部署到 GitHub Pages，绑定自有域名 **ystlr.com**。

## 技术栈

- Astro 7（静态输出，Markdown / MDX 写作）
- @astrojs/rss（RSS 订阅）、@astrojs/sitemap（站点地图）
- GitHub Actions 自动构建并发布到 GitHub Pages

## 本地开发

环境要求：Node.js ≥ 22.23.4（推荐 Node 24 LTS）。

```bash
# 安装依赖（首次）
npm install

# 启动本地开发，默认 http://localhost:4321
npm run dev

# 构建生产产物到 dist/
npm run build

# 本地预览构建产物
npm run preview
```

## 目录结构

```text
├── public/                  # 静态资源，原样复制到产物；CNAME 为自定义域名配置
├── src/
│   ├── components/          # 页头、页脚、音乐播放器、文章列表项、Giscus 评论等组件
│   ├── content/
│   │   ├── blog/           # 所有博客文章（一篇文章一个 Markdown 文件）
│   │   └── gallery/        # 照片墙记录（每条一张照片，按 date 分组到年、月）
│   ├── data/
│   │   ├── discover.json   # 发现页收藏书签与推荐站点分组
│   │   └── playlist.json   # 顶部悬浮播放器曲目列表
│   ├── layouts/            # 文章详情布局
│   ├── pages/              # 路由：/、/blog、/gallery、/discover、/about、/404
│   ├── styles/global.css   # 全局配色与排版变量（米白暖调 token 在顶部）
│   └── consts.ts           # 站点标题、Hero 文案、作者、社交链接
├── .github/workflows/deploy.yml   # GitHub Pages 自动部署流程
└── astro.config.mjs         # 站点域名与集成配置
```

## 页面与功能

| 页面 | 路由 | 说明 |
| --- | --- | --- |
| 首页 | `/` | Hero 文案、最新文章、照片墙速览 |
| 文章 | `/blog` | 文章列表，支持关键词搜索与标签筛选 |
| 照片墙 | `/gallery` | 照片按年、月分组的瀑布网格 |
| 发现 | `/discover` | 收藏书签与推荐站点卡片，数据来自 `src/data/discover.json` |
| 关于 | `/about` | 个人简介、记录方向与联系方式 |

文章详情页底部接入 Giscus 评论；未配置 `repoId` / `categoryId` 时不渲染评论区，不影响其他内容。

## 常用修改位置

| 想改什么 | 改哪里 |
| --- | --- |
| 站点标题、Hero 头衔与两行副标题、邮箱、GitHub 链接 | `src/consts.ts` |
| 博客文章（写作、发布、删除） | `src/content/blog/`，frontmatter 格式见下文 |
| 照片墙照片与说明 | `src/content/gallery/`，`date` 决定所属年月 |
| 发现页书签、推荐站点 | `src/data/discover.json` |
| 顶部播放器曲目 | `src/data/playlist.json`，音频文件放入 `public/audio/` |
| 首页 Hero、最新文章与照片墙区块 | `src/pages/index.astro` |
| 文章列表搜索框、标签筛选 | `src/pages/blog/index.astro` |
| 照片墙年、月分组与网格 | `src/pages/gallery/index.astro` |
| 全局配色（米白背景、纸面、赭石强调色、墨色文字） | `src/styles/global.css` 顶部 CSS 变量 |
| 导航菜单项 | `src/components/Header.astro` |
| 站点域名 | `astro.config.mjs` 的 `site` 与 `public/CNAME` |

## 写一篇新文章

1. 在 `src/content/blog/` 下新建一个 `.md` 文件，文件名即文章网址，例如 `my-note.md`；
2. 按下面格式填写开头的 frontmatter：

```yaml
---
title: '文章标题'
description: '一句话摘要，会显示在列表和 SEO 描述里'
pubDate: '2026-10-28'
tags: ['标签一', '标签二']
# heroImage: '../../assets/xxx.jpg'   # 可选：封面图
---

正文从这里开始，使用 Markdown 语法。
```

3. 保存后 `npm run dev` 即可在本地预览；提交并推送代码后，GitHub Actions 自动构建上线。

## 照片墙记录格式

每条照片记录放在 `src/content/gallery/`，`date` 为拍摄日期，页面按年、月自动分组：

```yaml
---
title: "江边的傍晚"
date: 2026-10-22
image: ../../assets/gallery/g-01.jpg
caption: "落日把江面染成暖橙色，风里有秋天的味道。"
tags: ["生活", "风景"]
---
```

## 评论系统（Giscus）

文章评论基于 Giscus，评论内容存储在仓库的 GitHub Discussions 中。接入步骤：

1. 在 https://giscus.app 输入公开仓库 `YQ-create/ystlr.github.io`，生成 `repoId` 与 `categoryId`；
2. 仓库开启 GitHub Discussions，并安装 Giscus GitHub App；
3. 将参数回填到 `src/components/Giscus.astro` 的 `GISCUS_CONFIG`。

未配置前评论区不会渲染，站点其余功能不受影响。

## 上线部署（GitHub Pages + ystlr.com）

### 1. 仓库与远程

本仓库为 `https://github.com/YQ-create/ystlr.github.io`，仓库名即 `<用户名>.github.io`，站点挂在域名根路径；绑定自有域名 `ystlr.com` 后从域名根路径访问。首次关联远程：

```bash
git config --global user.name "你的名字"
git config --global user.email "你的邮箱"
git remote add origin https://github.com/YQ-create/ystlr.github.io.git
```

### 2. 开启 GitHub Pages

进入仓库 **Settings → Pages**，**Build and deployment → Source** 选择 **GitHub Actions**（仓库已自带 `.github/workflows/deploy.yml`，推送 `main` 分支后自动构建发布）。

### 3. 配置域名 DNS

在域名服务商解析后台添加：

**根域名 A 记录**

| 主机记录 | 记录类型 | 记录值 |
| --- | --- | --- |
| `@` | A | `185.199.108.153` |
| `@` | A | `185.199.109.153` |
| `@` | A | `185.199.110.153` |
| `@` | A | `185.199.111.153` |

**www 子域名 CNAME**

| 主机记录 | 记录类型 | 记录值 |
| --- | --- | --- |
| `www` | CNAME | `yq-create.github.io` |

注意事项：

- 删除域名原有的停放页 A 记录，否则上面 4 条 GitHub IP 不会生效；
- 在仓库 **Settings → Pages → Custom domain** 填写 `ystlr.com` 并 Save（`public/CNAME` 只是产物文件，不会自动改这项设置）；
- DNS 生效与证书签发可能需要几分钟到 24 小时，完成后勾选 **Enforce HTTPS** 开启强制 HTTPS。

### 4. 日常发布

修改保存后提交并推送：

```bash
git add .
git commit -m "更新博客"
git push
```

GitHub Actions 会自动构建并部署，稍等片刻即可在 https://ystlr.com 看到更新。
