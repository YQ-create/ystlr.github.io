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
├── scripts/
│   └── new-photo.mjs        # npm run photo：压图 + 生成照片墙记录的录入接口
├── .github/workflows/deploy.yml   # GitHub Pages 自动部署流程
└── astro.config.mjs         # 站点域名与集成配置
```

## 页面与功能

| 页面 | 路由 | 说明 |
| --- | --- | --- |
| 首页 | `/` | Hero（底部是缓慢左移的照片带）、精选文章、照片墙速览 |
| 文章 | `/blog` | 文章列表，支持关键词搜索与标签筛选，顶部有「投稿」入口 |
| 照片墙 | `/gallery` | 照片按年、月分组的瀑布网格 |
| 发现 | `/discover` | 收藏书签与推荐站点卡片，数据来自 `src/data/discover.json` |
| 关于 | `/about` | 个人简介、记录方向与联系方式 |
| 管理后台 | `/admin` | 纯前端发文/传图/传音乐，直接提交到 GitHub（见下方「管理后台」） |

文章详情页底部接入 Giscus 评论；未配置 `repoId` / `categoryId` 时不渲染评论区，不影响其他内容。

## 文章投稿与审核

访客在 `/blog` 顶部点「投稿」，填写标题、正文（支持 Markdown）、标签和署名；提交时会**打开 GitHub 的「新建 Issue」页并预填好内容**，访客用自己的 GitHub 账号确认一次即可。你在 Issues 里审核，通过后把内容转成 `src/content/blog/*.md` 发布。

**纯静态站不要在前端放任何密钥。** 早期版本设计成「前端直接拿机器人 PAT 调 GitHub API」，但 PAT 会随构建产物发给所有访客，等于公开泄露。现在改成预填链接，零密钥、零后端：

- 开关在 `src/consts.ts` 的 `SUBMIT_ENABLED`，默认 `false`（不显示投稿按钮）；改成 `true` 即可启用，无需配置任何 token。
- Issue 正文自动带上标签、署名和一条「来自 ystlr.com 的投稿」脚注，标题加 `[投稿]` 前缀，label 预填 `投稿`。
- 预填内容走 query string，正文过长（URL > 7500 字符）会提示精简或改用邮件。
- 若将来要「点一下就自动建 Issue」，必须走 Serverless 代理 / GitHub Actions，把密钥放在服务端环境变量，绝不能写进客户端代码。

## 视觉与动效

整站是「近黑台面 + 亮橙强调」的编辑感设计：底色 `#0b0b0c`，强调色 `#ff6a2b`，展示字体 `Bodoni Moda`（衬线，中文由宋体兜底）、正文 `Hanken Grotesk`，三套字体都本地化在 `src/assets/fonts/`。首页背景是 `Topography.astro` 的 WebGL2 地形等高线（fixed 在视口，滚动时内容从上面滑过）。常规入场动效由 `src/components/Motion.astro` 统一驱动，页面里只写 data 属性：

| 写什么 | 效果 |
| --- | --- |
| `data-reveal` | 进入视口时上浮淡入（`left` / `right` / `scale` / `mask` 是变体） |
| `data-reveal-delay="120"` | 同组元素错开进场，单位毫秒 |
| `data-glow` | 玻璃卡片跟随指针的高光 |
| `data-tilt="8"` | 卡片随指针轻微 3D 倾斜 |
| `data-count-up` | 数字从 `data-from` 滚到 `data-to`（由 `CountUp.astro` 输出，逻辑在 Motion.astro） |

视觉组件（全部为原生实现，不引入 React / GSAP；`src/components/` 下没有未被引用的组件）：

| 组件 | 用途 | 主要参数 |
| --- | --- | --- |
| `Topography.astro` | 整页地形等高线背景（WebGL2 噪声高度场 + Bloom + 指针抬升），首页 `.atmo` 固定层 | `color`、`lineCount`、`elevation`、`tilt`、`fog`、`glow`、`brightness`、`fps` / `scrollFps`、`dpr` |
| `AccordionGallery.astro` | 首页「01 / 关于这里」的手风琴照片画廊（hover 展开、其余灰度收窄） | `items`、`height`、`gap`、`radius`、`expandRatio`、`orientation`、`trigger`、`grayscale` |
| `PillNav.astro` | 页头胶囊导航（当前页高亮 + scroll-spy） | 见组件 Props |
| `StarBorder.astro` | 主按钮的描边光效容器 | `surface`、`text`、`color`、`radius` |
| `LogoLoop.astro` | 首页 / 关于页的横向徽标跑马灯 | `items`、`speed`、`boost`、`pauseOnHover` |
| `SpotlightCard.astro` | 指针跟随的聚光卡片 | 见组件 Props |
| `ChromaGrid.astro` | 照片墙的彩色网格卡片 | `items` |
| `CountUp.astro` | 滚动数字 | `to`、`from`、`duration`、`decimals`、`prefix`、`suffix` |
| `ClickSpark.astro` | 点击处迸出火花 | `color`（默认跟随 `--accent`）、`size`、`radius`、`count` |
| `Shredder.astro` | 404 页的碎纸机互动 | `title`、`message`、`actionLabel`、`width`、`height` |
| `SiteSearch.astro` | 站内搜索浮层（⌘K / Ctrl+K） | — |
| `MusicPlayer.astro` | 顶部播放器，`transition:persist` 保活、切页不中断 | 曲目在 `src/data/playlist.json` |
| `SubmitPost.astro` | 投稿弹窗，由 `SUBMIT_ENABLED` 控制 | — |
| `GradualBlur.astro` | 视口/容器边缘的渐进模糊（多层 `backdrop-filter` + 分段 mask + 渐变 tint），照片墙上下渐隐 | `position`、`target`、`height`、`strength`、`layers`、`curve`、`tint`、`autoHide`、`zIndex` |
| `PostCard` / `PostListItem` / `Giscus` / `FormattedDate` | 文章卡、列表项、评论、日期 | — |

`GradualBlur` 用在 `/gallery` 的上下边缘：`zIndex={30}` 必须低于页头(120)与灯箱(100)，否则会糊住导航和放大后的照片；`autoHide` 让顶部初始透明（标题清晰）、底部滚到末尾时淡出。小屏直接 `display:none` 关掉顶部层，不然大标题正好落进窄带会被糊成白雾。**层数控制在 5–6 层**——每层 `backdrop-filter` 都要读回一次背景，叠太多会拖累滚动（实测 11 层与全关相比帧间隔一致，再往上就要小心了）。

`Topography.astro` 是唯一带整套 shader 的组件（原生 WebGL2，约 1600 行）。Astro 对 `<script>` 内大段模板字符串和 shader 的解析比较脆（`?` 后直接跟模板字符串会报 `Expected a semicolon`，切分 shader 漏一个反引号会报 `Unterminated string`），这类渲染逻辑可以拆到 `src/scripts/*.ts` 交给 vite 按模块编译。目前只有 `letter-reveal.ts` 走这条路（首页逐字揭示；`splitChars()` 必须幂等，否则 View Transitions 重复初始化会把每个字再包一层）。

**背景性能约定（改动前先读）**：`Topography` 默认 30fps、滚动期间 15fps，指针移动 / 开场 / 点击脉冲时回到 60fps，`dpr` 上限 1.5；它 fixed 在视口里，滚动时只有内容在动、背景不重画整页。这是滚轮顺滑的关键，别改回「每个区块各挂一个背景实例」。滚动回调里也不要「先改 class 再读 `offsetHeight`」——那会每帧强制同步回流。

页面切换用 Astro 的 `<ClientRouter />`（View Transitions）：页头通过 `transition:persist` 保活，所以切页时导航胶囊里的高亮会平滑滑动而不会闪。**所有在 `astro:page-load` 里执行的初始化都要自带幂等保护**，并在 `cleanups` 里成对移除监听器 / Observer / rAF，否则导航次数一多就会累积泄漏。

> 改组件时的两个坑：
> 1. Astro 会把体积小的 `<script>` 直接内联在组件**原位**（不是提到 `<head>`），所以组件里别写「只该跑一次」的脚本——同一页用 3 次就会内联 3 份。`CountUp` 因此只输出 `[data-count-up]` 标记，滚动逻辑统一放在 `Motion.astro`。
> 2. 自己写了 `display` 的元素会盖掉浏览器对 `[hidden]` 的 `display:none`（如灯箱 `.lightbox`、发现页 `.link-card`），要显式补一条 `X[hidden]{display:none}`。

> 注意：`src/components/BaseHead.astro` 里有一段极短的 `moveBefore` 兜底补丁。Chromium 137+ 的 `Element.moveBefore()` 不允许跨文档或把元素挪到 `<html>` 下，而 Astro 的 `transition:persist` 正好会这么做，不补丁会抛 `HierarchyRequestError` 导致点导航后地址栏不更新。等 Astro 上游修好后可以删掉这段。

## 配色（固定深色）

站点**固定深色主题**，不再提供浅色/跟随系统的切换，页头右侧的外观按钮已移除。

所有颜色都在 `src/styles/global.css` 顶部的 `:root` token 里（只有一份，深色值），组件统一用 `rgb(var(--token))` 引用。想调色就改 `:root` 里的那一组值：强调色 `--accent`（赭石陶土棕）、纸面层次 `--bg` / `--paper` / `--surface`、文字 `--ink` / `--muted`、玻璃 `--glass-bg` / `--glass-brd` 等。`BaseHead.astro` 里有一小段内联脚本，在首屏渲染前就把 `data-theme="dark"` 落到 `<html>` 上，刷新不会闪白。

玻璃质感保留一档 `:root[data-glass='clear']` 的备选 token（`--glass-bg` 更淡、模糊更重），目前没有 UI 入口，默认走 `frosted`；以后想加回来，给 `<html>` 写 `data-glass="clear"` 即可。

## 常用修改位置

| 想改什么 | 改哪里 |
| --- | --- |
| 站点标题、Hero 头衔与两行副标题、邮箱、GitHub 链接 | `src/consts.ts` |
| 博客文章（写作、发布、删除） | `src/content/blog/`，frontmatter 格式见下文 |
| 照片墙照片与说明 | `npm run photo -- <图片>` 一条命令搞定，见「照片墙记录格式」 |
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

## 照片墙记录格式（加照片的三种入口）

一张照片 = **一张图 + 一条记录**：图片放 `src/assets/gallery/`，记录（`.md`）放 `src/content/gallery/`。`date` 是拍摄日期，页面按年、月自动分组排序。三种加法的产物完全一样，可以混着用。

### 入口一：本地命令行（推荐，能顺便压缩）

```bash
npm run photo -- ./照片.jpg                     # 最省事：一张图
npm run photo -- ./国庆/                        # 整个文件夹批量（不进子目录）
npm run photo -- ./IMG_2043.HEIC \
  -t "江边的傍晚" -c "落日把江面染成暖橙色。" -g 生活,风景 -d 2026-10-22
npm run photo -- ./照片.jpg -n                  # 只看会写什么，不落盘
npm run photo -- --remove 123                   # 删掉一条记录和它的图
```

| 选项 | 作用 |
| --- | --- |
| `-t, --title` | 标题（批量时忽略，改用各自文件名） |
| `-c, --caption` | 图注 |
| `-g, --tags` | 标签，逗号分隔 |
| `-d, --date` | 拍摄日期 `YYYY-MM-DD`，缺省读 EXIF，再退到文件修改时间 |
| `-s, --slug` | 自定义文件名（只能用 `a-z 0-9 - _`） |
| `--keep` | 不压缩，原图直接复制（动图请用它） |
| `--force` | 同名记录已存在时覆盖 |
| `-n, --dry-run` | 只打印计划 |
| `--remove <slug…>` | 删除记录及它引用的图片 |

脚本会按 EXIF 方向摆正、长边压到 2400px、丢掉元数据（实测 35KB→11KB、41KB→10KB），然后写出同名的 `.md`。中文文件名会掉成空串，自动回落成 `photo-20261029-002545`；撞名自动顺延 `-2`、`-3`。输出文件与 `/admin` 上传、手写记录三者格式一致。

### 入口二：网页后台 `/admin` → 照片

打开 `/admin`，粘 GitHub Token，选图填字段，点「上传并提交」。走浏览器直连 GitHub API，不用本地环境（Token 怎么建见下方「管理后台」）。

### 入口三：手写记录

图片丢进 `src/assets/gallery/my-photo.jpg`，再新建 `src/content/gallery/任意名字.md`：

```yaml
---
title: "江边的傍晚"
date: 2026-10-22
image: ../../assets/gallery/my-photo.jpg
caption: "落日把江面染成暖橙色，风里有秋天的味道。"
tags: ["生活", "风景"]
---
```

### 字段契约（`src/content.config.ts` 的 gallery schema）

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `date` | date | ✅ | 拍摄日期，决定年月分组与排序 |
| `image` | Image | ✅ | 相对 `.md` 的路径，如 `../../assets/gallery/x.jpg` |
| `title` | string | | 标题，出现在轮播与灯箱 |
| `caption` | string | | 图注，显示在缩略图下方 |
| `tags` | string[] | | 默认 `[]`，目前不参与分组，留给以后的筛选 |

改完 `npm run dev` 即可预览。照片会同时出现在照片墙、首页流动照片带和首页「照片墙速览」里；点开任意一张放大，**放大状态下顶栏依然可以点**，切页时灯箱自动收起、页面滚动也会解锁。

> 仓库里现在只剩一张名叫 `123` 的测试图。想清空就 `npm run photo -- --remove 123`，照片墙会退回到空状态并显示录入说明。

## 管理后台（/admin）

站上没有服务端，但有一个能用的小后台：打开 `/admin`，粘一个 GitHub Token，就能写文章、传照片、传音乐，保存后由浏览器直接调 GitHub API 提交到 `main`，Actions 构建完约 1 分钟生效。

**准备 Token（只需一次）**：GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → 新建，Repository access 只勾 `YQ-create/ystlr.github.io`，Permissions → Repository permissions → **Contents = Read and write**，其它都不用给。生成的 `github_pat_…` 粘进后台即可。

Token 只放在当前标签页的 `sessionStorage`（键 `ystlr:admin:token`），关掉页面就没了，不会写进仓库或日志。

三个 Tab：

| Tab | 能做什么 | 提交到哪 |
| --- | --- | --- |
| 文章 | 新建/编辑/删除 Markdown，改标题、描述、日期、标签、封面，勾「精品」或「草稿」 | `src/content/blog/<slug>.md` |
| 照片 | 选图 + 标题/说明/日期，自动配一条记录 | `src/assets/gallery/<slug>.<ext>` + `src/content/gallery/<slug>.md` |
| 音乐 | 选音频 + 标题/作者，自动追加到播放列表 | `public/audio/<slug>.<ext>` + `src/data/playlist.json` |

「精品」对应 frontmatter 的 `featured: true`：首页「精选文章」会先放精品的（按时间倒序），不够 3 篇再用最新的补。`draft: true` 的文章不会出现在首页，但仍会构建出详情页。

> 手工改文件也行，格式见下面几节；后台只是把同样的文件写出来。

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
