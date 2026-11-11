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
| 首页 | `/` | Hero、滚动展开画面、3D 照片环廊、关于这里、精选文章、知识库 / 发现 / 关于入口 |
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

整站是「近黑台面 + 亮橙强调」的编辑感设计：底色 `#0b0b0c`，强调色 `#ff6a2b`，展示字体 `Bodoni Moda`（衬线，中文由宋体兜底）、正文 `Geist`（变量字重 100–900）、编辑体 `Newsreader`（300–500，含斜体，只给短句 / 标签 / 引文用），三套字体都本地化在 `src/assets/fonts/`。默认背景是 `src/scripts/gradient-ascii.ts` 的 WebGL2 字符光场（fixed 在视口，滚动时内容从上面滑过）：首页深色首屏是「暗日」字符环，内容页与浅色模式退回右上角的字符雾；`Topography.astro` 的地形等高线保留为调色盘里的可选项。常规入场动效由 `src/components/Motion.astro` 统一驱动，页面里只写 data 属性：

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
| `GradientASCII`（`src/scripts/`） | 默认的全站字符光场：字符图集 + Lab 色带 + 指针解码轨迹 + 点击波纹，四段式 GLSL（场 → 光晕 → 模糊 → 合成）；首页深色用 `eclipse` 字符环，其余用 `horizon` | `colors`、`shape`、`cellSize`、`density`、`glyphOpacity`、`glow`、`speed`、`scale`、`lightMode` |
| `Topography.astro` | 可选的整页地形等高线背景（WebGL2 噪声高度场 + Bloom + 指针抬升）；默认不初始化，只有调色盘切到「等高线」才建上下文 | `color`、`lineCount`、`elevation`、`tilt`、`fog`、`glow`、`brightness`、`fps` / `scrollFps`、`dpr` |
| `AccordionGallery.astro` | 首页「01 / 关于这里」的手风琴照片画廊（hover 展开、其余灰度收窄） | `items`、`height`、`gap`、`radius`、`expandRatio`、`orientation`、`trigger`、`grayscale` |
| `StarBorder.astro` | 主按钮的描边光效容器 | `surface`、`text`、`color`、`radius` |
| `LogoLoop.astro` | 首页 / 关于页的横向徽标跑马灯 | `items`、`speed`、`boost`、`pauseOnHover` |
| `SpotlightCard.astro` | 指针跟随的聚光卡片 | 见组件 Props |
| `CountUp.astro` | 滚动数字 | `to`、`from`、`duration`、`decimals`、`prefix`、`suffix` |
| `ClickSpark.astro` | 点击处迸出火花 | `color`（默认跟随 `--accent`）、`size`、`radius`、`count` |
| `Shredder.astro` | 404 页的碎纸机互动 | `title`、`message`、`actionLabel`、`width`、`height` |
| `SiteSearch.astro` | 站内搜索浮层（⌘K / Ctrl+K） | — |
| `MusicPlayer.astro` | 顶部播放器，`transition:persist` 保活、切页不中断 | 曲目在 `src/data/playlist.json` |
| `SubmitPost.astro` | 投稿弹窗，由 `SUBMIT_ENABLED` 控制 | — |
| `BranchedMenu.astro` | 带分叉 SVG 连线的可折叠树形导航（知识库左侧索引），活动条目用强调色「画」出连线 | `items`、`defaultOpen`、`activeValue`、`preview`、`forceTree`、`rowHeight`、`indent`、`trunk`、`radius` |
| `AppearancePanel.astro` | 页头雾面调色盘：深浅色 / 强调色 / 雾面与透明色 / 四种背景模式 / 底图库 | 逻辑在 `src/scripts/appearance.ts` |
| `ScrollExpand.astro` | 首页滚动展开区块：圆角小窗随滚动铺满全屏，画面同时**一路推近**（不回缩）。媒体可以是图，也可以是 `video`（首页现在是雾湖小船那段） | `src`（图 / poster）、`video`、`title`、`hint`、`startWidth` / `startHeight`、`startRadius`、`startWidthMobile` / `startHeightMobile` / `startRadiusMobile`、`fitBox`、`zoomTo`、`scrollDistance`、`holdDistance`、`smoothing` |
| `CircularCarousel.astro` | 首页 3D 照片环廊：照片切成 8 条贴在圆柱面上，漂移自转 / 惯性拖拽 / 景深渐隐 / 数字卷轴字幕 | `items`、`preset`、`intro`、`cardWidth`、`gap`、`autoplay`、`speed`、`captions`、`depthFade`、`innerShade`（逻辑在 `src/scripts/circular-carousel.ts`） |
| `DockNav.astro` | 底部居中磨砂 dock：斜体衬线标签按需展开、数字缩成上标、菜单向上弹出；全站唯一导航（页头只留身份与工具） | 导航项写死在组件里；逻辑在 `src/scripts/dock-nav.ts` |
| `GlassGrid.astro` | 照片墙的 WebGL 网格：骨架流光 → 静帧淡入、悬停推近、32-tap 毛玻璃角标、上下 8% 折射带、点击灯箱 | `items`（`src`/`big`/`title`/`meta`/`label`/`ar`，可选 `video`）；逻辑在 `src/scripts/glass-grid.ts` |
| `StudioHero.astro` | 关于页首屏：PMREM 黑房间里的镀铬机器人 + 居中衬线标题 + 横向无限文字轨道（椭圆禁区把每行顶开再放回） | `stats`；逻辑在 `src/scripts/studio-hero.ts` |
| `Rain.astro` | 首页雨滴层：远景斜雨 + 近景玻璃水珠（缓滑带水痕），fixed 在背景之上、正文之下，滚出首屏淡出停帧 | 无 props；参数在 `src/scripts/rain.ts` 顶部常量与 `PALETTES` |
| `PostCard` / `PostListItem` / `Giscus` / `FormattedDate` | 文章卡、列表项、评论、日期 | — |

