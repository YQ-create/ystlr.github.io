// 站点实际用到的东西，用在首页「关于」区和 /about 页的 logo 循环带。
// glyph 是文字版 logo 的短符号，避免额外下载图片。
export interface StackItem {
	glyph: string;
	label: string;
	hint: string;
	href?: string;
}

export const STACK: StackItem[] = [
	{ glyph: '▲', label: 'Astro', hint: '静态站点框架', href: 'https://astro.build' },
	{ glyph: 'TS', label: 'TypeScript', hint: '全站类型', href: 'https://www.typescriptlang.org' },
	{ glyph: 'MD', label: 'Markdown', hint: '内容源', href: 'https://commonmark.org' },
	{ glyph: 'GH', label: 'GitHub', hint: '仓库与托管', href: 'https://github.com' },
	{ glyph: 'CI', label: 'Actions', hint: '自动构建', href: 'https://github.com/features/actions' },
	{ glyph: 'GL', label: 'WebGL', hint: '首页粒子场', href: 'https://www.khronos.org/webgl/' },
	{ glyph: 'GC', label: 'Giscus', hint: '文章评论', href: 'https://giscus.app' },
	{ glyph: 'NJ', label: 'Node.js', hint: '构建运行时', href: 'https://nodejs.org' },
	{ glyph: 'RS', label: 'RSS', hint: '订阅全文', href: 'https://ystlr.com/rss.xml' },
	{ glyph: 'CS', label: 'CSS', hint: '版式与动效' },
];
