// 管理后台的界面逻辑：纯原生 TS + DOM，没有框架。
//
// 页面外壳写在 src/pages/admin/index.astro 里（登录表单必须在静态 HTML 里，
// 这样不跑 JS 也能看到它），这里只负责绑定事件、读写 GitHub、渲染列表。
//
// View Transitions 下模块只会执行一次，所以用 astro:page-load 重新绑定；
// 根节点上的 dataset.wired 保证同一次导航里不会重复绑定。

import {
	GitHubError,
	bytesToBase64,
	canWrite,
	deleteFile,
	listDir,
	putBinary,
	putFile,
	readJsonFile,
	readTextFile,
	whoAmI,
	type Repo,
} from './github';

// ---- 仓库位置：写死在这里，管理后台只服务这一个站点 ----
const REPO: Repo = { owner: 'YQ-create', repo: 'ystlr.github.io', branch: 'main' };

const TOKEN_KEY = 'ystlr:admin:token';
const BLOG_DIR = 'src/content/blog';
const GALLERY_ASSET_DIR = 'src/assets/gallery';
const GALLERY_CONTENT_DIR = 'src/content/gallery';
const AUDIO_DIR = 'public/audio';
const PLAYLIST_PATH = 'src/data/playlist.json';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'];
const AUDIO_EXTS = ['mp3', 'm4a', 'aac', 'ogg', 'wav', 'flac'];

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** 每次成功写入后统一提示，避免各处措辞漂移 */
const SUBMIT_OK = '已提交到 main，GitHub Actions 构建完成后约 1 分钟生效（页面需刷新）';

// ---------------------------------------------------------------- 类型

type FrontmatterValue = string | string[] | boolean;
type Frontmatter = Record<string, FrontmatterValue>;
type FieldName =
	| 'title'
	| 'description'
	| 'pubDate'
	| 'tags'
	| 'heroImage'
	| 'featured'
	| 'draft'
	| 'body';

interface PostMeta {
	path: string;
	name: string;
	title: string;
	date: string;
	featured: boolean;
	draft: boolean;
	sha: string;
	problem?: string;
}

// ---------------------------------------------------------------- 通用小工具

function q<T extends Element>(parent: ParentNode | null, selector: string): T | null {
	return parent ? parent.querySelector<T>(selector) : null;
}

function on<K extends keyof HTMLElementEventMap>(
	element: Element | null,
	type: K,
	handler: (event: HTMLElementEventMap[K]) => void,
): void {
	if (element) element.addEventListener(type, handler as EventListener);
}

function describeError(error: unknown): string {
	if (error instanceof GitHubError) return error.message;
	if (error instanceof Error) return error.message || error.name;
	return String(error);
}

