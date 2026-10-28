// 作品 / 项目列表：新增作品就在这里追加一条。
// cover 为作品封面图；link 填仓库或线上地址，留空字符串则不显示跳转。
// 替换封面：把新图放进 src/assets/works/ 并修改下方 import。

import type { ImageMetadata } from 'astro';
import work1 from '../assets/works/work-1.jpg';
import work2 from '../assets/works/work-2.jpg';
import work3 from '../assets/works/work-3.jpg';
import work4 from '../assets/works/work-4.jpg';
import work5 from '../assets/works/work-5.jpg';
import work6 from '../assets/works/work-6.jpg';

export interface Project {
	title: string;
	description: string;
	tags: string[];
	year: string;
	cover: ImageMetadata;
	link: string;
}

export const projects: Project[] = [
	{
		title: '立体方块视觉系统',
		description: '以几何方块为核心元素的品牌视觉探索，撞色搭配与 3D 立体表达，可延展为海报与包装图形。',
		tags: ['品牌视觉', '3D 图形'],
		year: '2026',
		cover: work1,
		link: '',
	},
	{
		title: '紫境吉他主题视觉',
		description: '云雾森林中的吉他场景插画，用氛围光影表达音乐与想象力，适合作为音乐类主视觉。',
		tags: ['插画', '场景概念'],
		year: '2026',
		cover: work2,
		link: '',
	},
	{
		title: '糖果造型主视觉',
		description: '马卡龙色系的甜品造型堆叠，柔和质感与浪漫配色，面向消费品与社交传播场景。',
		tags: ['3D 渲染', '消费品'],
		year: '2025',
		cover: work3,
		link: '',
	},
	{
		title: '流体抽象壁纸系列',
		description: '半透明曲面缠绕的抽象数字艺术，深色背景下的层次与高光，可输出为壁纸与背景素材。',
		tags: ['数字艺术', '抽象'],
		year: '2025',
		cover: work4,
		link: '',
	},
	{
		title: '香水产品视觉',
		description: '暗调产品渲染，荧光绿标签点缀，聚焦瓶体质感与轮廓高光，用于品牌宣传物料。',
		tags: ['产品渲染', '品牌'],
		year: '2025',
		cover: work5,
		link: '',
	},
	{
		title: '极简空间记录',
		description: '自然光下的室内一角，克制的灰白与木色，练习日常空间与产品氛围摄影。',
		tags: ['摄影', '空间'],
		year: '2024',
		cover: work6,
		link: '',
	},
];
