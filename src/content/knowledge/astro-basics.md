---
title: 'Astro 静态站点与内容集合速查'
description: '岛屿架构、内容集合的 schema 与 getCollection、静态路由：本站这套结构的运作方式。'
pubDate: 2026-11-09
category: '后端运行时'
tags: ['实战', '运行时']
pinned: false
draft: false
---

Astro 默认**把组件在构建期渲染成 HTML，客户端不加载任何框架运行时**；只有明确标记为交互的「岛屿」才带上 JS。这个默认零 JS 的取向，决定了它的写法和 SPA 框架很不一样。

## 三种「脚本」别混

```astro
---
// ① frontmatter：构建期在服务端跑，可以用 await / 读文件 / 调 API
import { getCollection } from 'astro:content';
const notes = await getCollection('knowledge');
const total = notes.length;
---
<h1>共 {total} 条</h1>

<script>
  // ② 组件脚本：打包发给浏览器，Astro 会处理内联与复用
  document.addEventListener('astro:page-load', init);
</script>

<style>
  /* ③ 默认作用域限定在本组件内 */
  h1 { color: red; }
</style>
```

| 位置 | 何时执行 | 能做什么 |
| --- | --- | --- |
| `---` frontmatter | 构建期 | `await`、访问文件系统、import 服务端模块 |
| `<script>` | 浏览器 | DOM 事件、客户端状态 |
| `client:*` 岛屿 | 浏览器（按需水合） | 用 React/Vue/Svelte 组件做交互 |

**不要把浏览器 API（`window`、`document`）写进 frontmatter**，构建时它们并不存在；反过来，构建期算好的数据也不会自动同步到客户端脚本，需要显式序列化到 DOM 上。

## 内容集合

```ts
// src/content.config.ts
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const knowledge = defineCollection({
  loader: glob({ base: './src/content/knowledge', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    title: z.string(),
    pubDate: z.coerce.date(),
    category: z.string().default('未分类'),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

export const collections = { knowledge };
```

```astro
---
import { getCollection, render } from 'astro:content';
const notes = (await getCollection('knowledge'))
  .filter((n) => !n.data.draft)
  .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
const { Content, headings } = await render(notes[0]);
---
<Content />
```

| 概念 | 说明 |
| --- | --- |
| `loader: glob()` | 从目录收集 Markdown，文件名即 `entry.id` |
| `schema` | Zod 校验 frontmatter，写错字段构建直接失败 |
| `getCollection()` | 取全部条目，`data` 是校验后的 frontmatter，`body` 是原始正文 |
| `render()` | 返回 `Content` 组件与 `headings`（可生成页内目录） |
| `getEntry()` | 按 id 取单条 |
| `image()` | 校验并优化本地图片引用 |

**集合是内容驱动页面的关键**：加一个 `.md` 文件，列表页、详情页、搜索索引都会自动更新，不需要维护一份手写目录。

## 路由与渲染模式

```
src/pages/index.astro              → /
src/pages/about.astro              → /about/
src/pages/blog/[slug].astro        → /blog/:slug/  (需 getStaticPaths)
src/pages/api/search.json.ts       → /api/search.json
```

```astro
---
export async function getStaticPaths() {
  const notes = await getCollection('knowledge');
  return notes.map((note) => ({
    params: { slug: note.id },
    props: { note },
  }));
}
---
```

| 模式 | 配置 | 产物 |
| --- | --- | --- |
| 静态（默认） | `output: 'static'` | 构建期生成 HTML，可托管到任意静态空间 |
| 服务端 | `output: 'server'` + adapter | 按请求渲染，需要 Node / 云函数运行时 |
| 混合 | 部分页面 `export const prerender = true` | 两种共存 |

接口路由（`.ts` / `.js` 文件）导出 `GET` / `POST` 返回 `Response`；静态模式下要写 `export const prerender = true`，否则构建期无法确定内容。

## 容易踩的坑

- **往 `src/pages/` 放非页面文件**：每个文件都会变成一条路由，工具函数要放 `src/scripts/` 或 `src/utils/`。
- **动态路由忘了 `getStaticPaths`**：静态构建时直接报错，不知道该生成哪些页。
- **frontmatter 里用 `window` / 读 DOM**：构建在 Node 里跑，必然失败。
- **`<script>` 在组件里复用多次**：小脚本会被内联到组件原位，一份组件渲染几次就有几份；逻辑要集中并做幂等保护。
- **加了 `ClientRouter` 却没清理监听**：SPA 换页时旧的监听器 / Observer / rAF 会累积，需要在 `astro:before-swap` 成对移除。
- **schema 里日期没用 `z.coerce.date()`**：拿到字符串后调用 `.toISOString()` 会报错。
- **给静态站点配了需要服务端的写法**：表单提交、SSR API 在纯静态托管上不会执行，要么走构建期数据，要么用外部服务。
- **`client:load` 到处加**：岛屿越多发到浏览器的 JS 越多，先想想能不能用原生 `<script>` 或纯 CSS 解决。

## 参考

依据 [Astro Docs · Getting Started](https://docs.astro.build/en/getting-started/) 与 [Astro Docs · Content Collections](https://docs.astro.build/en/guides/content-collections/) 的知识脉络整理。本文为要点归纳与自写示例，可直接对照本站 `src/content.config.ts`、`src/pages/knowledge/` 下的实现。