function formatSize(bytes: number): string {
	if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${bytes} B`;
}

function todayStr(): string {
	const now = new Date();
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function extOf(name: string): string {
	const dot = name.lastIndexOf('.');
	return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** 文件名 → slug；中文文件名会被清空，由调用方补一个时间戳兜底 */
function slugify(name: string): string {
	return name
		.replace(/\.[^.]+$/, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/-{2,}/g, '-')
		.replace(/^-+|-+$/g, '');
}

function stampSlug(prefix: string): string {
	const now = new Date();
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${prefix}-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

/** 逗号分隔（中英文逗号都认）→ 去空去重的标签数组 */
function parseTags(raw: string): string[] {
	const seen = new Set<string>();
	for (const part of raw.split(/[,，]/)) {
		const tag = part.trim();
		if (tag) seen.add(tag);
	}
	return [...seen];
}

// ---------------------------------------------------------------- frontmatter
// 只解析这个站点用得到的 YAML 子集：单行标量、行内数组、块级数组、布尔。
// 解析失败不抛错，缺字段由保存前的校验兜住。

function unquote(value: string): string {
	const text = value.trim();
	if (text.length >= 2 && text.startsWith("'") && text.endsWith("'")) {
		return text.slice(1, -1).replace(/''/g, "'");
	}
	if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
		try {
			const parsed = JSON.parse(text) as unknown;
			return typeof parsed === 'string' ? parsed : text.slice(1, -1);
		} catch {
			return text.slice(1, -1);
		}
	}
	return text;
}

function splitInlineArray(inner: string): string[] {
	const parts: string[] = [];
	let current = '';
	let quote: string | null = null;
	for (const ch of inner) {
		if (quote) {
			current += ch;
			if (ch === quote) quote = null;
			continue;
		}
		if (ch === "'" || ch === '"') {
			quote = ch;
			current += ch;
			continue;
		}
		if (ch === ',') {
			parts.push(current);
			current = '';
			continue;
		}
		current += ch;
	}
	parts.push(current);
	return parts.map((part) => unquote(part)).filter((part) => part.length > 0);
}

function parseFrontmatter(source: string): Frontmatter {
	const data: Frontmatter = {};
	const lines = source.split('\n');
	let listKey: string | null = null;
	let listItems: string[] = [];

	const flush = () => {
		if (listKey) data[listKey] = listItems;
		listKey = null;
		listItems = [];
	};

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;

		// 块级数组：key: 后面换行跟 "- item"
		const item = /^-\s*(.*)$/.exec(trimmed);
		if (item && listKey) {
			listItems.push(unquote(item[1]));
			continue;
		}

		const pair = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
		if (!pair) continue;

		flush();
		const key = pair[1];
		const raw = pair[2].trim();
		if (!raw) {
			listKey = key;
			listItems = [];
			continue;
		}
		if (raw.startsWith('[')) {
			const end = raw.lastIndexOf(']');
			data[key] = splitInlineArray(raw.slice(1, end > 0 ? end : undefined));
			continue;
		}
		if (raw === 'true' || raw === 'false') {
			data[key] = raw === 'true';
			continue;
		}
		data[key] = unquote(raw);
	}
	flush();
	return data;
}

function splitFrontmatter(raw: string): { data: Frontmatter; body: string } {
	const text = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
	const match = /^---\n([\s\S]*?)\n---[ \t]*\n?/.exec(text);
	if (!match) return { data: {}, body: text };
	return { data: parseFrontmatter(match[1]), body: text.slice(match[0].length) };
}

function asString(value: FrontmatterValue | undefined): string {
	if (typeof value === 'string') return value;
	if (Array.isArray(value)) return value.join(', ');
	if (typeof value === 'boolean') return String(value);
	return '';
}

function asBool(value: FrontmatterValue | undefined): boolean {
	if (typeof value === 'boolean') return value;
	return typeof value === 'string' && value.trim().toLowerCase() === 'true';
}

function asTags(value: FrontmatterValue | undefined): string[] {
	if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
	if (typeof value === 'string') return parseTags(value);
	return [];
}

function dateOnly(value: string): string {
	const match = /(\d{4}-\d{2}-\d{2})/.exec(value);
	return match ? match[1] : '';
}

function yamlString(value: string): string {
	return `'${value.replace(/\r?\n/g, ' ').replace(/'/g, "''")}'`;
}

function yamlPath(value: string): string {
	return /^[A-Za-z0-9_./-]+$/.test(value) ? value : yamlString(value);
}

function buildPostFile(input: {
	title: string;
	description: string;
	pubDate: string;
	heroImage: string;
	tags: string[];
	featured: boolean;
	draft: boolean;
	body: string;
}): string {
	const lines = [
		'---',
		`title: ${yamlString(input.title)}`,
		`description: ${yamlString(input.description)}`,
		`pubDate: ${input.pubDate}`,
	];
	if (input.heroImage) lines.push(`heroImage: ${yamlPath(input.heroImage)}`);
	lines.push(`tags: [${input.tags.map(yamlString).join(', ')}]`);
	lines.push(`featured: ${input.featured}`);
	lines.push(`draft: ${input.draft}`);
	lines.push('---', '');

	const body = input.body.replace(/^\n+/, '').replace(/\s+$/, '');
	return `${lines.join('\n')}${body ? `${body}\n` : ''}`;
}

function buildGalleryFile(input: {
	title: string;
	date: string;
	image: string;
	caption: string;
	tags: string[];
}): string {
	const lines = ['---'];
	if (input.title) lines.push(`title: ${yamlString(input.title)}`);
	lines.push(`date: ${input.date}`);
	lines.push(`image: ${yamlPath(input.image)}`);
	if (input.caption) lines.push(`caption: ${yamlString(input.caption)}`);
	lines.push(`tags: [${input.tags.map(yamlString).join(', ')}]`);
	lines.push('---', '');
	return lines.join('\n');
}

// ---------------------------------------------------------------- boot

