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
| 首页 | `/` | Hero（底部是缓慢左移的照片带）、精选文章、照片墙速览；默认深色 |
| 文章 | `/blog` | 文章列表，支持关键词搜索与标签筛选 |
| 照片墙 | `/gallery` | 照片按年、月分组的瀑布网格 |
| 发现 | `/discover` | 收藏书签与推荐站点卡片，数据来自 `src/data/discover.json` |
| 关于 | `/about` | 个人简介、记录方向与联系方式 |
| 管理后台 | `/admin` | 纯前端发文/传图/传音乐，直接提交到 GitHub（见下方「管理后台」） |

文章详情页底部接入 Giscus 评论；未配置 `repoId` / `categoryId` 时不渲染评论区，不影响其他内容。

## 视觉与动效

整站是一套「暖色纸面 + 玻璃卡片」的设计：背景是三层极淡的径向光晕，卡片用半透明底色 + `backdrop-filter` 做磨砂，主色是赭石棕（`--accent`）。所有动效都由 `src/components/Motion.astro` 统一驱动，页面里只写 data 属性：

| 写什么 | 效果 |
| --- | --- |
| `data-reveal` | 进入视口时上浮淡入（`left` / `right` / `scale` / `mask` 是变体） |
| `data-reveal-delay="120"` | 同组元素错开进场，单位毫秒 |
| `data-glow` | 玻璃卡片跟随指针的高光 |
| `data-tilt="8"` | 卡片随指针轻微 3D 倾斜 |
| `data-count-up` | 数字从 `data-from` 滚到 `data-to`（由 `CountUp.astro` 输出，逻辑在 Motion.astro） |

视觉组件：

| 组件 | 用途 | 主要参数 |
| --- | --- | --- |
| `AcidSquares.astro` | 首页 Hero 的方格地面（WebGL2，透视凸块 + 波纹 + 指针按压） | `color`/`accentColor`/`secondaryColor`（可传 `--token`）、`tileSize`、`gap`、`roundness`、`bulge`、`rotation`、`gloss`、`speed`、`lighting`、`grain`、`fade`、`opacity`、`detail` |
| `TechText.astro` | 首页大标题（canvas 逐字绘制，虚线线框 + 尺寸标注 + 入场动画） | `text`、`color`/`accentColor`（可传 `--token`）、`align`、`strokeWidth`、`lineStyle`、`reveal`、`labels`、`selection`、`sweep`、`intro`、`draggable` |
| `SpecularButton.astro` | 边缘带流光的玻璃按钮（WebGL2） | `href`、`size`、`lineColor`、`intensity`、`shineSize`、`autoAnimate`、`followMouse` |
| `DepthCarousel.astro` | 3D 纵深照片轮播（首页、照片墙） | `items`、`depth`、`spread`、`tilt`、`tiltDirection`、`visibleCards`、`falloff`、`blur`、`autoplay`、`loop` |
| `Shredder.astro` | 404 页的碎纸机互动 | `title`、`message`、`actionLabel`、`width`、`height` |
| `GlassSurface.astro` | 液态玻璃表面（页头胶囊、卡片底） | `width`/`height`/`borderRadius`、`shape`、`backdrop`、`distortionScale`、`displace`、`backgroundOpacity`、`blur` |
| `CountUp.astro` | 滚动数字（React Bits `CountUp` 原生移植） | `to`、`from`、`duration`、`delay`、`decimals`、`separator`、`prefix`、`suffix` |
| `ClickSpark.astro` | 点击处迸出火花（React Bits `ClickSpark` 原生移植） | `color`（默认跟随 `--accent`）、`size`、`radius`、`count`、`duration` |

`AcidSquares` 与 `TechText` 是 React Bits 同名组件的原生移植（不引入 React）。它们的渲染逻辑放在 `src/scripts/acid-squares.ts` 与 `src/scripts/tech-text.ts`：Astro 对 `<script>` 内大段模板字符串和 shader 的解析容易出问题（`?` 后直接跟模板字符串会报 `Expected a semicolon`，切分 shader 时漏一个反引号会报 `Unterminated string`），交给 vite 按模块编译最稳。组件本身只负责输出标记和挂载。

