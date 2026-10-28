# ystlr.com 个人作品集网站

基于 [Astro](https://astro.build) 构建的暗色荧光绿风格个人作品集：沉浸式首页 Hero、作品大图网格、关于页章节式布局，并保留轻量博客。自动部署到 GitHub Pages，绑定自有域名 **ystlr.com**。

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
│   ├── assets/
│   │   ├── portfolio/      # 首页 Hero 背景、关于页头像
│   │   └── works/          # 作品封面图（work-1 ~ work-6）
│   ├── components/         # 页头、页脚、作品卡片、文章列表项等组件
│   ├── content/blog/       # 所有博客文章（一篇文章一个 Markdown 文件）
│   ├── data/projects.ts    # 作品列表：标题、简介、标签、年份、封面
│   ├── layouts/            # 文章详情布局
│   ├── pages/             # 路由：首页 /、作品 /projects、关于 /about、博客 /blog
│   ├── styles/global.css   # 全局配色与排版变量（暗色主题 token 在顶部）
│   └── consts.ts           # 站点标题、Hero 文案、作者、社交链接
├── .github/workflows/deploy.yml   # GitHub Pages 自动部署流程
└── astro.config.mjs        # 站点域名与集成配置
```

## 常用修改位置

| 想改什么 | 改哪里 |
| --- | --- |
| 站点标题、Hero 头衔与两行副标题、邮箱、GitHub 链接 | `src/consts.ts` |
| 作品标题、简介、标签、年份、封面、跳转链接 | `src/data/projects.ts` |
| 首页 Hero 背景图、横滑作品条、简介区块 | `src/pages/index.astro` |
| 作品页大图网格 | `src/pages/projects/index.astro` + `src/components/WorkCard.astro` |
| 关于页简介、擅长方向、工具、经历时间线 | `src/pages/about.astro` |
| 暗色配色（荧光绿、背景、文字、边框） | `src/styles/global.css` 顶部 CSS 变量 |
| 导航菜单项 | `src/components/Header.astro` |
| 站点域名 | `astro.config.mjs` 的 `site` 与 `public/CNAME` |

### 替换占位内容

上线前需要把当前占位文案换成真实信息：

1. `src/consts.ts`：`HERO.role`、两行 `tagline`、社交链接；
2. `src/data/projects.ts`：六条作品的标题、描述、标签、年份与封面图；把新封面放进 `src/assets/works/` 并修改文件顶部 import；
3. `src/pages/about.astro`：头像、个人简介、两栏擅长方向与工具、`timeline` 经历条目；
4. 头像替换：新图放进 `src/assets/portfolio/avatar.jpg`（保持同名覆盖即可）；Hero 背景替换 `src/assets/portfolio/hero-bg.jpg`。

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

3. 保存后 `npm run dev` 即可在本地预览；推送代码后会自动上线。

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
git commit -m "更新作品集"
git push
```

GitHub Actions 会自动构建并部署，稍等片刻即可在 https://ystlr.com 看到更新。
