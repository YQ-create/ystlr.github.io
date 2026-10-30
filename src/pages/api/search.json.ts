// 构建期生成站内搜索索引：文章 + 知识库 + 照片标题。
// 只放检索必需字段，体积可控（几十条内容也就几十 KB），前端首次打开搜索时再拉取。
import { getCollection } from 'astro:content';

export const prerender = true;

const stripMd = (body?: string) =>
	(body ?? '')
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/[#>*_`~|-]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

const excerpt = (text: string, len = 120) => (text.length > len ? `${text.slice(0, len)}…` : text);

const posts = await getCollection('blog');
const notes = await getCollection('knowledge');
const photos = await getCollection('gallery');

const items = [
	...posts
		.filter((p) => !p.data.draft)
		.map((p) => ({
			type: 'article' as const,
			title: p.data.title,
			desc: p.data.description,
			body: excerpt(stripMd(p.body), 160),
			tags: p.data.tags,
			date: p.data.pubDate.toISOString().slice(0, 10),
			url: `/blog/${p.id}/`,
		})),
	...notes
		.filter((n) => !n.data.draft)
		.map((n) => ({
			type: 'note' as const,
			title: n.data.title,
			desc: n.data.description ?? '',
			body: excerpt(stripMd(n.body), 160),
			tags: n.data.tags,
			date: n.data.pubDate.toISOString().slice(0, 10),
			category: n.data.category,
			url: `/knowledge/${n.id}/`,
		})),
	...photos.map((p) => ({
		type: 'photo' as const,
		title: p.data.title ?? p.data.caption ?? '照片',
		desc: p.data.caption ?? '',
		body: '',
		tags: p.data.tags,
		date: p.data.date.toISOString().slice(0, 10),
		url: '/gallery/',
	})),
].sort((a, b) => (a.date < b.date ? 1 : -1));

export const GET = () =>
	new Response(JSON.stringify({ generatedAt: new Date().toISOString(), items }), {
		headers: { 'content-type': 'application/json; charset=utf-8' },
	});
