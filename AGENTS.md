# 开发说明

- 框架：Astro 7 静态站点，Node.js ≥ 22.23.4。
- 本地预览：`npm run dev`；生产构建：`npm run build`；产物在 `dist/`。
- 文章内容位于 `src/content/blog/`，frontmatter 字段见 `src/content.config.ts`。
- 作品与曲目是数据文件：`src/data/projects.json`、`src/data/playlist.json`，由后台 `/admin` 直接改写；封面在 `src/assets/works/`，音频在 `public/audio/`。
- 后台 `/admin` 是纯静态页面，通过 GitHub API 提交 commit（逻辑在 `src/admin/`），没有服务端；不要往里放密钥。
- 部署：推送到 `main` 分支后，`.github/workflows/deploy.yml` 自动发布到 GitHub Pages。
- 官方文档：https://docs.astro.build
