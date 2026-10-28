#!/usr/bin/env node
/**
 * new-photo.mjs — 照片墙的录入接口。
 *
 * 一条命令把一张（或一整个文件夹的）图片变成一张照片墙记录：
 *   1. 压缩（长边 2400px、按 EXIF 摆正、丢掉元数据）后写进 src/assets/gallery/
 *   2. 生成 src/content/gallery/<slug>.md，字段与 /admin 上传、手写 Markdown 完全一致
 *
 * 用法：
 *   npm run photo -- ./照片.jpg
 *   npm run photo -- ./国庆 -t "江边的傍晚" -c "落日把江面染成暖橙色" -g 生活,风景
 *   npm run photo -- ~/Pictures/trip/ --tags 旅行        # 整个文件夹批量
 *   npm run photo -- --remove 123                        # 删掉一条记录和它的图
 *   npm run photo -- ./照片.jpg -n                       # 只看会做什么，不落盘
 *
 * 图片字段契约（src/content.config.ts 的 gallery schema）：
 *   title   string  可选  标题
 *   date    date    必填  拍摄日期 YYYY-MM-DD，决定年月分组与排序
 *   image   Image   必填  指向 src/assets/gallery/ 的相对路径
 *   caption string  可选  图注，显示在缩略图下方与灯箱里
 *   tags    string[]      标签，默认 []，目前不参与分组，留给以后的筛选
 */
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const ASSET_DIR = path.join(ROOT, 'src', 'assets', 'gallery');
const RECORD_DIR = path.join(ROOT, 'src', 'content', 'gallery');

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.tif', '.tiff', '.heic', '.heif']);
/** 长边上限：照片墙最大展示 1600px（灯箱用），再大只是白占仓库体积 */
const MAX_EDGE = 2400;
const JPEG_QUALITY = 86;

const HELP = `
照片墙录入 · npm run photo -- <图片或文件夹...> [选项]

选项
  -t, --title <文字>     标题（单张时生效；批量默认取文件名）
  -c, --caption <文字>   图注
  -g, --tags <a,b>       标签，逗号分隔
  -d, --date <日期>      拍摄日期 YYYY-MM-DD（默认读 EXIF，再退到文件修改时间）
  -s, --slug <名字>      自定义文件名与记录名（只能用 a-z 0-9 - _）
      --keep             不压缩，原图直接复制（动图请用它）
      --force            同名记录已存在时覆盖
  -n, --dry-run          只打印计划，不写盘
      --remove <slug...> 删除记录及其图片
  -h, --help             看这段说明

例
  npm run photo -- ./IMG_2043.HEIC -t "江边的傍晚" -c "落日把江面染成暖橙色。" -g 生活,风景
  npm run photo -- ~/Pictures/2026-国庆 --tags 旅行
  npm run photo -- --remove 123
`;

// ---------------------------------------------------------------- 参数

function parseArgs(argv) {
	const opts = {
		inputs: [],
		title: '',
		caption: '',
		tags: [],
		date: '',
		slug: '',
		keep: false,
		force: false,
		dryRun: false,
		remove: [],
		help: false,
	};
	const takeValue = (i, inline, key) => {
		if (inline !== undefined) return [inline, i];
		const next = argv[i + 1];
		if (next === undefined || next.startsWith('-')) throw new UsageError(`${key} 后面缺少值`);
		return [next, i + 1];
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (!arg.startsWith('-')) {
			opts.inputs.push(arg);
			continue;
		}
		const eq = arg.indexOf('=');
		const flag = eq === -1 ? arg : arg.slice(0, eq);
		const inline = eq === -1 ? undefined : arg.slice(eq + 1);
		let value;
		switch (flag) {
			case '-t':
			case '--title':
				[value, i] = takeValue(i, inline, flag);
				opts.title = value.trim();
				break;
			case '-c':
			case '--caption':
				[value, i] = takeValue(i, inline, flag);
				opts.caption = value.trim();
				break;
			case '-g':
			case '--tags':
				[value, i] = takeValue(i, inline, flag);
				opts.tags = value
					.split(/[,，]/)
					.map((t) => t.trim())
					.filter(Boolean);
				break;
			case '-d':
			case '--date':
				[value, i] = takeValue(i, inline, flag);
				opts.date = value.trim();
				break;
			case '-s':
			case '--slug':
				[value, i] = takeValue(i, inline, flag);
				opts.slug = value.trim();
				break;
			case '--remove':
				// --remove 可以一次带多个：--remove a b c，遇到下一个 -flag 停
				if (inline !== undefined) opts.remove.push(inline);
				else {
					while (argv[i + 1] && !argv[i + 1].startsWith('-')) opts.remove.push(argv[++i]);
				}
				break;
			case '--keep':
				opts.keep = true;
				break;
			case '--force':
			case '-f':
				opts.force = true;
				break;
			case '-n':
			case '--dry-run':
				opts.dryRun = true;
				break;
			case '-h':
			case '--help':
				opts.help = true;
				break;
			default:
				throw new UsageError(`不认识的选项 ${flag}`);
		}
	}
	return opts;
}

