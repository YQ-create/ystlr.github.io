// 底部 dock 导航的运行时。
//
// 只做四件事：入场、刷新当前页高亮、菜单面板的开合（含外部点击 / Esc / 焦点回收）、
// 以及换页后收起面板。样式全在 DockNav.astro 里，这里不碰视觉。
//
// 关键约定：dock 带 transition:persist，SPA 换页时元素被**保留**，所以
//   · 事件只在第一次绑一次，用 AbortController 管理（硬刷新才会重建）；
//   · 监听器内部一律用 querySelector 现查节点，不缓存引用，免得换页后指向已卸载的 DOM；
//   · astro:before-swap 里**不要** abort —— 那会把 astro:page-load 一起摘掉，
//     之后高亮就再也不更新了。

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let ac: AbortController | null = null;
let bound = false;

const dockEl = () => document.querySelector<HTMLElement>('[data-dock]');
const panelEl = () => document.querySelector<HTMLElement>('[data-dock-panel]');
const btnEl = () => document.querySelector<HTMLButtonElement>('[data-dock-menu]');

/** 按 pathname 标记当前项：/blog/xxx 命中 /blog，其余要精确匹配 */
function refreshActive() {
	const dock = dockEl();
	if (!dock) return;
	const path = location.pathname.replace(/\/+$/, '') || '/';
	dock.querySelectorAll<HTMLAnchorElement>('[data-dock-tab]').forEach((tab) => {
		const href = (tab.getAttribute('href') || '').replace(/\/+$/, '') || '/';
		const hit = href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`);
		tab.classList.toggle('is-active', hit);
		if (hit) tab.setAttribute('aria-current', 'page');
		else tab.removeAttribute('aria-current');
	});
	// 首页没有对应的标签页，让 wordmark 顶上「当前项」的位置
	dock.querySelector<HTMLElement>('.dock__mark')?.classList.toggle('is-active', path === '/');
}

function setOpen(open: boolean) {
	const panel = panelEl();
	const btn = btnEl();
	if (!panel || !btn) return;
	panel.classList.toggle('is-open', open);
	btn.classList.toggle('is-open', open);
	btn.setAttribute('aria-expanded', String(open));
	if (open) {
		// 打开后把焦点交给第一行，键盘用户可以立刻 Tab 走
		panel.querySelector<HTMLElement>('[data-dock-row]')?.focus({ preventScroll: true });
	} else if (panel.contains(document.activeElement)) {
		btn.focus({ preventScroll: true });
	}
}

function isOpen() {
	return panelEl()?.classList.contains('is-open') ?? false;
}

function bind() {
	if (bound) return;
	bound = true;

	ac?.abort();
	ac = new AbortController();
	const { signal } = ac;

	// 入场：两帧后再加类，确保初始状态先被浏览器记下；减少动态时直接到位
	const dock = dockEl();
	if (dock) {
		if (reducedMotion()) dock.classList.add('is-in');
		else requestAnimationFrame(() => requestAnimationFrame(() => dockEl()?.classList.add('is-in')));
	}

	document.addEventListener(
		'click',
		(e) => {
			const target = e.target as Element | null;
			if (!target) return;

			// 菜单点：开合
			if (target.closest('[data-dock-menu]')) {
				e.preventDefault();
				setOpen(!isOpen());
				return;
			}

			const row = target.closest('[data-dock-row]');
			if (!row) return;

			// 面板内任一行：先收起，再执行动作
			if (row.getAttribute('data-dock-action') === 'search') {
				// 复用页头已有的搜索入口，避免再写一套快捷键逻辑
				document.querySelector<HTMLElement>('[data-search-open]')?.click();
			}
			setOpen(false);
		},
		{ signal }
	);

	// 点空白处收起（pointerdown 更早，避免和上面的 click 抢顺序）
	document.addEventListener(
		'pointerdown',
		(e) => {
			if (!isOpen()) return;
			const t = e.target as Node | null;
			const panel = panelEl();
			const btn = btnEl();
			if (t && ((panel && panel.contains(t)) || (btn && btn.contains(t)))) return;
			setOpen(false);
		},
		{ signal }
	);

	document.addEventListener(
		'keydown',
		(e) => {
			if (e.key === 'Escape' && isOpen()) {
				e.stopPropagation();
				setOpen(false);
			}
		},
		{ signal }
	);

	// 换页：收起面板 + 重算高亮（不 abort，监听器要跨页活着）
	document.addEventListener('astro:before-swap', () => setOpen(false), { signal });
	document.addEventListener(
		'astro:page-load',
		() => {
			setOpen(false);
			refreshActive();
		},
		{ signal }
	);
}

export function initDockNav() {
	if (!dockEl()) return;
	bind();
	refreshActive();
}
