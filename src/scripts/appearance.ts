/**
 * 外观调色盘：主题 / 强调色 / 雾面 / 背景模式 / 底图库。
 *
 * 设计要点：
 * - 偏好存 localStorage（很小，BaseHead 的内联脚本首屏就能读到，不闪旧色）；
 * - 本地上传的图片存 IndexedDB 的 Blob（不塞爆 localStorage，也不受 5MB 限制）；
 * - 外链图片只存 URL，不下载，避免跨域与 CSP 问题；
 * - ASCII 背景按需 dynamic import，默认模式完全不加载那 900 行 WebGL 代码；
 * - 页头有 transition:persist，面板 DOM 换页保活，所以模块级监听只注册一次；
 *   但 .site-bg 每页都是新节点，故 before-swap 销毁、page-load 重建背景。
 */

const KEY = 'ystlr.appearance';
const DB_NAME = 'ystlr-appearance';
const DB_STORE = 'images';
const MAX_FILE = 8 * 1024 * 1024;

export type ThemeChoice = 'dark' | 'light' | 'system';
export type GlassChoice = 'frosted' | 'clear' | 'solid';
export type AccentChoice = 'orange' | 'blue' | 'teal' | 'violet' | 'pink' | 'lime';
export type BgMode = 'topo' | 'ascii' | 'image' | 'plain';

interface Appearance {
	theme: ThemeChoice;
	glass: GlassChoice;
	accent: AccentChoice;
	bgMode: BgMode;
	bgId: string;
	overlay: number;
	alpha?: number;
	blur?: number;
}

interface StoredImage {
	id: string;
	name: string;
	kind: 'url' | 'file';
	url?: string;
	blob?: Blob;
	createdAt: number;
}

