// 作品 / 项目列表：新增项目就在这里追加一条。
// link 填仓库或线上地址，留空字符串则不显示跳转。

export interface Project {
	title: string;
	description: string;
	tags: string[];
	year: string;
	link: string;
}

export const projects: Project[] = [
	{
		title: 'ystlr 个人博客',
		description: '基于 Astro 搭建的静态个人站点，Markdown 写作，自动部署到 GitHub Pages，绑定自有域名。',
		tags: ['Astro', '静态博客', 'GitHub Pages'],
		year: '2026',
		link: 'https://github.com/',
	},
	{
		title: '待补充：第一个小工具',
		description: '在这里介绍你完成过的项目、开源作品或实验性尝试：解决了什么问题、用了什么技术、取得了什么结果。',
		tags: ['示例'],
		year: '2025',
		link: '',
	},
	{
		title: '待补充：第二件作品',
		description: '卡片会按这份列表顺序展示。可以替换成课程作业、毕业设计、个人项目或参与过的协作成果。',
		tags: ['示例'],
		year: '2025',
		link: '',
	},
];
