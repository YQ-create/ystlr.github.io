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
		sitemap(),
	],
	fonts: [
		{
			provider: fontProviders.local(),
			name: 'Atkinson',
			cssVariable: '--font-atkinson',
			fallbacks: ['sans-serif'],
			options: {
				variants: [
					{
						src: ['./src/assets/fonts/atkinson-regular.woff'],
						weight: 400,
						style: 'normal',
						display: 'swap',
					},
					{
						src: ['./src/assets/fonts/atkinson-bold.woff'],
						weight: 700,
						style: 'normal',
						display: 'swap',
					},
				],
			},
		},
	],
});