**照片环廊的数据与几何**：条目全部来自 `src/content/gallery`（`getImage` 转 900px webp），不引用组件自带的 Unsplash 示例图；早期照片记录没有标题/图注，字幕用「帧 NN + 拍摄年月」兜底，纯数字标题也被过滤。圆柱切片的位移、倾角、半径与包围盒缩放都在**构建期**算好写进 DOM，运行时只有一个 rAF 循环，每帧只写 7 个卡片的 transform 与 `--cc-depth`，不碰 112 个 tile。窄屏（容器 < 700px）放宽水平余量，让环两侧自然溢出裁切，避免整圈被缩成一排缩略图。交互：指针拖拽 / 横向滚轮 / 方向键 / Home·End / 点卡片聚焦；`cc:change` 与 `cc:item-click` 供外部联动。

`BranchedMenu` 用在 `/knowledge` 左侧索引：数据来自 `groups`（分类 → 笔记），条目带 `data-kb-link` / `data-tags`，所以标签筛选、分组计数、滚动高亮都沿用页面原有脚本；滚动到某分类时页面派发 `bm:set-active` 事件，组件把该分类首个可见条目点亮并绘制强调色分叉线。知识库现有 39 条笔记（6 个分类）；标签筛选已移到页面右端的 `.kb-tags`（阶段 / 主题两组），左栏只留分类树，正文按「分类 → 阶段」两级分组。空状态那份明确标注的「导航样式预览」（`preview` + `forceTree`）作为兜底保留，它不写入 content 集合、不生成假详情页。组件在窄屏（≤980px）自动退化成横滑胶囊，标题点击从「折叠」改为「锚点跳转」，预览态用 `forceTree` 保持完整树。

**滚动高亮的判定**：观察带是页头下方 96px 到视口 38% 高处。每次回调都基于所有可见分区的实时 `getBoundingClientRect()` 取重叠面积最大者 —— 不能只从本次 `entries` 里按 `intersectionRatio` 挑，否则某个分区「进入」时会顶掉仍占着观察带的分区（分类变多后很直观：滚到「Web 原理」却高亮「数据与存储」）。页面较短时跳到最后一组会被滚动上限钳制、观察器不再回调，所以额外有一个**只在滚到底时**才重算的 passive scroll 兜底（正常滚动不读布局），并用 `AbortController` 在 `astro:before-swap` 清理。`isAtBottom()` 必须要求页面确实可滚动（`maxScroll > 0`），否则内容还没撑开时会被误判成「已到底」。

## 外观调色盘

页头右侧的调色板按钮打开雾面浮层，偏好存 `localStorage['ystlr.appearance']`，**首屏由 `BaseHead.astro` 的内联脚本同步**（`<head>` 里、CSS 生效前），所以浅色用户不会看到深色闪一下。View Transitions 换页时 `astro:after-swap` 会再同步一次。

