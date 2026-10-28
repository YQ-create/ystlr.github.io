# 开发说明

- 框架：Astro 7 静态站点，Node.js ≥ 22.23.4。
- 本地预览：`npm run dev`；生产构建：`npm run build`；产物在 `dist/`。
- 文章内容位于 `src/content/blog/`，照片墙记录位于 `src/content/gallery/`，frontmatter 字段见 `src/content.config.ts`。
- 发现页书签数据在 `src/data/discover.json`；顶部播放器曲目在 `src/data/playlist.json`，音频文件放入 `public/audio/`。
- 本站是纯静态站点，没有服务端、数据库或网页后台；发文流程为本地写 Markdown，提交代码后由 GitHub Actions 自动构建上线，不要在源码里放密钥。
- 文章评论使用 Giscus；`src/components/Giscus.astro` 集中放置仓库与分类配置，未配置 `repoId` / `categoryId` 时评论区不渲染。
- 部署：推送到 `main` 分支后，`.github/workflows/deploy.yml` 自动发布到 GitHub Pages。
- 官方文档：https://docs.astro.build
