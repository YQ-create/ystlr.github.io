# 开发说明

- 框架：Astro 7 静态站点，Node.js ≥ 22.23.4。
- 本地预览：`npm run dev`；生产构建：`npm run build`；产物在 `dist/`。
- 「精品」= 文章 frontmatter 的 `featured: true`，首页精选优先取它；`draft: true` 不进首页。
- 文章内容位于 `src/content/blog/`，照片墙记录位于 `src/content/gallery/`（图片本体放 `src/assets/gallery/`），frontmatter 字段见 `src/content.config.ts`。
- 发现页书签数据在 `src/data/discover.json`；顶部播放器曲目在 `src/data/playlist.json`，音频文件放入 `public/audio/`。
- 动效统一走 `src/components/Motion.astro` 的 data 属性（`data-reveal` / `data-glow` / `data-tilt` / `data-progress` / `data-count-up`）；视觉组件为 `AcidSquares`（Hero 方格地面，WebGL2）、`TechText`（Hero 大标题，canvas 逐字绘制）、`SpecularButton`（流光玻璃按钮）、`DepthCarousel`（3D 照片轮播）、`Shredder`（404）、`GlassSurface`（液态玻璃表面）、`CountUp`（滚动数字）、`ClickSpark`（点击火花）。光源类组件都用 canvas/WebGL 自绘，不引入 React；`SpectralDrape` / `MaskedHeading` 目前未被引用，留着备用。
- 重型组件的渲染逻辑放 `src/scripts/*.ts`，组件只输出标记 + 挂载：Astro 对 `<script>` 内大段模板字符串/shader 解析很脆（`?` 后直接跟模板字符串、shader 少一个反引号都会编译失败），交给 vite 按模块编译。
- 组件里不要写「只该跑一次」的脚本：Astro 会按体积把小 `<script>` 内联在组件**原位**，同一页复用几次就有几份。逻辑放 Motion.astro，组件只输出 data 标记。
- 自己给元素写了 `display` 的话，`[hidden]` 会失效（UA 的 `display:none` 被盖掉），需要显式补 `X[hidden]{display:none}`。
- 本站是纯静态站点，没有服务端和数据库。`/admin` 是纯前端管理页（`src/admin/github.ts` + `app.ts`），用访问者自己粘贴的 GitHub PAT 调 API 提交文件，Token 只存 sessionStorage，任何情况下都不要把密钥写进仓库。手工发文同样可行：本地写 Markdown 后提交，GitHub Actions 自动构建上线。
- 文章评论使用 Giscus；`src/components/Giscus.astro` 集中放置仓库与分类配置，未配置 `repoId` / `categoryId` 时评论区不渲染。
- 部署：推送到 `main` 分支后，`.github/workflows/deploy.yml` 自动发布到 GitHub Pages。
- 官方文档：https://docs.astro.build
