// 管理后台前端逻辑：登录、作品 / 博客 / 音乐 的增删改，全部通过 GitHub API 提交。
// 没有后端服务，所有写操作都变成一次 commit，然后由 GitHub Actions 重新构建发布。

import { commitFiles, listDir, readTextFile, whoAmI, canPush, GitHubError, type Repo, type RepoFile } from './github';

interface ProjectItem {
	id: string;
	title: string;
	description: string;
	tags: string[];
	year: string;
	cover: string;
	link: string;
}

interface Track {
	title: string;
	artist?: string;
	src: string;
}

const FILES = {
	projects: 'src/data/projects.json',
	playlist: 'src/data/playlist.json',
	worksDir: 'src/assets/works/',
	blogDir: 'src/content/blog/',
	audioDir: 'public/audio/',
	blogImagesDir: 'src/assets/blog/',
};

const SESSION_KEY = 'ystlr:admin:session';

let repo: Repo | null = null;
let projects: ProjectItem[] = [];
let projectIndex = -1;
let tracks: Track[] = [];
let blogFiles: { name: string; title: string; pubDate: string }[] = [];
let blogEditingPath: string | null = null;

const $ = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document) =>
	root.querySelector<T>(selector);
const $$ = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document) =>
	Array.from(root.querySelectorAll<T>(selector));

function toast(message: string, kind: 'ok' | 'err' = 'ok') {
	const box = $('[data-toast]');
	if (!box) return;
	box.textContent = message;
	box.className = `toast show ${kind}`;
	window.clearTimeout((toast as unknown as { timer?: number }).timer);
	(toast as unknown as { timer?: number }).timer = window.setTimeout(() => {
		box.className = 'toast';
	}, kind === 'err' ? 8000 : 4000);
}

function friendly(error: unknown): string {
	if (error instanceof GitHubError) return error.message;
	if (error instanceof Error) return error.message;
	return String(error);
}

/* ---------------- 登录 ---------------- */

function loadSession(): Repo | null {
	const raw = localStorage.getItem(SESSION_KEY) ?? sessionStorage.getItem(SESSION_KEY);
	if (!raw) return null;
	try {
		const data = JSON.parse(raw) as Repo;
		if (data?.owner && data?.repo && data?.token) return { branch: data.branch || 'main', ...data };
	} catch {
		/* ignore */
	}
	return null;
}

async function startSession(next: Repo) {
	const me = await whoAmI(next);
	const allowed = await canPush(next);
	if (!allowed) throw new Error(`账号 ${me.login} 对该仓库没有写入权限，请换一个有 Contents 读写的 Token`);
	repo = next;
	showApp(me.login);
	await Promise.all([loadProjects(), loadBlog(), loadMusic()]);
}

function showApp(login: string) {
	$('[data-login]')?.setAttribute('hidden', '');
	$('[data-app]')?.removeAttribute('hidden');
	const who = $('[data-who]');
	if (who) who.textContent = login;
	$('[data-logout]')?.removeAttribute('hidden');
	const actions = $<HTMLAnchorElement>('[data-actions]');
	if (actions && repo) {
		actions.href = `https://github.com/${repo.owner}/${repo.repo}/actions`;
		actions.removeAttribute('hidden');
	}
}

function showLogin() {
	repo = null;
	$('[data-app]')?.setAttribute('hidden', '');
	$('[data-login]')?.removeAttribute('hidden');
	$('[data-logout]')?.setAttribute('hidden', '');
	$('[data-actions]')?.setAttribute('hidden', '');
}

/* ---------------- 作品 ---------------- */

async function loadProjects() {
	if (!repo) return;
	const file = await readTextFile(repo, FILES.projects);
	projects = file ? (JSON.parse(file.text) as ProjectItem[]) : [];
	renderProjects();
}

