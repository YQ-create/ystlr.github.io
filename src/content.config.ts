import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const blog = defineCollection({
	// Load Markdown and MDX files in the `src/content/blog/` directory.
	loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
	// Type-check frontmatter using a schema
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			description: z.string(),
			// Transform string to Date object
			pubDate: z.coerce.date(),
			updatedDate: z.coerce.date().optional(),
			heroImage: z.optional(image()),
			tags: z.array(z.string()).default([]),
			// 首页「精选文章」优先展示 featured: true 的几篇，不够再用最新的补
			featured: z.boolean().default(false),
			draft: z.boolean().default(false),
		}),
});

// 照片墙：每一张照片对应一条记录，date 为拍摄日期，用于按年、月分组排版。
const gallery = defineCollection({
	loader: glob({ base: './src/content/gallery', pattern: '**/*.md' }),
	schema: ({ image }) =>
		z.object({
			title: z.string().optional(),
			date: z.coerce.date(),
			image: image(),
			caption: z.string().optional(),
			tags: z.array(z.string()).default([]),
		}),
});

// 知识库：独立于文章的笔记/知识条目，可带分类与标签，用于「知识库」页。
const knowledge = defineCollection({
	loader: glob({ base: './src/content/knowledge', pattern: '**/*.{md,mdx}' }),
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			description: z.string().optional(),
			pubDate: z.coerce.date(),
			updatedDate: z.coerce.date().optional(),
			// 分类（如「前端」「工具」「阅读」），用于知识库页分组
			category: z.string().default('未分类'),
			tags: z.array(z.string()).default([]),
			// 置顶
			pinned: z.boolean().default(false),
			draft: z.boolean().default(false),
			// 封面图（可选）
			cover: z.optional(image()),
		}),
});

export const collections = { blog, gallery, knowledge };
