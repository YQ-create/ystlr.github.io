# 开发说明

- 框架：Astro 7 静态站点，Node.js ≥ 22.23.4。
- 本地预览：`npm run dev`；生产构建：`npm run build`；产物在 `dist/`。
- 「精品」= 文章 frontmatter 的 `featured: true`，首页精选优先取它；`draft: true` 不进首页。
- 文章内容位于 `src/content/blog/`，照片墙记录位于 `src/content/gallery/`（图片本体放 `src/assets/gallery/`），frontmatter 字段见 `src/content.config.ts`。
- 加照片不要手搓两个文件：`npm run photo -- <图片或文件夹> [-t 标题] [-c 图注] [-g 标签] [-d 日期] [-n]`，脚本 `scripts/new-photo.mjs` 会压图（EXIF 摆正、长边 2400、去元数据）并生成同格式的 `.md`；`--remove <slug>` 删记录连带删图。产物与 `/admin` 上传、手写 Markdown 三者一致，改动其一必须同步另外两处。
- 发现页书签数据在 `src/data/discover.json`；顶部播放器曲目在 `src/data/playlist.json`，音频文件放入 `public/audio/`。
- 动效统一走 `src/components/Motion.astro` 的 data 属性（`data-reveal` / `data-glow` / `data-tilt` / `data-progress` / `data-count-up`）。首页背景是 `Topography.astro`（原生 WebGL2 地形等高线，fixed 在视口）；其余在用组件：`PillNav`（胶囊导航）、`AccordionGallery`（首页手风琴照片画廊）、`StarBorder`（主按钮）、`LogoLoop`（跑马灯）、`SpotlightCard`、`ChromaGrid`（照片墙）、`CountUp`、`ClickSpark`、`Shredder`（404）、`MusicPlayer`、`SiteSearch`、`SubmitPost`、`GradualBlur`（照片墙上下渐进模糊边缘）、`BranchedMenu`（知识库分叉树导航）、`PostCard` / `PostListItem` / `Giscus` / `FormattedDate`。全部原生实现，不引入 React / GSAP；`src/components/` 下不留未被引用的组件。
- 知识库 `/knowledge` 现有 11 条笔记（前端基础 / Web 原理 / 数据与存储 / 工程实践），按 `src/content/knowledge/*.md` 的 `category` 分组；空状态那份标注过的 BranchedMenu「导航样式预览」作为兜底保留，不写入 content 集合。索引栏分类树由 `BranchedMenu.astro` 输出，筛选 / 计数 / 滚动高亮靠 data 属性与 `bm:set-active` 事件联动；`[hidden]` 在 `display:flex` 元素上会失效，组件里已显式兜住。滚动高亮每次基于全部可见分区的实时位置重算（**不能只看本次 `entries`**），另有只在滚到底时触发的 passive scroll 兜底，`isAtBottom` 必须要求 `maxScroll > 0`，并用 `AbortController` 在 `astro:before-swap` 清理。新增笔记按「速查表 + 自写示例 + 容易踩的坑 + 参考链接」的格式；参考外部教程只借知识脉络、不搬原文，末尾标注来源。
- 大段 shader / 模板字符串不要把 Astro `<script>` 撑爆：解析很脆（`?` 后直接跟模板字符串、shader 少一个反引号都会编译失败），需要拆分时交给 vite 按模块编译（`src/scripts/*.ts`）。目前 `src/scripts/` 只有 `letter-reveal.ts`（首页逐字揭示；`splitChars()` 必须幂等，否则重复初始化会把每个字再包一层）。
- 背景性能约定：`Topography` 默认 30fps、滚动期间 15fps（指针移动 / 开场 / 点击脉冲时回 60fps），`dpr` 上限 1.5；背景 fixed 在视口，滚动时只有内容在动。别改回「每个区块各挂一个背景实例」。滚动回调里不要「先改 class 再读 `offsetHeight`」——每帧强制同步回流。所有 `astro:page-load` 初始化必须自带幂等保护，并在 `cleanups` 里成对移除监听器 / Observer / rAF。
- 组件里不要写「只该跑一次」的脚本：Astro 会按体积把小 `<script>` 内联在组件**原位**，同一页复用几次就有几份。逻辑放 Motion.astro，组件只输出 data 标记。
- 自己给元素写了 `display` 的话，`[hidden]` 会失效（UA 的 `display:none` 被盖掉），需要显式补 `X[hidden]{display:none}`。
- 本站是纯静态站点，没有服务端和数据库。`/admin` 是纯前端管理页（`src/admin/github.ts` + `app.ts`），用访问者自己粘贴的 GitHub PAT 调 API 提交文件，Token 只存 sessionStorage，任何情况下都不要把密钥写进仓库。手工发文同样可行：本地写 Markdown 后提交，GitHub Actions 自动构建上线。后台编辑器「左源码 + 右实时预览」，Markdown 渲染用 `app.ts` 里的轻量 `renderMarkdown`（不引入第三方库），预览框复用站点 `.prose` 样式。**预览走 `innerHTML`，所以 `inlineMarkdown()` 必须先 `escapeHtml()`、链接/图片 URL 再过 `safeUrl()` 协议白名单（挡 `javascript:` / `data:`）**，否则一段恶意 Markdown 就能读走 sessionStorage 里的 PAT。
- 站点**固定深色**：最终 token 在 `src/styles/global.css` 的 `body.studio`（底色 `#0b0b0c` / `--bg: 11,11,12`，强调色 `#ff6a2b`）；`BaseHead.astro` 的内联防白闪 `<style>` 与 `<meta name="theme-color">` 必须与之同色，否则 CSS 生效的一瞬会闪旧底色。`BaseHead.astro` 内联脚本写死 `data-theme="dark"`。不要再引入浅色 / 跟随系统的切换，也不要依赖 `document.documentElement.dataset.theme` 做浅色判断。
- 文章投稿：由 `src/consts.ts` 的 `SUBMIT_ENABLED` 控制（默认 `false`，不渲染入口）。开启后 `SubmitPost.astro` 把表单内容拼成 GitHub「新建 Issue」预填链接，访客用自己的账号确认提交，管理员在 Issues 里审核。**纯静态站绝不能把 PAT 写进客户端代码**——内联进前端 JS 的密钥会随构建产物公开泄露；若将来要自动建 Issue，必须走 Serverless 代理 / GitHub Actions，把密钥放服务端环境变量。
- 文章评论使用 Giscus；`src/components/Giscus.astro` 集中放置仓库与分类配置，未配置 `repoId` / `categoryId` 时评论区不渲染。
- 部署：推送到 `main` 分支后，`.github/workflows/deploy.yml` 自动发布到 GitHub Pages。
- 官方文档：https://docs.astro.build