const DEFAULTS: Appearance = {
	theme: 'dark',
	glass: 'frosted',
	accent: 'orange',
	bgMode: 'topo',
	bgId: '',
	overlay: 0.55,
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const uid = () => `bg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

function readState(): Appearance {
	try {
		const raw = JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<Appearance>;
		return {
			...DEFAULTS,
			...raw,
			overlay: clamp(Number(raw.overlay ?? DEFAULTS.overlay), 0, 0.95),
		};
	} catch {
		return { ...DEFAULTS };
	}
}

function writeState(state: Appearance) {
	localStorage.setItem(KEY, JSON.stringify(state));
	// BaseHead 的内联脚本会重刷 html 上的 data-* 与 CSS 变量
	window.__syncAppearance?.();
}

/* ---------------- IndexedDB ---------------- */

function openDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, 1);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: 'id' });
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(DB_STORE, mode);
		const req = fn(tx.objectStore(DB_STORE));
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
		tx.oncomplete = () => db.close();
	});
}

const listImages = () => withStore<StoredImage[]>('readonly', (s) => s.getAll() as IDBRequest<StoredImage[]>);
const putImage = (image: StoredImage) => withStore<IDBValidKey>('readwrite', (s) => s.put(image));
const removeImage = (id: string) => withStore<undefined>('readwrite', (s) => s.delete(id) as IDBRequest<undefined>);

/* ---------------- 背景层 ---------------- */

let state = readState();
let ascii: { dispose(): void } | null = null;
let mountingAscii = false;
/** 每张本地图片一个 objectURL，长期缓存；只在替换/删除时回收，避免 revoke 掉正在用的底图 */
const objectUrls = new Map<string, string>();
let root: HTMLElement | null = null;
let wired = false;

function revokeImage(id: string) {
	const url = objectUrls.get(id);
	if (url) URL.revokeObjectURL(url);
	objectUrls.delete(id);
}

function imageSrc(image: StoredImage): string {
	if (image.kind === 'url') return image.url || '';
	if (!image.blob) return '';
	let url = objectUrls.get(image.id);
	if (!url) {
		url = URL.createObjectURL(image.blob);
		objectUrls.set(image.id, url);
	}
	return url;
}

async function refreshBackdrop() {
	const layer = document.querySelector<HTMLElement>('[data-site-bg-image]');
	if (!layer) return;
	const stateNow = state;
	if (stateNow.bgMode !== 'image' || !stateNow.bgId) {
		layer.style.backgroundImage = '';
		return;
	}
	try {
		const images = await listImages();
		const image = images.find((item) => item.id === stateNow.bgId);
		layer.style.backgroundImage = image ? `url("${imageSrc(image)}")` : '';
	} catch {
		layer.style.backgroundImage = '';
	}
}

function disposeAscii() {
	if (!ascii) return;
	ascii.dispose();
	ascii = null;
	const host = document.querySelector<HTMLElement>('[data-site-bg-ascii]');
	if (host) host.replaceChildren();
}

async function mountAscii() {
	const host = document.querySelector<HTMLElement>('[data-site-bg-ascii]');
	if (!host || ascii || mountingAscii || state.bgMode !== 'ascii') return;
	mountingAscii = true;
	try {
		const { GradientASCII } = await import('./gradient-ascii');
		// 等待期间用户可能已经切走模式 / 换了页，再确认一次
		if (state.bgMode !== 'ascii' || !host.isConnected || ascii) return;
		const light = (window.__getTheme?.() ?? 'dark') === 'light';
		ascii = new GradientASCII(host, {
				colors: light
					? ['#e8e3d8', '#c4783f', '#ff8a3d', '#fff5e8']
					: ['#1b1108', '#7a3410', '#ff6a2b', '#ffd9b8'],
				shape: 'horizon',
				characters: ' =+xX0S8#@',
				cellSize: 18,
				density: 0.78,
				glyphOpacity: 0.8,
				glow: 0.2,
				softness: 0.6,
				speed: 0.7,
				gradientOpacity: 0.85,
				grain: 0.06,
				mouseInteraction: true,
				clickEffect: 'wave',
				lightMode: light,
				intro: true,
				dpr: 1.5,
			});
	} catch (err) {
		console.warn('[appearance] ASCII 背景初始化失败', err);
	} finally {
		mountingAscii = false;
	}
}

function syncBackdrop() {
	if (state.bgMode === 'ascii') void mountAscii();
	else disposeAscii();
	void refreshBackdrop();
}

/* ---------------- 面板 UI ---------------- */

function setPressed(scope: HTMLElement, selector: string, value: string) {
	scope.querySelectorAll<HTMLButtonElement>(selector).forEach((btn) => {
		const key = btn.dataset.apValue || '';
		btn.setAttribute('aria-pressed', String(key === value));
	});
}

function syncUI() {
	if (!root) return;
	const r = root;
	setPressed(r, '[data-ap-theme]', state.theme);
	setPressed(r, '[data-ap-glass]', state.glass);
	setPressed(r, '[data-ap-accent]', state.accent);
	setPressed(r, '[data-ap-bgmode]', state.bgMode);

	const fill = (name: string, value: number, label: string) => {
		const input = r.querySelector<HTMLInputElement>(`[data-ap-range="${name}"]`);
		const out = r.querySelector<HTMLElement>(`[data-ap-out="${name}"]`);
		if (input) input.value = String(value);
		if (out) out.textContent = label;
	};
	const glassPreset = state.glass === 'clear' ? 0.24 : state.glass === 'solid' ? 0.96 : 0.62;
	const blurPreset = state.glass === 'clear' ? 32 : state.glass === 'solid' ? 6 : 26;
	fill('alpha', state.alpha ?? glassPreset, `${Math.round((state.alpha ?? glassPreset) * 100)}%`);
	fill('blur', state.blur ?? blurPreset, `${state.blur ?? blurPreset}px`);
	fill('overlay', state.overlay, `${Math.round(state.overlay * 100)}%`);

	const onlyImage = r.querySelector<HTMLElement>('[data-ap-only-image]');
	if (onlyImage) onlyImage.hidden = state.bgMode !== 'image';
}

async function renderImages() {
	if (!root) return;
	const list = root.querySelector<HTMLElement>('[data-ap-images]');
	if (!list) return;
	let images: StoredImage[] = [];
	try {
		images = (await listImages()).sort((a, b) => b.createdAt - a.createdAt);
	} catch {
		/* IndexedDB 不可用（隐私模式）时列表留空，不影响其它设置 */
	}
	list.replaceChildren();
	if (!images.length) {
		const p = document.createElement('p');
		p.className = 'ap-empty';
		p.textContent = '还没有底图，粘贴图片网址或从电脑选一张。';
		list.append(p);
		return;
	}
	for (const image of images) {
		const item = document.createElement('div');
		item.className = 'ap-img';
		item.dataset.apImg = image.id;
		if (image.id === state.bgId) item.classList.add('is-active');

		const thumb = document.createElement('button');
		thumb.type = 'button';
		thumb.className = 'ap-img__thumb';
		thumb.title = '设为当前底图';
		thumb.setAttribute('aria-label', `设为底图：${image.name}`);
		const src = imageSrc(image);
		thumb.style.backgroundImage = src ? `url("${src}")` : '';
		thumb.addEventListener('click', () => {
			state.bgId = image.id;
			state.bgMode = 'image';
			writeState(state);
			syncUI();
			void renderImages();
			syncBackdrop();
		});

		const name = document.createElement('span');
		name.className = 'ap-img__name';
		name.textContent = image.name;
		name.title = image.name;

		const replace = document.createElement('button');
		replace.type = 'button';
		replace.className = 'ap-img__act';
		replace.textContent = '替换';
		replace.title = '用另一张图片替换（本地文件或网址）';
		replace.addEventListener('click', () => pickFile((file) => void saveFile(file, image.id)));

		const del = document.createElement('button');
		del.type = 'button';
		del.className = 'ap-img__act ap-img__act--danger';
		del.textContent = '删除';
		del.addEventListener('click', () => void deleteImage(image.id));

		item.append(thumb, name, replace, del);
		list.append(item);
	}
}

function pickFile(onPick: (file: File) => void) {
	const input = document.createElement('input');
	input.type = 'file';
	input.accept = 'image/*';
	input.addEventListener('change', () => {
		const file = input.files?.[0];
		if (file) onPick(file);
	});
	input.click();
}

async function saveFile(file: File, id = uid()) {
	if (!file.type.startsWith('image/')) return setHint('请选择图片文件。', true);
	if (file.size > MAX_FILE) return setHint('图片超过 8MB，换一张小一点的。', true);
	revokeImage(id);
	await putImage({ id, name: file.name, kind: 'file', blob: file, createdAt: Date.now() });
	state.bgId = id;
	state.bgMode = 'image';
	writeState(state);
	syncUI();
	await renderImages();
	syncBackdrop();
	setHint(`已添加「${file.name}」并设为底图。`);
}

async function saveUrl(raw: string, id = uid()) {
	const url = raw.trim();
	if (!/^https?:\/\//i.test(url) && !/^data:image\//i.test(url)) {
		return setHint('请填 http(s) 开头的图片网址。', true);
	}
	await putImage({ id, name: url.replace(/^https?:\/\//, '').slice(0, 28) || '外链图片', kind: 'url', url, createdAt: Date.now() });
	state.bgId = id;
	state.bgMode = 'image';
	writeState(state);
	syncUI();
	await renderImages();
	syncBackdrop();
	setHint('已添加并设为底图。');
}

async function deleteImage(id: string) {
	revokeImage(id);
	await removeImage(id);
	if (state.bgId === id) {
		state.bgId = '';
		state.bgMode = 'plain';
		writeState(state);
		syncBackdrop();
	}
	syncUI();
	await renderImages();
	setHint('已删除底图。');
}

let hintTimer = 0;
function setHint(text: string, warn = false) {
	if (!root) return;
	const hint = root.querySelector<HTMLElement>('[data-ap-hint]');
	if (!hint) return;
	hint.textContent = text;
	hint.dataset.apWarn = warn ? 'true' : 'false';
	window.clearTimeout(hintTimer);
	hintTimer = window.setTimeout(() => {
		hint.textContent = '';
	}, 3600);
}

function update<K extends keyof Appearance>(key: K, value: Appearance[K], remountAscii = false) {
	state = { ...state, [key]: value };
	writeState(state);
	syncUI();
	// 主题切换要重建 ASCII（lightMode 在构造时读取）；只销毁，
	// 由 syncBackdrop 走唯一的挂载路径，避免并发创建两个实例
	if (remountAscii && state.bgMode === 'ascii') disposeAscii();
	syncBackdrop();
}

function openPanel(panel: HTMLElement, button: HTMLButtonElement) {
	panel.hidden = false;
	button.setAttribute('aria-expanded', 'true');
	syncUI();
	void renderImages();
}

function closePanel(panel: HTMLElement, button: HTMLButtonElement) {
	panel.hidden = true;
	button.setAttribute('aria-expanded', 'false');
}

/** 由组件在 astro:page-load 时调用；页头 transition:persist 保活，故用 dataset 幂等 */
export function initAppearancePanel(el: HTMLElement) {
	state = readState();
	root = el;
	syncUI();
	void renderImages();
	syncBackdrop();
	if (wired) return;
	wired = true;

	const panel = el.querySelector<HTMLElement>('[data-ap-panel]');
	const button = el.querySelector<HTMLButtonElement>('[data-ap-toggle]');
	if (!panel || !button) return;

	button.addEventListener('click', () => {
		if (panel.hidden) openPanel(panel, button);
		else closePanel(panel, button);
	});

	document.addEventListener('pointerdown', (event) => {
		if (panel.hidden || el.contains(event.target as Node)) return;
		closePanel(panel, button);
	});
	document.addEventListener('keydown', (event) => {
		if (event.key === 'Escape' && !panel.hidden) {
			closePanel(panel, button);
			button.focus();
		}
	});

	const bindGroup = (selector: string, key: keyof Appearance, remountAscii = false) => {
		el.querySelectorAll<HTMLButtonElement>(selector).forEach((btn) => {
			btn.addEventListener('click', () => {
				const value = btn.dataset.apValue || '';
				// 切雾面档位时清掉滑块的用户覆盖值，让预设生效
				if (key === 'glass') {
					delete state.alpha;
					delete state.blur;
					state = { ...state, glass: value as GlassChoice };
					writeState(state);
					// BaseHead 会把旧的 inline 变量一直留着，显式清除
					document.documentElement.style.removeProperty('--glass-alpha-user');
					document.documentElement.style.removeProperty('--glass-blur-user');
					syncUI();
					return;
				}
				update(key, value as never, remountAscii);
			});
		});
	};
	bindGroup('[data-ap-theme]', 'theme', true);
	bindGroup('[data-ap-glass]', 'glass');
	bindGroup('[data-ap-accent]', 'accent');
	bindGroup('[data-ap-bgmode]', 'bgMode');

	el.querySelectorAll<HTMLInputElement>('[data-ap-range]').forEach((input) => {
		input.addEventListener('input', () => {
			const name = input.dataset.apRange || '';
			const value = Number(input.value);
			if (name === 'alpha') state.alpha = value;
			else if (name === 'blur') state.blur = value;
			else if (name === 'overlay') state.overlay = value;
			writeState(state);
			syncUI();
		});
	});

	el.querySelector<HTMLButtonElement>('[data-ap-add-file]')?.addEventListener('click', () =>
		pickFile((file) => void saveFile(file)),
	);
	const urlInput = el.querySelector<HTMLInputElement>('[data-ap-url]');
	const addUrl = () => {
		if (!urlInput?.value.trim()) return;
		void saveUrl(urlInput.value);
		urlInput.value = '';
	};
	el.querySelector<HTMLButtonElement>('[data-ap-add-url]')?.addEventListener('click', addUrl);
	urlInput?.addEventListener('keydown', (event) => {
		if (event.key === 'Enter') {
			event.preventDefault();
			addUrl();
		}
	});

	el.querySelector<HTMLButtonElement>('[data-ap-reset]')?.addEventListener('click', () => {
		state = { ...DEFAULTS };
		localStorage.setItem(KEY, JSON.stringify(state));
		document.documentElement.style.removeProperty('--glass-alpha-user');
		document.documentElement.style.removeProperty('--glass-blur-user');
		window.__syncAppearance?.();
		syncUI();
		syncBackdrop();
		setHint('外观已恢复默认（底图库保留）。');
	});

	// .site-bg 每页都是新节点：换页前销毁 WebGL，换页后按当前模式重建
	document.addEventListener('astro:before-swap', disposeAscii);
	document.addEventListener('astro:page-load', () => {
		state = readState();
		root = el;
		syncUI();
		void renderImages();
		syncBackdrop();
	});
}