export function boot(): void {
	const root = document.querySelector<HTMLElement>('[data-admin]');
	if (!root || root.dataset.wired === '1') return;
	root.dataset.wired = '1';

	// ---- 外壳元素 ----
	const loginPane = q<HTMLElement>(root, '[data-admin-login]');
	const loginForm = q<HTMLFormElement>(root, '[data-login-form]');
	const tokenInput = q<HTMLInputElement>(root, '[data-token-input]');
	const rememberInput = q<HTMLInputElement>(root, '[data-token-remember]');
	const loginBtn = q<HTMLButtonElement>(root, '[data-login-btn]');
	const loginStatus = q<HTMLElement>(root, '[data-login-status]');

	const mainPane = q<HTMLElement>(root, '[data-admin-main]');
	const loginName = q<HTMLElement>(root, '[data-admin-login-name]');
	const logoutBtn = q<HTMLButtonElement>(root, '[data-logout]');
	const statusEl = q<HTMLElement>(root, '[data-admin-status]');

	const tabButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-tab]'));
	const panels = Array.from(root.querySelectorAll<HTMLElement>('[data-panel]'));

	// ---- 文章 ----
	const postList = q<HTMLElement>(root, '[data-post-list]');
	const postsHint = q<HTMLElement>(root, '[data-posts-hint]');
	const postsRefresh = q<HTMLButtonElement>(root, '[data-posts-refresh]');
	const createToggle = q<HTMLButtonElement>(root, '[data-post-new-toggle]');
	const createForm = q<HTMLFormElement>(root, '[data-post-create]');
	const createCancel = q<HTMLButtonElement>(root, '[data-post-create-cancel]');
	const newSlug = q<HTMLInputElement>(root, '[data-new-slug]');
	const editor = q<HTMLFormElement>(root, '[data-post-editor]');
	const editorPath = q<HTMLElement>(root, '[data-editor-path]');
	const saveBtn = q<HTMLButtonElement>(root, '[data-post-save]');
	const deleteBtn = q<HTMLButtonElement>(root, '[data-post-delete]');
	const closeBtn = q<HTMLButtonElement>(root, '[data-post-close]');

	// ---- 照片 ----
	const photoForm = q<HTMLFormElement>(root, '[data-photo-form]');
	const photoFile = q<HTMLInputElement>(root, '[data-photo-file]');
	const photoInfo = q<HTMLElement>(root, '[data-photo-file-info]');
	const photoTitle = q<HTMLInputElement>(root, '[data-photo-title]');
	const photoCaption = q<HTMLInputElement>(root, '[data-photo-caption]');
	const photoDate = q<HTMLInputElement>(root, '[data-photo-date]');
	const photoTags = q<HTMLInputElement>(root, '[data-photo-tags]');
	const photoSubmit = q<HTMLButtonElement>(root, '[data-photo-submit]');

	// ---- 音乐 ----
	const musicForm = q<HTMLFormElement>(root, '[data-music-form]');
	const musicFile = q<HTMLInputElement>(root, '[data-music-file]');
	const musicInfo = q<HTMLElement>(root, '[data-music-file-info]');
	const musicTitle = q<HTMLInputElement>(root, '[data-music-title]');
	const musicArtist = q<HTMLInputElement>(root, '[data-music-artist]');
	const musicSubmit = q<HTMLButtonElement>(root, '[data-music-submit]');

	// ---- 状态 ----
	let token: string | null = null;
	let posts: PostMeta[] = [];
	let postsLoaded = false;
	let editing: { path: string; sha: string } | null = null;
	let deleteArmed = false;
	let deleteTimer = 0;

	// ------------------------------------------------------------ 状态条

	function setStatus(kind: 'idle' | 'busy' | 'ok' | 'err', text: string): void {
		if (!statusEl) return;
		statusEl.dataset.kind = kind;
		statusEl.textContent = text;
		statusEl.hidden = false;
	}

	function setLoginStatus(kind: 'idle' | 'busy' | 'ok' | 'err', text: string): void {
		if (!loginStatus) return;
		loginStatus.dataset.kind = kind;
		loginStatus.textContent = text;
		loginStatus.hidden = !text;
	}

	function setBusy(button: HTMLButtonElement | null, busy: boolean, label?: string): void {
		if (!button) return;
		if (busy) {
			if (!button.dataset.label) button.dataset.label = button.textContent ?? '';
			button.disabled = true;
			if (label) button.textContent = label;
		} else {
			button.disabled = false;
			if (button.dataset.label) {
				button.textContent = button.dataset.label;
				delete button.dataset.label;
			}
		}
	}

	// ------------------------------------------------------------ 会话

	function readSavedToken(): string | null {
		try {
			return sessionStorage.getItem(TOKEN_KEY);
		} catch {
			return null;
		}
	}

	function writeSavedToken(value: string | null): void {
		try {
			if (value) sessionStorage.setItem(TOKEN_KEY, value);
			else sessionStorage.removeItem(TOKEN_KEY);
		} catch {
			// 隐私模式下 sessionStorage 可能不可写：Token 只留在内存里也没问题
		}
	}

	function showLogin(message = ''): void {
		if (loginPane) loginPane.hidden = false;
		if (mainPane) mainPane.hidden = true;
		if (message) setLoginStatus('err', message);
	}

	function showMain(login: string): void {
		if (loginPane) loginPane.hidden = true;
		if (mainPane) mainPane.hidden = false;
		if (loginName) loginName.textContent = `@${login}`;
		setLoginStatus('idle', '');
		selectTab('posts');
	}

	async function signIn(rawToken: string, remember: boolean): Promise<void> {
		const value = rawToken.trim();
		if (!value) {
			setLoginStatus('err', '请先粘贴 Personal Access Token。');
			tokenInput?.focus();
			return;
		}
		if (!value.startsWith('github_pat_') && !value.startsWith('ghp_')) {
			setLoginStatus('err', '这不像 GitHub Token：应该以 github_pat_ 或 ghp_ 开头，请检查是否复制完整。');
			tokenInput?.focus();
			return;
		}

		setLoginStatus('busy', '正在校验 Token 与仓库权限…');
		setBusy(loginBtn, true, '校验中…');
		try {
			// 先查仓库权限，403/404 的提示最具体；再取账号名
			if (!(await canWrite(REPO, value))) {
				throw new GitHubError(403, 'Token 没有 Contents 读写权限，或没勾选这个仓库。');
			}
			const me = await whoAmI(value);

			token = value;
			writeSavedToken(remember ? value : null);
			if (tokenInput) tokenInput.value = '';
			setLoginStatus('idle', '');
			showMain(me.login);
			setStatus('idle', `已连接 ${REPO.owner}/${REPO.repo}@${REPO.branch}，账号 @${me.login}。`);
		} catch (error) {
			setLoginStatus('err', describeError(error));
		} finally {
			setBusy(loginBtn, false);
		}
	}

	async function restoreSession(saved: string): Promise<void> {
		setLoginStatus('busy', '检测到本次会话已保存的 Token，正在校验…');
		setBusy(loginBtn, true, '校验中…');
		try {
			if (!(await canWrite(REPO, saved))) {
				throw new GitHubError(403, 'Token 没有 Contents 读写权限，或没勾选这个仓库。');
			}
			const me = await whoAmI(saved);
			token = saved;
			showMain(me.login);
			setStatus('idle', `已恢复会话：@${me.login}。`);
		} catch (error) {
			token = null;
			writeSavedToken(null);
			showLogin(`${describeError(error)}（已清除保存的 Token，请重新粘贴。）`);
		} finally {
			setBusy(loginBtn, false);
		}
	}

	function signOut(): void {
		token = null;
		posts = [];
		postsLoaded = false;
		closeEditor();
		writeSavedToken(null);
		if (postList) postList.replaceChildren();
		if (loginName) loginName.textContent = '—';
		showLogin();
		setLoginStatus('idle', '已退出，本标签页里保存的 Token 已清除。');
	}

	// ------------------------------------------------------------ Tab

	function selectTab(name: string): void {
		for (const button of tabButtons) {
			button.setAttribute('aria-selected', String(button.dataset.tab === name));
			button.classList.toggle('is-active', button.dataset.tab === name);
		}
		for (const panel of panels) panel.hidden = panel.dataset.panel !== name;
		if (name === 'posts' && token && !postsLoaded) void loadPosts();
	}

	// ------------------------------------------------------------ 文章列表

	function sortPosts(): void {
		posts.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
	}

	function makeBadge(text: string, tone: 'ok' | 'dim' | 'err'): HTMLElement {
		const badge = document.createElement('span');
		badge.className = `adm-badge adm-badge--${tone}`;
		badge.textContent = text;
		return badge;
	}

	function renderPosts(): void {
		if (!postList) return;
		postList.replaceChildren();

		if (!posts.length) {
			if (postsHint) {
				postsHint.hidden = false;
				postsHint.textContent = 'src/content/blog/ 里还没有文章，点「新建文章」写第一篇。';
			}
			return;
		}
		if (postsHint) postsHint.hidden = true;

		for (const post of posts) {
			const item = document.createElement('li');
			item.className = 'adm-post';

			const button = document.createElement('button');
			button.type = 'button';
			button.className = 'adm-post-btn';
			button.dataset.postOpen = post.path;
			button.title = post.path;
			button.setAttribute('aria-label', `编辑 ${post.title || post.name}`);

			const title = document.createElement('span');
			title.className = 'adm-post-title';
			title.textContent = post.title || post.name;

			const meta = document.createElement('span');
			meta.className = 'adm-post-meta';
			meta.textContent = `${post.date || '无日期'} · ${post.name}`;

			const badges = document.createElement('span');
			badges.className = 'adm-post-badges';
			if (post.featured) badges.append(makeBadge('精品', 'ok'));
			if (post.draft) badges.append(makeBadge('草稿', 'dim'));
			if (post.problem) badges.append(makeBadge('读取失败', 'err'));

			button.append(title, meta, badges);
			item.append(button);
			postList.append(item);
		}
	}

	async function loadPosts(): Promise<void> {
		if (!token) return;
		const current = token;
		postsLoaded = false;
		if (postsHint) {
			postsHint.hidden = false;
			postsHint.textContent = '正在读取 src/content/blog/ …';
		}
		try {
			const entries = await listDir(REPO, current, BLOG_DIR);
			const files = entries.filter((entry) => entry.type === 'file' && /\.mdx?$/i.test(entry.name));

			// 每个文件都要单独取一次内容才能读到标题和 featured；文章不多，够用
			const loaded = await Promise.all(
				files.map(async (file): Promise<PostMeta> => {
					const fallback: PostMeta = {
						path: file.path,
						name: file.name,
						title: file.name.replace(/\.mdx?$/i, ''),
						date: '',
						featured: false,
						draft: false,
						sha: file.sha,
					};
					try {
						const content = await readTextFile(REPO, current, file.path);
						if (!content) return { ...fallback, problem: '读取失败' };
						const { data } = splitFrontmatter(content.text);
						return {
							...fallback,
							sha: content.sha,
							title: asString(data.title) || fallback.title,
							date: dateOnly(asString(data.pubDate) || asString(data.date)),
							featured: asBool(data.featured),
							draft: asBool(data.draft),
						};
					} catch (error) {
						return { ...fallback, problem: describeError(error) };
					}
				}),
			);

			if (token !== current) return; // 期间退出登录了
			posts = loaded;
			sortPosts();
			postsLoaded = true;
			renderPosts();
		} catch (error) {
			if (token !== current) return;
			if (postsHint) {
				postsHint.hidden = false;
				postsHint.textContent = '读取文章列表失败，稍后点「刷新列表」重试。';
			}
			setStatus('err', describeError(error));
		}
	}

	// ------------------------------------------------------------ 文章编辑器

	function editorField(name: FieldName): HTMLElement | null {
		return editor ? editor.querySelector<HTMLElement>(`[data-field="${name}"]`) : null;
	}

	function fieldText(name: FieldName): string {
		const element = editorField(name) as HTMLInputElement | HTMLTextAreaElement | null;
		return element ? element.value : '';
	}

	function fieldChecked(name: FieldName): boolean {
		const element = editorField(name) as HTMLInputElement | null;
		return Boolean(element?.checked);
	}

	function setFieldText(name: FieldName, value: string): void {
		const element = editorField(name) as HTMLInputElement | HTMLTextAreaElement | null;
		if (element) element.value = value;
	}

	function setFieldChecked(name: FieldName, value: boolean): void {
		const element = editorField(name) as HTMLInputElement | null;
		if (element) element.checked = value;
	}

	function focusField(name: FieldName): void {
		(editorField(name) as HTMLInputElement | null)?.focus();
	}

	function resetDeleteArm(): void {
		deleteArmed = false;
		window.clearTimeout(deleteTimer);
		if (deleteBtn) {
			deleteBtn.textContent = '删除这篇文章';
			deleteBtn.disabled = false;
		}
	}

	function showEditor(visible: boolean): void {
		if (editor) editor.hidden = !visible;
		if (visible) {
			if (createForm) createForm.hidden = true;
			editor?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		}
	}

	function closeEditor(): void {
		editing = null;
		if (editor) editor.hidden = true;
		if (editorPath) editorPath.textContent = '';
		resetDeleteArm();
	}

	function fillEditor(
		target: { path: string; sha: string },
		data: Frontmatter,
		body: string,
		fallbackTitle: string,
	): void {
		editing = target;
		setFieldText('title', asString(data.title) || fallbackTitle);
		setFieldText('description', asString(data.description));
		setFieldText('pubDate', dateOnly(asString(data.pubDate)) || todayStr());
		setFieldText('tags', asTags(data.tags).join(', '));
		setFieldText('heroImage', asString(data.heroImage));
		setFieldChecked('featured', asBool(data.featured));
		setFieldChecked('draft', asBool(data.draft));
		setFieldText('body', body.replace(/^\n+/, ''));
		if (editorPath) editorPath.textContent = target.sha ? target.path : `${target.path}（新建，保存后创建）`;
		resetDeleteArm();
		showEditor(true);
	}

	async function openEditor(path: string): Promise<void> {
		if (!token) return;
		setStatus('busy', `正在读取 ${path} …`);
		try {
			const content = await readTextFile(REPO, token, path);
			if (!content) throw new GitHubError(404, `找不到 ${path}，它可能已经被删掉了。`);
			const { data, body } = splitFrontmatter(content.text);
			const name = path.split('/').pop() ?? path;
			fillEditor({ path, sha: content.sha }, data, body, name.replace(/\.mdx?$/i, ''));
			setStatus('idle', `已打开 ${path}。`);
			focusField('title');
		} catch (error) {
			setStatus('err', describeError(error));
		}
	}

	function openNewEditor(slug: string): void {
		const path = `${BLOG_DIR}/${slug}.md`;
		fillEditor({ path, sha: '' }, {}, '', slug);
		setFieldChecked('draft', true); // 新文章默认草稿，写完再取消
		setStatus('busy', `已打开新建草稿 ${path}：填好内容后点「保存到 main」才会提交。`);
		focusField('title');
	}

	function validateHeroImage(value: string): string | null {
		if (!value) return null;
		if (value.startsWith('/')) {
			return 'heroImage 要写相对 src/content/blog/ 的路径，例如 ../../assets/blog/hero-01.jpg，不要以 / 开头。';
		}
		if (!value.startsWith('../../assets/')) {
			return 'heroImage 必须以 ../../assets/ 开头（相对于 src/content/blog/），例如 ../../assets/blog/hero-01.jpg。';
		}
		return null;
	}

	async function savePost(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (!token) {
			setStatus('err', '登录已失效，请退出后重新粘贴 Token。');
			return;
		}
		if (!editing) {
			setStatus('err', '请先在列表里点开一篇文章（或「新建文章」）。');
			return;
		}

		const target = editing;
		const title = fieldText('title').trim();
		const description = fieldText('description').trim();
		const pubDate = fieldText('pubDate').trim();
		const heroImage = fieldText('heroImage').trim();
		const tags = parseTags(fieldText('tags'));
		const featured = fieldChecked('featured');
		const draft = fieldChecked('draft');
		const body = fieldText('body');

		if (!title) {
			setStatus('err', '标题 title 不能为空。');
			focusField('title');
			return;
		}
		if (!description) {
			setStatus('err', '摘要 description 不能为空（content.config.ts 要求 string）。');
			focusField('description');
			return;
		}
		if (!/^\d{4}-\d{2}-\d{2}$/.test(pubDate)) {
			setStatus('err', '发布日期 pubDate 必须是 YYYY-MM-DD 格式。');
			focusField('pubDate');
			return;
		}
		const heroProblem = validateHeroImage(heroImage);
		if (heroProblem) {
			setStatus('err', heroProblem);
			focusField('heroImage');
			return;
		}

		const content = buildPostFile({ title, description, pubDate, heroImage, tags, featured, draft, body });
		setBusy(saveBtn, true, '提交中…');
		setStatus('busy', `正在提交 ${target.path} 到 ${REPO.branch} …`);
		try {
			const result = await putFile(REPO, token, {
				path: target.path,
				message: `${target.sha ? 'content: 更新' : 'content: 新建'}《${title}》`,
				content,
				...(target.sha ? { sha: target.sha } : {}),
			});

			editing = { path: target.path, sha: result.sha };
			const name = target.path.split('/').pop() ?? target.path;
			const meta: PostMeta = {
				path: target.path,
				name,
				title,
				date: pubDate,
				featured,
				draft,
				sha: result.sha,
			};
			const index = posts.findIndex((post) => post.path === target.path);
			if (index >= 0) posts[index] = meta;
			else posts.unshift(meta);
			sortPosts();
			renderPosts();
			if (editorPath) editorPath.textContent = target.path;
			setStatus('ok', `${SUBMIT_OK}（${target.path}${featured ? '，已设为精品' : ''}）`);
		} catch (error) {
			setStatus('err', describeError(error));
		} finally {
			setBusy(saveBtn, false);
		}
	}

	async function removePost(): Promise<void> {
		if (!token) {
			setStatus('err', '登录已失效，请重新粘贴 Token。');
			return;
		}
		if (!editing) {
			setStatus('err', '没有打开中的文章。');
			return;
		}
		const target = editing;

		// 还没提交过的新文件：关掉编辑器就行
		if (!target.sha) {
			closeEditor();
			setStatus('idle', '这篇还没有提交到 main，已取消编辑。');
			return;
		}

		if (!deleteArmed) {
			deleteArmed = true;
			if (deleteBtn) deleteBtn.textContent = '再点一次，确认删除';
			window.clearTimeout(deleteTimer);
			deleteTimer = window.setTimeout(resetDeleteArm, 6000);
			setStatus('busy', `即将删除 ${target.path}：6 秒内再点一次按钮确认。`);
			return;
		}

		resetDeleteArm();
		if (deleteBtn) deleteBtn.disabled = true;
		setStatus('busy', `正在删除 ${target.path} …`);
		try {
			const title = fieldText('title').trim() || target.path;
			await deleteFile(REPO, token, {
				path: target.path,
				sha: target.sha,
				message: `content: 删除《${title}》`,
			});
			posts = posts.filter((post) => post.path !== target.path);
			renderPosts();
			closeEditor();
			setStatus('ok', `${SUBMIT_OK}（已删除 ${target.path}）`);
		} catch (error) {
			setStatus('err', describeError(error));
		} finally {
			resetDeleteArm();
		}
	}

	// ------------------------------------------------------------ 照片

	function refreshPhotoInfo(): void {
		if (!photoInfo) return;
		const file = photoFile?.files?.[0];
		photoInfo.textContent = file ? `已选择：${file.name} · ${formatSize(file.size)}` : '尚未选择图片。';
	}

	async function submitPhoto(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (!token) {
			setStatus('err', '请先登录。');
			return;
		}
		const file = photoFile?.files?.[0];
		if (!file) {
			setStatus('err', '请先选择一张图片。');
			return;
		}
		const ext = extOf(file.name);
		if (!IMAGE_EXTS.includes(ext)) {
			setStatus('err', `不支持的图片格式 ${ext ? `.${ext}` : '（没有扩展名）'}，请用 ${IMAGE_EXTS.join(' / ')}。`);
			return;
		}
		if (file.size > MAX_IMAGE_BYTES) {
			setStatus('err', `图片 ${formatSize(file.size)} 超过 8MB 上限，请先压缩再上传。`);
			return;
		}

		const title = photoTitle?.value.trim() ?? '';
		const caption = photoCaption?.value.trim() ?? '';
		const date = photoDate?.value || todayStr();
		const tags = parseTags(photoTags?.value ?? '');
		const slug = slugify(file.name) || stampSlug('photo');

		const assetPath = `${GALLERY_ASSET_DIR}/${slug}.${ext}`;
		const contentPath = `${GALLERY_CONTENT_DIR}/${slug}.md`;
		const imageRef = `../../assets/gallery/${slug}.${ext}`;

		setBusy(photoSubmit, true, '上传中…');
		setStatus('busy', `正在检查 ${slug} 是否重名…`);
		try {
			const [existingContent, existingAssets] = await Promise.all([
				listDir(REPO, token, GALLERY_CONTENT_DIR),
				listDir(REPO, token, GALLERY_ASSET_DIR),
			]);
			const clash =
				existingContent.some((entry) => entry.type === 'file' && entry.name === `${slug}.md`) ||
				existingAssets.some((entry) => entry.type === 'file' && entry.name.toLowerCase() === `${slug}.${ext}`);
			if (clash) {
				throw new GitHubError(409, `src/assets/gallery/ 或 src/content/gallery/ 里已经有 ${slug}，请把图片改名（比如加 -2）再传。`);
			}

			setStatus('busy', `正在上传 ${assetPath} …`);
			const base64 = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
			await putBinary(REPO, token, {
				path: assetPath,
				message: `assets: 上传照片 ${slug}.${ext}`,
				base64,
			});

			setStatus('busy', `图片已上传，正在写入 ${contentPath} …`);
			await putFile(REPO, token, {
				path: contentPath,
				message: `content: 新增照片 ${slug}`,
				content: buildGalleryFile({ title, date, image: imageRef, caption, tags }),
			});

			setStatus('ok', `${SUBMIT_OK}（${contentPath}）`);
			if (photoForm) photoForm.reset();
			if (photoDate) photoDate.value = todayStr();
			refreshPhotoInfo();
		} catch (error) {
			setStatus(
				'err',
				`${describeError(error)} 如果图片已经上传成功，请到 GitHub 上删掉再重试，避免留下孤立文件。`,
			);
		} finally {
			setBusy(photoSubmit, false);
		}
	}

	// ------------------------------------------------------------ 音乐

	function refreshMusicInfo(): void {
		if (!musicInfo) return;
		const file = musicFile?.files?.[0];
		musicInfo.textContent = file ? `已选择：${file.name} · ${formatSize(file.size)}` : '尚未选择音频。';
	}

	async function submitMusic(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (!token) {
			setStatus('err', '请先登录。');
			return;
		}
		const file = musicFile?.files?.[0];
		if (!file) {
			setStatus('err', '请先选择一个音频文件。');
			return;
		}
		const ext = extOf(file.name);
		if (!AUDIO_EXTS.includes(ext)) {
			setStatus('err', `不支持的音频格式 ${ext ? `.${ext}` : '（没有扩展名）'}，请用 ${AUDIO_EXTS.join(' / ')}。`);
			return;
		}
		if (file.size > MAX_AUDIO_BYTES) {
			setStatus('err', `音频 ${formatSize(file.size)} 超过 25MB 上限，请先转码压缩。`);
			return;
		}

		const title = musicTitle?.value.trim() ?? '';
		if (!title) {
			setStatus('err', '曲目标题 title 不能为空。');
			musicTitle?.focus();
			return;
		}
		const artist = musicArtist?.value.trim() ?? '';
		const slug = slugify(file.name) || stampSlug('track');
		const audioPath = `${AUDIO_DIR}/${slug}.${ext}`;
		const src = `/audio/${slug}.${ext}`;

		setBusy(musicSubmit, true, '上传中…');
		setStatus('busy', `正在检查 public/audio/ 里是否已有 ${slug}.${ext} …`);
		try {
			const existing = await listDir(REPO, token, AUDIO_DIR);
			if (existing.some((entry) => entry.type === 'file' && entry.name.toLowerCase() === `${slug}.${ext}`)) {
				throw new GitHubError(409, `public/audio/ 里已经有 ${slug}.${ext}，请把音频改名后再传。`);
			}

			setStatus('busy', `正在上传 ${audioPath} …`);
			const base64 = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
			await putBinary(REPO, token, {
				path: audioPath,
				message: `assets: 上传音频 ${slug}.${ext}`,
				base64,
			});

			setStatus('busy', '音频已上传，正在更新 src/data/playlist.json …');
			const playlist = await readJsonFile<Record<string, unknown>>(REPO, token, PLAYLIST_PATH);
			const data: Record<string, unknown> =
				playlist && playlist.data && typeof playlist.data === 'object' && !Array.isArray(playlist.data)
					? { ...playlist.data }
					: { tracks: [] };
			const tracks = Array.isArray(data.tracks) ? [...(data.tracks as unknown[])] : [];
			if (tracks.some((track) => (track as { src?: unknown })?.src === src)) {
				throw new GitHubError(409, `播放列表里已经有 ${src} 了。`);
			}
			tracks.push({ title, artist, src });
			data.tracks = tracks;

			await putFile(REPO, token, {
				path: PLAYLIST_PATH,
				message: `content: 新增曲目《${title}》`,
				content: `${JSON.stringify(data, null, 2)}\n`,
				...(playlist ? { sha: playlist.sha } : {}),
			});

			setStatus('ok', `${SUBMIT_OK}（${PLAYLIST_PATH}）`);
			if (musicForm) musicForm.reset();
			refreshMusicInfo();
		} catch (error) {
			setStatus(
				'err',
				`${describeError(error)} 如果音频已经上传成功，请到 GitHub 上删掉再重试，或手动把曲目补进 playlist.json。`,
			);
		} finally {
			setBusy(musicSubmit, false);
		}
	}

	// ------------------------------------------------------------ 绑定

	on(loginForm, 'submit', (event) => {
		event.preventDefault();
		void signIn(tokenInput?.value ?? '', rememberInput?.checked ?? true);
	});
	on(logoutBtn, 'click', signOut);

	for (const button of tabButtons) {
		on(button, 'click', () => selectTab(button.dataset.tab ?? 'posts'));
	}

	on(postsRefresh, 'click', () => {
		if (token) void loadPosts();
	});

	on(createToggle, 'click', () => {
		if (!createForm) return;
		createForm.hidden = !createForm.hidden;
		if (!createForm.hidden) newSlug?.focus();
	});

	on(createCancel, 'click', () => {
		if (createForm) createForm.hidden = true;
	});

	on(createForm, 'submit', (event) => {
		event.preventDefault();
		const slug = (newSlug?.value ?? '').trim().toLowerCase();
		if (!SLUG_RE.test(slug)) {
			setStatus('err', 'slug 只能用英文小写字母、数字和连字符（例如 my-new-post）。');
			newSlug?.focus();
			return;
		}
		const path = `${BLOG_DIR}/${slug}.md`;
		if (posts.some((post) => post.path === path)) {
			setStatus('err', `${path} 已经存在：直接在下面的列表里点开它编辑。`);
			return;
		}
		if (newSlug) newSlug.value = '';
		openNewEditor(slug);
	});

	on(postList, 'click', (event) => {
		const button = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-post-open]');
		const path = button?.getAttribute('data-post-open');
		if (path) void openEditor(path);
	});

	on(editor, 'submit', (event) => {
		void savePost(event);
	});
	on(deleteBtn, 'click', () => {
		void removePost();
	});
	on(closeBtn, 'click', closeEditor);

	on(photoFile, 'change', refreshPhotoInfo);
	on(photoForm, 'submit', (event) => {
		void submitPhoto(event);
	});
	on(musicFile, 'change', refreshMusicInfo);
	on(musicForm, 'submit', (event) => {
		void submitMusic(event);
	});

	// ---- 初始状态 ----
	if (photoDate && !photoDate.value) photoDate.value = todayStr();
	refreshPhotoInfo();
	refreshMusicInfo();

	const saved = readSavedToken();
	if (saved) void restoreSession(saved);
	else showLogin();
}

// View Transitions 切页后重新绑定；首次加载也走一遍（boot 自带幂等保护）
document.addEventListener('astro:page-load', boot);
if (document.readyState !== 'loading') boot();
else document.addEventListener('DOMContentLoaded', boot);