两者的配色都支持 `--token` 形式（如 `color="--bg-deep"`），运行时用 `getComputedStyle` 解析成 `rgb()`，所以深浅色切换不用改组件。`AcidSquares` 在主题切换时会重建实例（释放旧 WebGL 上下文），`TechText` 因为默认取 `currentColor`，只需重绘。

`TechText` 的 `sweep` 默认是 `true`（指针不在时自动巡航扫描），用作标题时建议关掉——否则标题会长期有一个字处于线框态，影响可读性。

`SpecularButton` 把 React Bits 的 `SpecularButton` 用原生 WebGL2 重写了一遍（不引入 React）：圆角矩形的周长被映射到 0–1 的参数空间，光斑是这个参数上的一个余弦瓣，鼠标靠近时瓣会滑到离指针最近的边缘点；`autoAnimate` 会让这道光自己绕一周。传 `href` 渲染成 `<a>`，否则是 `<button>`；浏览器不支持 WebGL2 时自动退化成普通玻璃按钮。

页面切换用 Astro 的 `<ClientRouter />`（View Transitions）：页头通过 `transition:persist` 保活，所以切页时导航胶囊里的高亮会平滑滑动而不会闪。

> 改组件时的两个坑：
> 1. Astro 会把体积小的 `<script>` 直接内联在组件**原位**（不是提到 `<head>`），所以组件里别写「只该跑一次」的脚本——同一页用 3 次就会内联 3 份。`CountUp` 因此只输出 `[data-count-up]` 标记，滚动逻辑统一放在 `Motion.astro`。
> 2. 自己写了 `display` 的元素会盖掉浏览器对 `[hidden]` 的 `display:none`（如灯箱 `.lightbox`、发现页 `.link-card`），要显式补一条 `X[hidden]{display:none}`。

> 注意：`src/components/BaseHead.astro` 里有一段极短的 `moveBefore` 兜底补丁。Chromium 137+ 的 `Element.moveBefore()` 不允许跨文档或把元素挪到 `<html>` 下，而 Astro 的 `transition:persist` 正好会这么做，不补丁会抛 `HierarchyRequestError` 导致点导航后地址栏不更新。等 Astro 上游修好后可以删掉这段。

## 深浅色与玻璃

页头右侧那个太阳/月亮按钮是**外观设置**，面板里有两组选项：

| 组 | 选项 | 落到 `<html>` 上 |
| --- | --- | --- |
| 主题 | 浅色 / 深色 / 跟随系统 | `data-theme="light\|dark"` |
| 玻璃 | 磨砂 / 透明 | `data-glass="frosted\|clear"` |

两个维度正交，可以任意组合（深色+透明、浅色+磨砂……）。**没选过时默认深色**；选「跟随系统」才交给系统决定。选择存在 `localStorage` 的 `ystlr:theme` 与 `ystlr:glass`，`data-theme-choice` 额外记住「跟随系统」这个意图，系统主题变化时会自动跟随。

实现上没有一处是"深色单独写一套样式"：所有颜色都在 `src/styles/global.css` 顶部的两段 `:root` token 里（浅色一段、`:root[data-theme='dark']` 一段），深色只是把同一批 token 换成另一组值，组件一行都不用改。玻璃同理——`--glass-bg` / `--glass-blur` / `--glass-brd` 这几个 token 在 `:root[data-glass='clear']` 下换成更淡的底色和更重的模糊。

想加自己的颜色：在 `:root` 里加变量，再在深色那段补一个对应值即可。`BaseHead.astro` 里有一小段内联脚本，在首屏渲染前就把 `data-theme` 落到 `<html>` 上，所以刷新时不会先白闪一下再变黑。

切换的动画是给 `<html>` 加 380ms 的 `is-theme-anim` 类，让 `background-color` / `color` / `border-color` 平滑过渡；`prefers-reduced-motion` 下自动关掉。

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