| 分组 | 做什么 |
| --- | --- |
| 主题 | 深色 / 浅色 / 跟随系统，写 `html[data-theme]`、更新 `theme-color` 与 `color-scheme` |
| 强调色 | 6 套，写 `html[data-accent]`，覆盖 `--accent` 三兄弟 |
| 雾面质感 | 磨砂 / 透明 / 实色三档（写 `data-glass` 改 `--glass-alpha-preset`）+ 滑块写 `--glass-alpha-user` / `--glass-blur-user` |
| 背景 | `ascii`（字符光场，默认）/ `topo` / `image` / `plain`，写 `html[data-bg-mode]`；旧偏好里没有 `schema:2` 的 `topo` 会跟随迁移到 `ascii` |
| 底图库 | 粘贴 URL 或本地上传（Blob 存 IndexedDB `ystlr-appearance/images`），支持设为底图、替换、删除；遮罩浓度滑块 |

几个必须知道的约定：

- **玻璃变量**：`--glass-bg` 在 `:root` / `:root[data-theme='light']` / `.studio` / `.studio[data-theme='light']` 四处各写一份完整的 `rgba(var(--glass-rgb), var(--glass-alpha-user, var(--glass-alpha-preset)))`。不能抽成中间变量 `--glass-alpha` 再从 `.studio` 覆盖 —— 自定义属性在**声明它的元素**上求值，那样 `.studio` 里改预设不会生效。
- **`backdrop-filter` 只写标准声明，不要成对写 `-webkit-` 版**：Astro 的 CSS 构建会把成对声明压成纯 `-webkit-backdrop-filter`，而新版 Chrome 已不认该别名（实测 computed 为 `none`，全站毛玻璃会静默失效）。`astro.config.mjs` 里 `vite.build.cssTarget: 'esnext'` 保证产物保留标准声明。构建后应能统计到标准声明 > 0、纯前缀 = 0。
- **背景模式互斥**：`.site-bg`（在 `BaseLayout.astro`）是全站 `fixed; z-index:-1` 的底图层；非 `topo` 模式会把 `body` 背景透出来、隐藏首页 `.page__topo`。`ascii` 是默认模式，`appearance.ts` 会 `import()` 那份 WebGL 代码；`topo` 反而改成按需 —— `Topography.astro` 只在 `data-bg-mode="topo"` 时才建上下文，切走时销毁并清掉 `data-topo-ready`。
- **字符光场的遮罩**：`.site-bg__ascii` 用 64%×58% 的径向 mask 把光场收在右上，`::after` 再压掉顶部 17%，保证固定页头和大标题干净；`html[data-bg-mode='ascii'] .site-bg__veil` 保留 `--bg-overlay × 0.3` 的薄底，别把遮罩层整个关掉。
- **ASCII 降帧**：`src/scripts/gradient-ascii.ts` 沿用 Topography 的闸门 —— 环境 30fps、滚动 15fps、开场/指针/点击才 60fps，dpr 上限 1.5。别把闸门去掉，它会和滚动抢 GPU。
- **底图 objectURL**：每张本地图一个 URL 长期缓存，只在替换/删除时 `revokeObjectURL`。别用单个变量复用，否则渲染缩略图时会把正在当底图用的 URL 回收掉。
- 面板 DOM 由 JS 动态创建的节点（底图列表）**没有 Astro 的 scope 属性**，那一组样式必须写 `:global()`，否则一条都不命中。
- `ScrollExpand` 用窗口滚动 + sticky track，`astro:before-swap` 销毁、`astro:page-load` 重建；`prefers-reduced-motion` 下跳过平滑插值，视频改为 seek 到第 2 秒的静态帧。
- `ScrollExpand` 的展开是「媒体尺寸跟着框长」而不是单纯 scale：竖屏下满屏 cover 会把 16:9 裁成一条竖缝，小窗里就只剩一片雾。所以别改成「固定满屏 + scale」，要保留宽高跟着框走。
- 开场视频放 `public/videos/`（原片 1912×1080 / 14MB 压成 720p / 3.3MB），`preload="metadata"`，首屏只拉 ~96KB 头信息；进视口才 `play()`，滚出去 `pause()`。
- `CircularCarousel` 的 rAF 只在环廊进入视口、页面可见且没有 hover 暂停时跑（`IntersectionObserver` + `visibilitychange` + `pauseOnHover`），`drift` 自转常驻但不代表页面滚到哪里都在算。`prefers-reduced-motion` 下关掉开场、视差、拉伸与自动播放，只保留静态一圈与键盘/拖拽切换。所有监听器共用一个 `AbortController`，`astro:before-swap` 统一销毁；`initCircularCarousel()` 自带 `bound` 幂等锁，同页多实例也只注册一次事件。
- `Rain` 是**一块** fixed 画布，不是每个区块各挂一层：dpr 上限 1.75、帧率上限 45；滚过首屏 90% 高度整层 `opacity` 归零并 `cancelAnimationFrame`，滚回来才续帧。雨丝只在原地转动一次画布坐标系后 `drawImage` 一张预渲染贴图（水珠、水痕同理），不要在每帧里 `createLinearGradient`。`prefers-reduced-motion` 下只画一帧静态水珠、不跑 rAF；主题切换靠 `MutationObserver` 监听 `html[data-theme]` 重建贴图，别每帧去读 `getComputedStyle`。