class UsageError extends Error {}

// ---------------------------------------------------------------- 小工具

const say = (msg = '') => process.stdout.write(msg + '\n');
const warn = (msg) => process.stderr.write(`  ! ${msg}\n`);

function formatBytes(n) {
	if (!Number.isFinite(n)) return '-';
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
	return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function today() {
	const d = new Date();
	const pad = (n) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isValidDate(iso) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
	const d = new Date(`${iso}T00:00:00Z`);
	return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === iso;
}

/** EXIF 里 DateTimeOriginal 是 ASCII 的 "2026:10:22 18:30:00"，直接扫比解 TIFF 标签省事 */
function dateFromExif(buffer) {
	if (!buffer) return '';
	const hit = buffer.toString('latin1').match(/(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
	if (!hit) return '';
	const iso = `${hit[1]}-${hit[2]}-${hit[3]}`;
	return isValidDate(iso) ? iso : '';
}

/** 文件名 → slug；中文文件名会掉成空串，由调用方补时间戳兜底 */
function slugify(name) {
	return name
		.replace(/\.[^.]+$/, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/-{2,}/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 48);
}

function stampSlug(prefix = 'shot') {
	const d = new Date();
	const pad = (n) => String(n).padStart(2, '0');
	return `${prefix}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// YAML 写法与 /admin 上传、手写记录保持一致：单引号包字符串，内部单引号双写
const yamlString = (value) => `'${String(value).replace(/\r?\n/g, ' ').replace(/'/g, "''")}'`;
const yamlPath = (value) => (/^[A-Za-z0-9_./-]+$/.test(value) ? value : yamlString(value));

function buildRecord({ title, date, image, caption, tags }) {
	const lines = ['---'];
	if (title) lines.push(`title: ${yamlString(title)}`);
	lines.push(`date: ${date}`);
	lines.push(`image: ${yamlPath(image)}`);
	if (caption) lines.push(`caption: ${yamlString(caption)}`);
	lines.push(`tags: [${tags.map(yamlString).join(', ')}]`);
	lines.push('---', '');
	return lines.join('\n');
}

async function exists(p) {
	return stat(p).then(
		() => true,
		() => false,
	);
}

/** 输入可以是零散文件，也可以是文件夹（只取里面的图片，不进子目录） */
async function collectInputs(inputs) {
	const files = [];
	for (const input of inputs) {
		const abs = path.resolve(input);
		const info = await stat(abs).catch(() => null);
		if (!info) {
			warn(`找不到：${input}`);
			continue;
		}
		if (info.isDirectory()) {
			const entries = await readdir(abs, { withFileTypes: true });
			const found = entries
				.filter((e) => e.isFile() && IMAGE_EXTS.has(path.extname(e.name).toLowerCase()))
				.map((e) => path.join(abs, e.name))
				.sort((a, b) => a.localeCompare(b, 'zh'));
			if (found.length === 0) warn(`文件夹里没有图片：${input}`);
			files.push(...found);
		} else {
			if (!IMAGE_EXTS.has(path.extname(abs).toLowerCase())) {
				warn(`不是支持的图片格式，跳过：${input}`);
				continue;
			}
			files.push(abs);
		}
	}
	return files;
}

// ---------------------------------------------------------------- 写一张

async function addPhoto(file, opts, index, total) {
	const base = path.basename(file);
	const meta = await sharp(file, { failOn: 'none' })
		.metadata()
		.catch(() => null);
	if (!meta) {
		// sharp 的预编译包不带 HEVC 解码器，iPhone 的 .heic 多半会卡在这里
		warn(`读不出图片信息，跳过：${base}（HEIC 请先转成 JPG，或用 --keep 手动复制）`);
		return null;
	}

	// 日期：显式指定 > EXIF > 文件修改时间
	let date = opts.date;
	if (date && !isValidDate(date)) throw new UsageError(`日期 ${date} 不是 YYYY-MM-DD`);
	if (!date) date = dateFromExif(meta.exif);
	if (!date) {
		const mtime = (await stat(file)).mtime;
		const pad = (n) => String(n).padStart(2, '0');
		date = `${mtime.getFullYear()}-${pad(mtime.getMonth() + 1)}-${pad(mtime.getDate())}`;
	}

	// slug：中文文件名会掉成空串，用时间戳占位；批量时再按序号错开
	const stem = path.basename(file, path.extname(file));
	let slug = opts.slug || slugify(stem);
	if (!slug) slug = total > 1 ? `${stampSlug('photo')}-${index + 1}` : stampSlug('photo');

	// 默认压成 jpg（有透明通道的转 png），否则仓库很快就被原图撑爆
	const gifLike = ['.gif', '.svg'].includes(path.extname(file).toLowerCase());
	const keep = opts.keep || gifLike;
	const hasAlpha = Boolean(meta.hasAlpha) && !/^image\/jpe?g$/.test(meta.format ? `image/${meta.format}` : '');
	const outExt = keep ? path.extname(file).toLowerCase().replace('.jpeg', '.jpg') : hasAlpha ? '.png' : '.jpg';

	// 同名已存在：自定义 slug 直接报错，自动 slug 就顺延成 -2 -3
	let destAsset = path.join(ASSET_DIR, `${slug}${outExt}`);
	let destRecord = path.join(RECORD_DIR, `${slug}.md`);
	if ((await exists(destAsset)) || (await exists(destRecord))) {
		if (opts.force) {
			// 覆盖：把同 slug 的旧图一起清掉，避免换扩展名后留下孤儿文件
			await removeOne(slug, { silent: true });
		} else if (opts.slug) {
			warn(`${slug} 已存在，跳过（要覆盖就加 --force）`);
			return null;
		} else {
			const taken = await readdir(RECORD_DIR).catch(() => []);
			let n = 2;
			while (taken.includes(`${slug}-${n}.md`)) n++;
			slug = `${slug}-${n}`;
			destAsset = path.join(ASSET_DIR, `${slug}${outExt}`);
			destRecord = path.join(RECORD_DIR, `${slug}.md`);
		}
	}

	// 批量时 --title 只对单张有意义，多张一律用各自文件名，避免一整批同名
	const title = total === 1 ? opts.title : stem;
	const record = buildRecord({
		title,
		date,
		image: `../../assets/gallery/${slug}${outExt}`,
		caption: opts.caption,
		tags: opts.tags,
	});

	const srcSize = (await stat(file)).size;
	say(`\n[${index + 1}/${total}] ${base}  (${formatBytes(srcSize)})`);
	say(`   → src/assets/gallery/${slug}${outExt}`);
	say(`   → src/content/gallery/${slug}.md   date ${date}${title ? `  title ${title}` : ''}`);

	if (opts.dryRun) return { slug, dry: true };

	await mkdir(ASSET_DIR, { recursive: true });
	await mkdir(RECORD_DIR, { recursive: true });

	if (keep) {
		await copyFile(file, destAsset);
	} else {
		let pipeline = sharp(file, { failOn: 'none' }).rotate(); // rotate() 按 EXIF 摆正，之后元数据默认被丢掉
		if (Math.max(meta.width ?? 0, meta.height ?? 0) > MAX_EDGE) {
			pipeline = pipeline.resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true });
		}
		if (outExt === '.png') pipeline = pipeline.png({ compressionLevel: 9 });
		else pipeline = pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true, progressive: true });
		await pipeline.toFile(destAsset);
	}

	await writeFile(destRecord, record, 'utf8');
	const outSize = (await stat(destAsset)).size;
	const saved = srcSize > 0 ? Math.round((1 - outSize / srcSize) * 100) : 0;
	say(`   ${formatBytes(srcSize)} → ${formatBytes(outSize)}${saved > 0 ? `  (-${saved}%)` : ''}`);

	return { slug, date, outSize };
}

