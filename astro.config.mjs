// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig, fontProviders } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	// 自有域名：GitHub Pages 绑定 ystlr.com 后，站点绝对地址以此为准
	site: 'https://ystlr.com',
	// 静态输出：构建产物为纯 HTML/CSS/JS，可直接发布到 GitHub Pages
	output: 'static',
	build: {
		// 目录式 URL（/blog/post/），与 GitHub Pages 的目录结构保持一致
		format: 'directory',
	},
	integrations: [
		mdx(),
		// /admin 是纯前端后台：noindex，也不进 sitemap
		sitemap({
			filter: (page) => !new URL(page).pathname.startsWith('/admin'),
		}),
	],
	fonts: [
		// 展示体：高对比衬线（英文/数字），中文由宋体兜底
		{
			provider: fontProviders.local(),
			name: 'Bodoni Moda',
			cssVariable: '--font-display',
			fallbacks: [],
			options: {
				variants: [
					{
						src: ['./src/assets/fonts/bodoni-moda-400.woff2'],
						weight: 400,
						style: 'normal',
						display: 'swap',
					},
					{
						src: ['./src/assets/fonts/bodoni-moda-400-italic.woff2'],
						weight: 400,
						style: 'italic',
						display: 'swap',
					},
				],
			},
		},
		// 正文字体：Hanken Grotesk（variable，一个文件覆盖 400–600）
		{
			provider: fontProviders.local(),
			name: 'Hanken Grotesk',
			cssVariable: '--font-sans',
			fallbacks: [],
			options: {
				variants: [
					{
						src: ['./src/assets/fonts/hanken-grotesk-var.woff2'],
						weight: '400 600',
						style: 'normal',
						display: 'swap',
					},
				],
			},
		},
	],
});
