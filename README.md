# ystlr.com 个人博客

基于 [Astro](https://astro.build) 构建的静态个人站点：博客文章 + 作品展示 + 关于页，
自动部署到 GitHub Pages，绑定自有域名 **ystlr.com**。

## 技术栈

- Astro 7（静态输出，Markdown / MDX 写作）
- @astrojs/rss（RSS 订阅）、@astrojs/sitemap（站点地图）
- GitHub Actions 自动构建并发布到 GitHub Pages

## 本地开发

环境要求：Node.js ≥ 22.23.4（推荐 Node 24 LTS）。

```bash
# 安装依赖（首次）
npm install

# 启动本地预览，默认 http://localhost:4321
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
│   ├── components/          # 页头、页脚、文章卡片、作品卡片等组件
│   ├── content/blog/       # 所有博客文章（一篇文章一个 Markdown 文件）
│   ├── data/projects.ts    # 作品列表，新增项目在这里追加
│   ├── layouts/             # 文章详情布局
│   ├── pages/               # 页面路由：首页、博客、作品、关于
│   ├── styles/global.css    # 全局配色与排版变量
│   └── consts.ts            # 站点标题、简介、作者、社交链接
├── .github/workflows/deploy.yml   # GitHub Pages 自动部署流程
└── astro.config.mjs        # 站点域名与集成配置
```

## 写一篇新文章

1. 在 `src/content/blog/` 下新建一个 `.md` 文件，文件名即文章网址，例如 `my-note.md`；
2. 按下面的格式填写开头的 frontmatter：

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

3. 保存后 `npm run dev` 即可在本地预览；推送代码后会自动上线。

## 常用修改位置

| 想改什么 | 改哪里 |
| --- | --- |
| 站点标题、简介、作者名、邮箱、GitHub / X 链接 | `src/consts.ts` |
| 作品 / 项目卡片 | `src/data/projects.ts` |
| 配色、字体、全局间距 | `src/styles/global.css` 顶部的 CSS 变量 |
| 导航菜单项 | `src/components/Header.astro` |
| 站点域名 | `astro.config.mjs` 的 `site` 与 `public/CNAME` |

## 上线部署（GitHub Pages + ystlr.com）

### 1. 在 GitHub 创建仓库

- 登录 GitHub，新建一个空仓库（不要勾选初始化 README）；
- 推荐仓库名为 `<你的GitHub用户名>.github.io`，这样站点挂在域名根路径；
- 记下仓库地址，例如 `https://github.com/你的用户名/你的用户名.github.io.git`。

### 2. 关联远程仓库并推送

首次使用 Git 先配置身份（只需执行一次，换成你自己的名字和邮箱）：

```bash
git config --global user.name "你的名字"
git config --global user.email "你的邮箱"
```

然后在本目录执行：

```bash
git add .
git commit -m "初始化 ystlr 个人博客"
git branch -M main
git remote add origin https://github.com/你的用户名/你的用户名.github.io.git
git push -u origin main
```

### 3. 开启 GitHub Pages

进入仓库 **Settings → Pages**，在 **Build and deployment → Source** 选择
**GitHub Actions**（本仓库已自带 `.github/workflows/deploy.yml`，推送 main 分支后会自动构建发布）。

### 4. 配置域名 DNS

在你购买 ystlr.com 的域名服务商控制台（域名解析后台）添加以下记录：

**根域名（A 记录，指向 GitHub Pages）**

| 主机记录 | 记录类型 | 记录值 |
| --- | --- | --- |
| `@` | A | `185.199.108.153` |
| `@` | A | `185.199.109.153` |
| `@` | A | `185.199.110.153` |
| `@` | A | `185.199.111.153` |

**www 子域名（CNAME）**

| 主机记录 | 记录类型 | 记录值 |
| --- | --- | --- |
| `www` | CNAME | `你的GitHub用户名.github.io` |

仓库 `public/CNAME` 已写入 `ystlr.com`，构建时会自动进入产物。
DNS 生效通常需要几分钟到几十分钟；Pages 设置页里勾选 **Enforce HTTPS** 开启强制 HTTPS。

### 5. 日常发布

写完文章保存，提交并推送：

```bash
git add .
git commit -m "新增文章：xxx"
git push
```

GitHub Actions 会自动构建并部署，稍等片刻即可在 https://ystlr.com 看到更新。