// ---------------------------------------------------------------- 删一张

/** 删记录时顺手删掉它引用的图；路径必须落在 src/assets/gallery/ 内，防止误删 */
async function removeOne(slug, { silent = false } = {}) {
	const record = path.join(RECORD_DIR, `${slug}.md`);
	if (!(await exists(record))) {
		if (!silent) warn(`没有这条记录：src/content/gallery/${slug}.md`);
		return false;
	}
	const text = await readFile(record, 'utf8');
	const hit = text.match(/^image:\s*(.+)$/m);
	if (hit) {
		const raw = hit[1].trim().replace(/^['"]|['"]$/g, '');
		const abs = path.resolve(RECORD_DIR, raw);
		if (abs.startsWith(ASSET_DIR + path.sep) && (await exists(abs))) {
			await rm(abs, { force: true });
			if (!silent) say(`   删除 ${path.relative(ROOT, abs)}`);
		}
	}
	await rm(record, { force: true });
	if (!silent) say(`   删除 ${path.relative(ROOT, record)}`);
	return true;
}

// ---------------------------------------------------------------- main

async function main() {
	let opts;
	try {
		opts = parseArgs(process.argv.slice(2));
	} catch (error) {
		if (error instanceof UsageError) {
			say(`\n  ✗ ${error.message}\n${HELP}`);
			process.exitCode = 1;
			return;
		}
		throw error;
	}

	if (opts.help || (!opts.inputs.length && !opts.remove.length)) {
		say(HELP);
		return;
	}

	if (opts.remove.length) {
		say(`\n移除 ${opts.remove.length} 条记录${opts.dryRun ? '（dry-run，未落盘）' : ''}：`);
		for (const slug of opts.remove) {
			const record = path.join(RECORD_DIR, `${slug}.md`);
			if (!(await exists(record))) {
				warn(`没有这条记录：${slug}`);
				continue;
			}
			say(`\n${slug}`);
			if (opts.dryRun) say(`   会删除 src/content/gallery/${slug}.md 及它引用的图片`);
			else await removeOne(slug);
		}
		say('\n完成。照片墙会按新的内容重新排序。');
		return;
	}

	const files = await collectInputs(opts.inputs);
	if (files.length === 0) {
		say('\n没有可用的图片。');
		process.exitCode = 1;
		return;
	}

	if (opts.dryRun) say('\n（dry-run：下面只是计划，不会写任何文件）');

	const done = [];
	for (let i = 0; i < files.length; i++) {
		const result = await addPhoto(files[i], opts, i, files.length);
		if (result) done.push(result);
	}

	if (opts.dryRun) {
		say(`\n计划 ${done.length} 张。去掉 -n 就会真的写入。`);
		return;
	}

	const bytes = done.reduce((n, r) => n + (r.outSize ?? 0), 0);
	say(`\n完成 ${done.length} 张，合计 ${formatBytes(bytes)}。`);
	say('  本地预览：npm run dev → http://localhost:4321/gallery');
	say('  上线：git add -A && git commit -m "photos: 新增照片" && git push');
}

main().catch((error) => {
	if (error instanceof UsageError) {
		say(`\n  ✗ ${error.message}`);
		process.exitCode = 1;
		return;
	}
	warn(error?.stack ?? String(error));
	process.exitCode = 1;
});