function renderProjects() {
	const list = $('[data-projects-list]');
	if (!list) return;
	if (!projects.length) {
		list.innerHTML = '<li class="empty">还没有作品，点右上角「新建作品」开始。</li>';
		return;
	}
	list.innerHTML = projects
		.map(
			(item, index) => `
			<li>
				<button type="button" class="item" data-project-edit="${index}">
					<span class="item-main">${escapeHtml(item.title)}</span>
					<span class="item-sub">${escapeHtml(item.year || '—')} · ${escapeHtml(item.cover)}</span>
				</button>
			</li>`,
		)
		.join('');
}

function openProjectForm(index: number | null) {
	const form = $<HTMLFormElement>('[data-project-form]');
	if (!form) return;
	projectIndex = index ?? -1;
	const item = index !== null ? projects[index] : null;
	(form.elements.namedItem('title') as HTMLInputElement).value = item?.title ?? '';
	(form.elements.namedItem('description') as HTMLTextAreaElement).value = item?.description ?? '';
	(form.elements.namedItem('tags') as HTMLInputElement).value = item?.tags?.join(', ') ?? '';
	(form.elements.namedItem('year') as HTMLInputElement).value = item?.year ?? String(new Date().getFullYear());
	(form.elements.namedItem('link') as HTMLInputElement).value = item?.link ?? '';
	const cover = form.elements.namedItem('cover') as HTMLInputElement;
	cover.value = '';
	const hint = $('[data-project-cover-hint]');
	if (hint) hint.textContent = item ? `当前封面：${item.cover}（不上传新图则保持不变）` : '建议 4:3 或 16:9，JPG/PNG 都行，构建时会自动转 webp。';
	const del = $('[data-project-delete]');
	if (del) del.toggleAttribute('hidden', !item);
	setFormError('[data-project-error]', '');
	form.removeAttribute('hidden');
	form.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function saveProject() {
	const form = $<HTMLFormElement>('[data-project-form]');
	if (!form || !repo) return;
	const data = new FormData(form);
	const title = String(data.get('title') ?? '').trim();
	const description = String(data.get('description') ?? '').trim();
	if (!title) return setFormError('[data-project-error]', '标题不能为空');
	if (!description) return setFormError('[data-project-error]', '简介不能为空');

	const existing = projectIndex >= 0 ? projects[projectIndex] : null;
	const id = existing?.id ?? `work-${Date.now().toString(36)}`;
	const files: RepoFile[] = [];
	let coverName = existing?.cover ?? '';

	const fileInput = form.elements.namedItem('cover') as HTMLInputElement;
	const file = fileInput.files?.[0];
	if (file) {
		if (file.size > 12 * 1024 * 1024) return setFormError('[data-project-error]', '封面图请控制在 12MB 以内');
		const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
		coverName = `${id}.${ext}`;
		files.push({ path: `${FILES.worksDir}${coverName}`, bytes: new Uint8Array(await file.arrayBuffer()) });
	}
	if (!coverName) return setFormError('[data-project-error]', '第一次新建作品需要上传一张封面图');

	const next: ProjectItem = {
		id,
		title,
		description,
		tags: String(data.get('tags') ?? '')
			.split(/[,，]/)
			.map((tag) => tag.trim())
			.filter(Boolean),
		year: String(data.get('year') ?? '').trim(),
		cover: coverName,
		link: String(data.get('link') ?? '').trim(),
	};

	const updated = [...projects];
	if (projectIndex >= 0) updated[projectIndex] = next;
	else updated.unshift(next);

	files.push({ path: FILES.projects, content: `${JSON.stringify(updated, null, '\t')}\n` });

	try {
		setBusy(form, true);
		await commitFiles(repo, `admin: 保存作品「${title}」`, files);
		await loadProjects();
		form.setAttribute('hidden', '');
		toast('已保存，正在重新构建，约 1–2 分钟后线上生效');
	} catch (error) {
		setFormError('[data-project-error]', friendly(error));
	} finally {
		setBusy(form, false);
	}
}

async function deleteProject() {
	if (!repo || projectIndex < 0) return;
	const item = projects[projectIndex];
	if (!window.confirm(`确定删除作品「${item.title}」？封面图也会一起删掉。`)) return;
	const updated = projects.filter((_, index) => index !== projectIndex);
	const files: RepoFile[] = [{ path: FILES.projects, content: `${JSON.stringify(updated, null, '\t')}\n` }];
	if (item.cover) files.push({ path: `${FILES.worksDir}${item.cover}`, remove: true });
	try {
		await commitFiles(repo, `admin: 删除作品「${item.title}」`, files);
		await loadProjects();
		$('[data-project-form]')?.setAttribute('hidden', '');
		toast('已删除');
	} catch (error) {
		setFormError('[data-project-error]', friendly(error));
	}
}

/* ---------------- 博客 ---------------- */

function parseFrontmatter(text: string): { data: Record<string, string>; body: string } {
	const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
	if (!match) return { data: {}, body: text };
	const data: Record<string, string> = {};
	for (const line of match[1].split(/\r?\n/)) {
		const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
		if (!kv) continue;
		let value = kv[2].trim();
		if (/^'.*'$/.test(value)) value = value.slice(1, -1).replace(/''/g, "'");
		else if (/^".*"$/.test(value)) value = value.slice(1, -1).replace(/\\"/g, '"');
		data[kv[1]] = value;
	}
	return { data, body: match[2] };
}

function quote(value: string): string {
	return `'${value.replace(/'/g, "''")}'`;
}

function parseTags(value: string | undefined): string[] {
	if (!value) return [];
	const inner = value.trim().replace(/^\[/, '').replace(/\]$/, '');
	return inner
		.split(',')
		.map((tag) => tag.trim().replace(/^['"]|['"]$/g, ''))
		.filter(Boolean);
}

async function loadBlog() {
	if (!repo) return;
	const files = await listDir(repo, 'src/content/blog');
	blogFiles = [];
	for (const file of files) {
		if (!/\.(md|mdx)$/.test(file.name)) continue;
		const text = await readTextFile(repo, file.path);
		const data = text ? parseFrontmatter(text.text).data : {};
		blogFiles.push({ name: file.name, title: data.title ?? file.name, pubDate: data.pubDate ?? '' });
	}
	blogFiles.sort((a, b) => (a.pubDate < b.pubDate ? 1 : -1));
	renderBlog();
}

function renderBlog() {
	const list = $('[data-blog-list]');
	if (!list) return;
	if (!blogFiles.length) {
		list.innerHTML = '<li class="empty">还没有文章。</li>';
		return;
	}
	list.innerHTML = blogFiles
		.map(
			(item) => `
			<li>
				<button type="button" class="item" data-blog-edit="${escapeHtml(item.name)}">
					<span class="item-main">${escapeHtml(item.title)}</span>
					<span class="item-sub">${escapeHtml(item.pubDate || '—')}</span>
				</button>
			</li>`,
		)
		.join('');
}

async function openBlogForm(fileName: string | null) {
	const form = $<HTMLFormElement>('[data-blog-form]');
	if (!form || !repo) return;
	blogEditingPath = fileName ? `src/content/blog/${fileName}` : null;
	const elements = form.elements;
	const today = new Date().toISOString().slice(0, 10);

	(elements.namedItem('title') as HTMLInputElement).value = '';
	(elements.namedItem('slug') as HTMLInputElement).value = '';
	(elements.namedItem('description') as HTMLInputElement).value = '';
	(elements.namedItem('pubDate') as HTMLInputElement).value = today;
	(elements.namedItem('tags') as HTMLInputElement).value = '';
	(elements.namedItem('body') as HTMLTextAreaElement).value = '';
	$('[data-blog-hero-hint]')?.setAttribute('data-current', '');

	if (blogEditingPath) {
		const text = await readTextFile(repo, blogEditingPath);
		if (text) {
			const { data, body } = parseFrontmatter(text.text);
			(elements.namedItem('title') as HTMLInputElement).value = data.title ?? '';
			(elements.namedItem('slug') as HTMLInputElement).value = fileName!.replace(/\.(md|mdx)$/, '');
			(elements.namedItem('description') as HTMLInputElement).value = data.description ?? '';
			(elements.namedItem('pubDate') as HTMLInputElement).value = (data.pubDate ?? today).slice(0, 10);
			(elements.namedItem('tags') as HTMLInputElement).value = parseTags(data.tags).join(', ');
			(elements.namedItem('body') as HTMLTextAreaElement).value = body.trim();
			const hint = $('[data-blog-hero-hint]');
			if (hint) hint.textContent = data.heroImage ? `当前题图：${data.heroImage}` : '没有题图（可选）';
		}
	} else {
		const hint = $('[data-blog-hero-hint]');
		if (hint) hint.textContent = '可选，建议 16:9';
	}

	setFormError('[data-blog-error]', '');
	form.removeAttribute('hidden');
	form.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function slugify(input: string): string {
	const base = input
		.toLowerCase()
		.replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return base || `post-${Date.now().toString(36)}`;
}

async function saveBlog() {
	const form = $<HTMLFormElement>('[data-blog-form]');
	if (!form || !repo) return;
	const data = new FormData(form);
	const title = String(data.get('title') ?? '').trim();
	const description = String(data.get('description') ?? '').trim();
	const body = String(data.get('body') ?? '').trim();
	if (!title) return setFormError('[data-blog-error]', '标题不能为空');
	if (!description) return setFormError('[data-blog-error]', '摘要不能为空（会显示在列表和搜索结果里）');
	if (!body) return setFormError('[data-blog-error]', '正文不能为空');

	const slug = slugify(String(data.get('slug') ?? '') || title);
	const target = `src/content/blog/${slug}.md`;

	const rawTags = String(data.get('tags') ?? '')
		.split(/[,，]/)
		.map((tag) => tag.trim())
		.filter(Boolean);

	const files: RepoFile[] = [];
	let heroLine = '';
	const heroInput = form.elements.namedItem('heroImage') as HTMLInputElement;
	const hero = heroInput.files?.[0];
	if (hero) {
		if (hero.size > 12 * 1024 * 1024) return setFormError('[data-blog-error]', '题图请控制在 12MB 以内');
		const ext = (hero.name.split('.').pop() ?? 'jpg').toLowerCase();
		const heroName = `${slug}-${Date.now().toString(36)}.${ext}`;
		files.push({ path: `${FILES.blogImagesDir}${heroName}`, bytes: new Uint8Array(await hero.arrayBuffer()) });
		heroLine = `heroImage: ../../assets/blog/${heroName}\n`;
	} else if (blogEditingPath) {
		const existing = await readTextFile(repo, blogEditingPath);
		if (existing) {
			const prev = parseFrontmatter(existing.text).data.heroImage;
			if (prev) heroLine = `heroImage: ${prev}\n`;
		}
	}

	const head = [
		'---',
		`title: ${quote(title)}`,
		`description: ${quote(description)}`,
		`pubDate: ${quote(String(data.get('pubDate') ?? new Date().toISOString().slice(0, 10)))}`,
	];
	if (rawTags.length) head.push(`tags: [${rawTags.map(quote).join(', ')}]`);
	if (heroLine) head.push(heroLine.trim());
	head.push('---', '');

	const frontmatter = `${head.join('\n')}\n${body}\n`;

	files.push({ path: target, content: frontmatter });
	if (blogEditingPath && blogEditingPath !== target) files.push({ path: blogEditingPath, remove: true });

	try {
		setBusy(form, true);
		await commitFiles(repo, `admin: 发布文章「${title}」`, files);
		await loadBlog();
		form.setAttribute('hidden', '');
		toast('已发布，约 1–2 分钟后线上生效');
	} catch (error) {
		setFormError('[data-blog-error]', friendly(error));
	} finally {
		setBusy(form, false);
	}
}

async function deleteBlog() {
	if (!repo || !blogEditingPath) return;
	if (!window.confirm('确定删除这篇文章？')) return;
	try {
		await commitFiles(repo, `admin: 删除文章 ${blogEditingPath}`, [{ path: blogEditingPath, remove: true }]);
		await loadBlog();
		$('[data-blog-form]')?.setAttribute('hidden', '');
		toast('已删除');
	} catch (error) {
		setFormError('[data-blog-error]', friendly(error));
	}
}

/* ---------------- 音乐 ---------------- */

async function loadMusic() {
	if (!repo) return;
	const file = await readTextFile(repo, FILES.playlist);
	if (file) {
		try {
			const data = JSON.parse(file.text) as { tracks?: Track[] };
			tracks = Array.isArray(data.tracks) ? data.tracks : [];
		} catch {
			tracks = [];
		}
	} else {
		tracks = [];
	}
	renderMusic();
}

function renderMusic() {
	const list = $('[data-music-list]');
	if (!list) return;
	if (!tracks.length) {
		list.innerHTML = '<li class="empty">还没有曲目，上传一首即可出现在顶部播放器。</li>';
		return;
	}
	list.innerHTML = tracks
		.map(
			(track, index) => `
			<li>
				<span class="item static">
					<span class="item-main">${escapeHtml(track.title)}</span>
					<span class="item-sub">${escapeHtml(track.artist || track.src)}</span>
				</span>
				<button type="button" class="ghost danger" data-track-delete="${index}">删除</button>
			</li>`,
		)
		.join('');
}

async function addTrack() {
	const form = $<HTMLFormElement>('[data-music-form]');
	if (!form || !repo) return;
	const data = new FormData(form);
	const title = String(data.get('title') ?? '').trim();
	const artist = String(data.get('artist') ?? '').trim();
	const file = (form.elements.namedItem('file') as HTMLInputElement).files?.[0];
	if (!title) return setFormError('[data-music-error]', '请填写曲名');
	if (!file) return setFormError('[data-music-error]', '请选择音频文件（mp3 / m4a）');
	if (file.size > 25 * 1024 * 1024) return setFormError('[data-music-error]', '音频请控制在 25MB 以内');

	const ext = (file.name.split('.').pop() ?? 'mp3').toLowerCase();
	const fileName = `${slugify(title)}-${Date.now().toString(36)}.${ext}`;
	const next = [...tracks, { title, artist, src: `/audio/${fileName}` }];

	try {
		setBusy(form, true);
		await commitFiles(repo, `admin: 添加音乐「${title}」`, [
			{ path: `${FILES.audioDir}${fileName}`, bytes: new Uint8Array(await file.arrayBuffer()) },
			{ path: FILES.playlist, content: `${JSON.stringify({ tracks: next }, null, '\t')}\n` },
		]);
		await loadMusic();
		form.reset();
		toast('已添加，构建完成后即可播放');
	} catch (error) {
		setFormError('[data-music-error]', friendly(error));
	} finally {
		setBusy(form, false);
	}
}

async function deleteTrack(index: number) {
	if (!repo) return;
	const track = tracks[index];
	if (!track) return;
	if (!window.confirm(`删除曲目「${track.title}」？`)) return;
	const next = tracks.filter((_, i) => i !== index);
	const files: RepoFile[] = [{ path: FILES.playlist, content: `${JSON.stringify({ tracks: next }, null, '\t')}\n` }];
	if (track.src.startsWith('/audio/')) files.push({ path: `public${track.src}`, remove: true });
	try {
		await commitFiles(repo, `admin: 删除音乐「${track.title}」`, files);
		await loadMusic();
		toast('已删除');
	} catch (error) {
		toast(friendly(error), 'err');
	}
}

/* ---------------- 小工具 ---------------- */

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (ch) =>
		ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;',
	);
}

function setFormError(selector: string, message: string) {
	const box = $(selector);
	if (!box) return;
	if (message) {
		box.textContent = message;
		box.removeAttribute('hidden');
	} else {
		box.textContent = '';
		box.setAttribute('hidden', '');
	}
}

function setBusy(form: HTMLFormElement, busy: boolean) {
	$$<HTMLButtonElement>('button[type="submit"]', form).forEach((button) => {
		button.disabled = busy;
		button.dataset.label ??= button.textContent ?? '';
		button.textContent = busy ? '保存中…' : button.dataset.label;
	});
}

/* ---------------- 绑定 ---------------- */

export function boot() {
	const remembered = loadSession();
	const loginForm = $<HTMLFormElement>('[data-login-form]');
	if (remembered) {
		void startSession(remembered).catch((error) => {
			toast(`自动登录失败：${friendly(error)}`, 'err');
			showLogin();
		});
	}

	loginForm?.addEventListener('submit', async (event) => {
		event.preventDefault();
		const data = new FormData(loginForm);
		const [owner, name] = String(data.get('repo') ?? '').split('/');
		const next: Repo = {
			owner: (owner ?? '').trim(),
			repo: (name ?? '').trim(),
			branch: String(data.get('branch') ?? 'main').trim() || 'main',
			token: String(data.get('token') ?? '').trim(),
		};
		if (!next.owner || !next.repo) return setFormError('[data-login-error]', '仓库格式应为 用户名/仓库名');
		if (!next.token) return setFormError('[data-login-error]', '请填写 Token');
		setFormError('[data-login-error]', '');
		const submit = loginForm.querySelector('button[type="submit"]') as HTMLButtonElement | null;
		if (submit) {
			submit.disabled = true;
			submit.textContent = '登录中…';
		}
		try {
			const storage = data.get('remember') ? localStorage : sessionStorage;
			localStorage.removeItem(SESSION_KEY);
			sessionStorage.removeItem(SESSION_KEY);
			storage.setItem(SESSION_KEY, JSON.stringify(next));
			await startSession(next);
			toast('登录成功');
		} catch (error) {
			localStorage.removeItem(SESSION_KEY);
			sessionStorage.removeItem(SESSION_KEY);
			setFormError('[data-login-error]', friendly(error));
			showLogin();
		} finally {
			if (submit) {
				submit.disabled = false;
				submit.textContent = '登录';
			}
		}
	});

	$('[data-logout]')?.addEventListener('click', () => {
		localStorage.removeItem(SESSION_KEY);
		sessionStorage.removeItem(SESSION_KEY);
		showLogin();
		$<HTMLFormElement>('[data-login-form]')?.reset();
	});

	$$('[data-tab]').forEach((tab) => {
		tab.addEventListener('click', () => {
			const name = tab.dataset.tab;
			$$('[data-tab]').forEach((node) => node.classList.toggle('on', node === tab));
			$$('[data-panel]').forEach((panel) => panel.toggleAttribute('hidden', panel.getAttribute('data-panel') !== name));
		});
	});

	$('[data-project-new]')?.addEventListener('click', () => openProjectForm(null));
	$('[data-project-cancel]')?.addEventListener('click', () => $('[data-project-form]')?.setAttribute('hidden', ''));
	$('[data-project-delete]')?.addEventListener('click', () => void deleteProject());
	$<HTMLFormElement>('[data-project-form]')?.addEventListener('submit', (event) => {
		event.preventDefault();
		void saveProject();
	});
	$('[data-projects-list]')?.addEventListener('click', (event) => {
		const button = (event.target as HTMLElement).closest<HTMLElement>('[data-project-edit]');
		if (button) openProjectForm(Number(button.dataset.projectEdit));
	});

	$('[data-blog-new]')?.addEventListener('click', () => void openBlogForm(null));
	$('[data-blog-cancel]')?.addEventListener('click', () => $('[data-blog-form]')?.setAttribute('hidden', ''));
	$('[data-blog-delete]')?.addEventListener('click', () => void deleteBlog());
	$<HTMLFormElement>('[data-blog-form]')?.addEventListener('submit', (event) => {
		event.preventDefault();
		void saveBlog();
	});
	$('[data-blog-list]')?.addEventListener('click', (event) => {
		const button = (event.target as HTMLElement).closest<HTMLElement>('[data-blog-edit]');
		if (button) void openBlogForm(button.dataset.blogEdit ?? null);
	});

	$<HTMLFormElement>('[data-music-form]')?.addEventListener('submit', (event) => {
		event.preventDefault();
		void addTrack();
	});
	$('[data-music-list]')?.addEventListener('click', (event) => {
		const button = (event.target as HTMLElement).closest<HTMLElement>('[data-track-delete]');
		if (button) void deleteTrack(Number(button.dataset.trackDelete));
	});
}
