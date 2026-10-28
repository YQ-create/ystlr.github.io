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
│   ├── components/          # 页头、页脚、播放器、动效组件（见下方「视觉与动效」）
│   ├── content/
│   │   ├── blog/           # 所有博客文章（一篇文章一个 Markdown 文件）
│   │   └── gallery/        # 照片墙记录（每条一张照片，按 date 分组到年、月）
│   ├── data/
│   │   ├── discover.json   # 发现页收藏书签与推荐站点分组
│   │   └── playlist.json   # 顶部悬浮播放器曲目列表
│   ├── layouts/            # BaseLayout（全站骨架）+ BlogPost（文章详情）
│   ├── pages/              # 路由：/、/blog、/gallery、/discover、/about、/404
│   ├── styles/global.css   # 全局配色、玻璃质感与排版变量（token 在顶部）
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

## 视觉与动效

整站是一套「暖色纸面 + 玻璃卡片」的设计：背景是三层极淡的径向光晕，卡片用半透明底色 + `backdrop-filter` 做磨砂，主色是赭石棕（`--accent`）。所有动效都由 `src/components/Motion.astro` 统一驱动，页面里只写 data 属性：

| 写什么 | 效果 |
| --- | --- |
| `data-reveal` | 进入视口时上浮淡入（`left` / `right` / `scale` / `mask` 是变体） |
| `data-reveal-delay="120"` | 同组元素错开进场，单位毫秒 |
| `data-glow` | 玻璃卡片跟随指针的高光 |
| `data-tilt="8"` | 卡片随指针轻微 3D 倾斜 |

四个视觉组件可以单独复用：

| 组件 | 用途 | 主要参数 |
| --- | --- | --- |
| `SpectralDrape.astro` | 首页 Hero 的光点织物背景（透视铺开、褶皱起伏、指针顶包） | `preset`（ember/spectral/ice）、`density`、`rows`、`amp`、`speed`、`pointer` |
| `SpecularButton.astro` | 边缘带流光的玻璃按钮（WebGL2） | `href`、`size`、`lineColor`、`intensity`、`shineSize`、`autoAnimate`、`followMouse` |
| `DriftWall.astro` | 照片墙/首页的 3D 漂移照片带 | `items`、`columns`、`rows`、`speed`、`direction`、`tilt`、`turn`、`height` |
| `Shredder.astro` | 404 页的碎纸机互动 | `title`、`message`、`actionLabel`、`width`、`height` |

`SpectralDrape` 是纯 Canvas 2D（没有 WebGL、没有第三方依赖）：一块点阵布从地平线铺到画面底部，按透视收束，三条慢波把布面推起褶皱，褶皱脊线更亮更大；指针经过会把布顶起一个包。它自己会做这几件事——离屏或切到别的标签页时暂停、窗口尺寸变化时重建点阵、手机宽度下把点数砍掉约一半、`prefers-reduced-motion` 时只画一帧。想换气质就换 `preset`：`ember`（赭石琥珀，默认，配暖纸底）、`spectral`（全光谱）、`ice`（冷青）。

`SpecularButton` 把 React Bits 的 `SpecularButton` 用原生 WebGL2 重写了一遍（不引入 React）：圆角矩形的周长被映射到 0–1 的参数空间，光斑是这个参数上的一个余弦瓣，鼠标靠近时瓣会滑到离指针最近的边缘点；`autoAnimate` 会让这道光自己绕一周。传 `href` 渲染成 `<a>`，否则是 `<button>`；浏览器不支持 WebGL2 时自动退化成普通玻璃按钮。

页面切换用 Astro 的 `<ClientRouter />`（View Transitions）：页头通过 `transition:persist` 保活，所以切页时导航胶囊里的高亮会平滑滑动而不会闪。

> 注意：`src/components/BaseHead.astro` 里有一段极短的 `moveBefore` 兜底补丁。Chromium 137+ 的 `Element.moveBefore()` 不允许跨文档或把元素挪到 `<html>` 下，而 Astro 的 `transition:persist` 正好会这么做，不补丁会抛 `HierarchyRequestError` 导致点导航后地址栏不更新。等 Astro 上游修好后可以删掉这段。

## 深浅色与玻璃

页头右侧那个太阳/月亮按钮是**外观设置**，面板里有两组选项：

| 组 | 选项 | 落到 `<html>` 上 |
| --- | --- | --- |
| 主题 | 浅色 / 深色 / 跟随系统 | `data-theme="light\|dark"` |
| 玻璃 | 磨砂 / 透明 | `data-glass="frosted\|clear"` |

两个维度正交，可以任意组合（深色+透明、浅色+磨砂……）。选择存在 `localStorage` 的 `ystlr:theme` 与 `ystlr:glass`，`data-theme-choice` 额外记住「跟随系统」这个意图，系统主题变化时会自动跟随。

实现上没有一处是"深色单独写一套样式"：所有颜色都在 `src/styles/global.css` 顶部的两段 `:root` token 里（浅色一段、`:root[data-theme='dark']` 一段），深色只是把同一批 token 换成另一组值，组件一行都不用改。玻璃同理——`--glass-bg` / `--glass-blur` / `--glass-brd` 这几个 token 在 `:root[data-glass='clear']` 下换成更淡的底色和更重的模糊。

想加自己的颜色：在 `:root` 里加变量，再在深色那段补一个对应值即可。`BaseHead.astro` 里有一小段内联脚本，在首屏渲染前就把 `data-theme` 落到 `<html>` 上，所以刷新时不会先白闪一下再变黑。

切换的动画是给 `<html>` 加 380ms 的 `is-theme-anim` 类，让 `background-color` / `color` / `border-color` 平滑过渡；`prefers-reduced-motion` 下自动关掉。

## 常用修改位置

| 想改什么 | 改哪里 |
| --- | --- |
| 站点标题、Hero 头衔与两行副标题、邮箱、GitHub 链接 | `src/consts.ts` |
| 博客文章（写作、发布、删除） | `src/content/blog/`，frontmatter 格式见下文 |
| 照片墙照片与说明 | 图片放 `src/assets/gallery/`，记录写 `src/content/gallery/`，`date` 决定所属年月 |
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

照片分两步加：**图片放 `src/assets/gallery/`，记录写 `src/content/gallery/`**。`date` 为拍摄日期，页面按年、月自动分组。

1. 把照片（jpg / png / webp 都行）放进 `src/assets/gallery/`，例如 `my-photo.jpg`；
2. 在 `src/content/gallery/` 新建一个 `.md`（文件名随意，只作记录 id）：

```yaml
---
title: "江边的傍晚"
date: 2026-10-22
image: ../../assets/gallery/my-photo.jpg
caption: "落日把江面染成暖橙色，风里有秋天的味道。"
tags: ["生活", "风景"]
---
```

`image` 是相对这个 `.md` 文件的路径；`title`、`caption`、`tags` 都可以省略。保存后照片会同时出现在照片墙和首页的流动照片带里；点开任意一张会放大，**放大状态下顶栏依然可以点**，切页时灯箱自动收起、页面滚动也会解锁。

> 仓库里原有的示例照片已经清空，现在照片墙是空的，等你按上面的步骤慢慢加。

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