## 知识库笔记

`src/content/knowledge/*.md` 是独立于文章的成体系笔记，frontmatter 见 `src/content.config.ts`：`title` / `description` / `pubDate` / `category` / `tags` / `pinned` / `draft` / `cover`（可选）。`category` 决定索引栏分组，分组顺序按「该分类置顶数 → 分类名」；每个大类内部再按 `tags` 里的阶段分成若干小组。

**标签约定**：`tags` 固定写成 `[阶段, 主题]` 两个值 —— 阶段取 `入门 / 核心 / 进阶 / 实战`，主题取 `前端 / 网络 / 数据 / 工具 / 运行时 / 算法`。这 10 个值在 `/knowledge` **页面右端**的 `.kb-tags` 里组成「阶段 / STAGE」与「主题 / TOPIC」两组筛选按钮（顺序写死，不再全量聚合技术名词），左栏只放分类树。筛选沿用卡片与索引条目的 `data-tags`，空阶段小组会随筛选一起隐藏。新增笔记时**不要引入新标签值**，否则右端栏会重新膨胀；明细检索交给站内搜索与卡片标题。

写作约定：

- **速查 / 要点型**，不是教程全文：概念速查表 + 自写示例 + 「容易踩的坑」+ 参考链接。
- 参考外部教程时（当前这批参照 [菜鸟教程](https://www.runoob.com/) 的对应章节脉络）**只借用知识结构，不复制原文段落**；每篇末尾写明原教程链接与「要点归纳、示例自行编写」的声明。
- 正文用 `.prose` 渲染，支持表格、代码块（`pre` 带横向滚动）、行内代码；`h2` / `h3` 会自动进详情页的 ON THIS PAGE 目录。
- 写完跑 `npm run build`：确认详情页数量与笔记数一致、目录树每条都能跳转、移动端无横向溢出。

**照片墙**（`/gallery`）是一块 fixed 全视口画布 + 一块占位 div：画布自己按 `window.scrollY` 缓动位移，占位高度撑开文档流，滚过网格后整层淡出让位给页脚。上下 8% 的折射带只取三次 sample（红/绿/蓝各错一点），别改回「9 次按通道加权求和」——那会把整条带压成彩虹。tile 的静帧用 `cover` 映射到 16:9，视频位（`item.video`）已留好，有视频时 `uMix` 在静帧与视频之间交叉淡化。

`Topography.astro`（约 1600 行）与 `src/scripts/gradient-ascii.ts`（约 930 行）各带一套完整 shader，都是原生 WebGL2。Astro 对 `<script>` 内大段模板字符串和 shader 的解析比较脆（`?` 后直接跟模板字符串会报 `Expected a semicolon`，切分 shader 漏一个反引号会报 `Unterminated string`），所以这两套渲染逻辑都放在模块里交给 vite 编译。`src/scripts/` 现有 `letter-reveal.ts`（首页逐字揭示；`splitChars()` 必须幂等，否则 View Transitions 重复初始化会把每个字再包一层）、`appearance.ts`、`gradient-ascii.ts`、`circular-carousel.ts`（照片环廊运行时，约 500 行，同样走模块编译而不是塞进组件 `<script>`）、`rain.ts`、`dock-nav.ts`、`glass-grid.ts`、`studio-hero.ts`。

**three.js 是唯一的第三方渲染依赖**（0.160，`npm i three`），只被 `GlassGrid` 与 `StudioHero` 两个组件静态引入，所以只会打进 `/gallery` 与 `/about` 两个页面的 chunk，别的页面不加载。别在 `Motion.astro` 或全站脚本里 `import 'three'`。

**背景性能约定（改动前先读）**：`Topography` 与 `GradientASCII` 都默认 30fps、滚动期间 15fps，指针移动 / 开场 / 点击脉冲时回到 60fps，`dpr` 上限 1.5；两者都 fixed 在视口里，滚动时只有内容在动、背景不重画整页。这是滚轮顺滑的关键，别改回「每个区块各挂一个背景实例」。滚动回调里也不要「先改 class 再读 `offsetHeight`」——那会每帧强制同步回流。字符光场另有 `IntersectionObserver` + `visibilitychange` 双闸门，滚出视口 / 切到后台就停帧。

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
