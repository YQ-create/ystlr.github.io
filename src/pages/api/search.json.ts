// 构建期生成站内搜索索引：文章 + 知识 + 发现链接 + 主要页面。
// 只放检索必需字段；body 存 strip 后的正文片段，供前端做命中上下文定位。
import { getCollection } from 'astro:content';
import discoverData from '../../data/discover.json';

export const prerender = true;

const stripMd = (body?: string) =>
	(body ?? '')
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/[#>*_`~|-]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

const excerpt = (text: string, len = 500) => (text.length > len ? `${text.slice(0, len)}…` : text);

const posts = await getCollection('blog');
const notes = await getCollection('knowledge');
const links = discoverData.collections.flatMap((g) => g.links);

// 主要页面（站内导航入口）
const pages = [
	{ title: '首页', url: '/', desc: '站点首页：精选文章、主题、知识库与最近更新。' },
	{ title: '文章', url: '/blog', desc: '全部文章，按时间倒序排列，支持标签筛选与时间线视图。' },
	{ title: '知识库', url: '/knowledge', desc: '成体系的笔记与心得，按分类沉淀、按阶段推进。' },
	{ title: '发现', url: '/discover', desc: '收藏的书签、推荐站点与常逛的角落。' },
	{ title: '关于', url: '/about', desc: '关于作者与这个网站。' },
];

const items = [
	...posts
		.filter((p) => !p.data.draft)
		.map((p) => ({
			type: 'article' as const,
			title: p.data.title,
			desc: p.data.description,
			body: excerpt(stripMd(p.body), 500),
			tags: p.data.topics,
			date: p.data.pubDate.toISOString().slice(0, 10),
			url: `/blog/${p.id}/`,
		})),
	...notes
		.filter((n) => !n.data.draft)
		.map((n) => ({
			type: 'note' as const,
			title: n.data.title,
			desc: n.data.description ?? '',
			body: excerpt(stripMd(n.body), 500),
			tags: n.data.topics,
			date: n.data.pubDate.toISOString().slice(0, 10),
			category: n.data.category,
			stage: n.data.stage,
			url: `/knowledge/${n.id}/`,
		})),
	...links.map((l) => ({
		type: 'link' as const,
		title: l.name,
		desc: l.reason,
		body: '',
		tags: (l as { topics?: string[] }).topics ?? [],
		date: '',
		url: l.url,
	})),
	...pages.map((p) => ({
		type: 'page' as const,
		title: p.title,
		desc: p.desc,
		body: '',
		tags: [],
		date: '',
		url: p.url,
	})),
];

export const GET = () =>
	new Response(JSON.stringify({ generatedAt: new Date().toISOString(), items }), {
		headers: { 'content-type': 'application/json; charset=utf-8' },
	});
