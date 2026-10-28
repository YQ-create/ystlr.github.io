// 作品数据：内容存放在 projects.json（后台 /admin 会直接改写这个文件），
// 封面图存放在 src/assets/works/，按文件名自动匹配并由 Astro 构建时压缩成 webp。
//
// 不要在页面里硬编码作品：新增 / 修改作品请用 /admin，或直接编辑 projects.json。

import type { ImageMetadata } from 'astro';
import rawProjects from './projects.json';

export interface Project {
	id: string;
	title: string;
	description: string;
	tags: string[];
	year: string;
	/** 构建时解析出的封面图资源 */
	cover: ImageMetadata;
	/** src/assets/works/ 下的文件名，便于后台对照 */
	coverFile: string;
	link: string;
}

interface RawProject {
	id?: string;
	title: string;
	description: string;
	tags?: string[];
	year?: string;
	cover: string;
	link?: string;
}

// 构建时把 src/assets/works 下所有图片打包成映射表，文件名 → ImageMetadata
const coverModules = import.meta.glob<{ default: ImageMetadata }>(
	'/src/assets/works/*.{jpg,jpeg,png,webp,avif}',
	{ eager: true },
);

function resolveCover(file: string): ImageMetadata | undefined {
	if (!file) return undefined;
	const key = file.startsWith('/') ? file : `/src/assets/works/${file}`;
	return coverModules[key]?.default;
}

export const projects: Project[] = (rawProjects as RawProject[]).flatMap((item) => {
	const cover = resolveCover(item.cover);
	if (!cover) {
		console.warn(`[projects] 找不到封面图 src/assets/works/${item.cover}，已跳过「${item.title}」`);
		return [];
	}
	return [
		{
			id: item.id ?? item.cover,
			title: item.title,
			description: item.description ?? '',
			tags: item.tags ?? [],
			year: item.year ?? '',
			cover,
			coverFile: item.cover,
			link: item.link ?? '',
		},
	];
});
