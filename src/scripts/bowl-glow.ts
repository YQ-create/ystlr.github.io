// @ts-nocheck
/**
 * BowlGlow —— 碗状辉光 canvas 引擎（1:1 移植「bowl-glow scroll hero」规范）。
 *
 * 96×60 小画布逐像素绘制，CSS 拉伸到全屏，浏览器双线性插值自然柔化。
 * 形状：48 点折线轮廓（CX = half·aspect·(1 − yy/tip)^0.72），像素到最近线段的精确距离场，
 * 内部取负，再减 RND=0.25 把底部圆化成宽 U；smoothstep 填充 + 三色混合（outside→rim→core）。
 * 滚动：q = scrollY/innerHeight，tip/half/soft 沿 10 个关键帧线性插值，cur 每帧 0.12 惯性追踪。
 * Intro：从 tip=-0.3/half=0.3/soft=0.1（纯白）出发，0.25s 后 1.05s smoothstep 落下绽放。
 * 呼吸漂移：tip += sin(t·0.00033+1.3)·0.02，half += sin(t·0.0005)·0.015。
 *
 * 配色从站点 CSS 变量解析（--bg 外圈 / --ochre 边缘 / --accent-deep 核心），
 * 深浅主题与调色盘切换时热更新，不重建循环。
 */

const COLS = 96;
const ROWS = 60;
const SEGS = 48;
const RND = 0.25;

// 滚动关键帧表（规范拟合值）
const Q = [0, 0.03, 0.08, 0.18, 0.4, 0.66, 0.87, 1.15, 1.43, 1.8];
const TABLE = {
	tip: [0.3, 0.45, 0.65, 0.8, 0.95, 1.05, 1.05, 1.1, 1.3, 2.4],
	half: [0.34, 0.38, 0.38, 0.38, 0.38, 0.46, 0.66, 0.9, 1.6, 3.0],
	soft: [0.22, 0.26, 0.22, 0.22, 0.19, 0.16, 0.13, 0.1, 0.1, 0.1],
};

const INTRO_DELAY = 250;
const INTRO_DUR = 1050;

function clamp(v, a, b) {
	return Math.min(b, Math.max(a, v));
}
function smoothstep01(x) {
	const t = clamp(x, 0, 1);
	return t * t * (3 - 2 * t);
}
function lerp(a, b, t) {
	return a + (b - a) * t;
}
function sample(table, q) {
	if (q <= Q[0]) return table[0];
	const last = Q.length - 1;
	if (q >= Q[last]) return table[last];
	for (let i = 1; i <= last; i++) {
		if (q <= Q[i]) {
			const t = (q - Q[i - 1]) / (Q[i] - Q[i - 1]);
			return lerp(table[i - 1], table[i], t);
		}
	}
	return table[last];
}

/** 点到线段的精确距离（规范要求线段而非最近点，避免缺口和尖刺） */
function distToSeg(px, py, x1, y1, x2, y2) {
	const vx = x2 - x1;
	const vy = y2 - y1;
	const wx = px - x1;
	const wy = py - y1;
	const len2 = vx * vx + vy * vy;
	let t = len2 > 0 ? (wx * vx + wy * vy) / len2 : 0;
	t = clamp(t, 0, 1);
	const dx = wx - t * vx;
	const dy = wy - t * vy;
	return Math.sqrt(dx * dx + dy * dy);
}

/** 从 CSS 变量读 RGB 三元组（如 "208, 132, 92"） */
function readRgbVar(name, fallback) {
	const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
	const parts = raw.split(',').map((n) => parseFloat(n));
	if (parts.length >= 3 && parts.every((n) => Number.isFinite(n))) return parts.slice(0, 3);
	return fallback;
}

const mounted = new Set();

export function mountBowlGlow(canvas) {
	const ctx = canvas.getContext('2d', { alpha: false });
	if (!ctx) return () => {};
	const image = ctx.createImageData(COLS, ROWS);
	const data = image.data;

	// 配色（站点 token）
	let outside = readRgbVar('--bg', [24, 21, 18]);
	let rim = readRgbVar('--ochre', [214, 168, 96]);
	let core = readRgbVar('--accent-deep', [238, 180, 140]);

	let raf = 0;
	let introDone = false;
	let introStart = 0;
	// intro 起点：纯白不可见
	let cur = { tip: -0.3, half: 0.3, soft: 0.1 };
	const introFrom = { tip: -0.3, half: 0.3, soft: 0.1 };

	const draw = (now) => {
		raf = 0;
		const q = window.scrollY / Math.max(1, window.innerHeight);
		const tTip = sample(TABLE.tip, q);
		const tHalf = sample(TABLE.half, q);
		const tSoft = sample(TABLE.soft, q);

		if (!introDone) {
			if (!introStart) introStart = now + INTRO_DELAY;
			const k = clamp((now - introStart) / INTRO_DUR, 0, 1);
			const e = smoothstep01(k);
			cur.tip = lerp(introFrom.tip, tTip, e);
			cur.half = lerp(introFrom.half, tHalf, e);
			cur.soft = lerp(introFrom.soft, tSoft, e);
			if (k >= 1) introDone = true;
		} else {
			// 呼吸漂移 + 惯性追踪
			const driftTip = tTip + Math.sin(now * 0.00033 + 1.3) * 0.02;
			const driftHalf = tHalf + Math.sin(now * 0.0005) * 0.015;
			cur.tip += (driftTip - cur.tip) * 0.12;
			cur.half += (driftHalf - cur.half) * 0.12;
			cur.soft += (tSoft - cur.soft) * 0.12;
		}

		const tip = cur.tip;
		const half = cur.half;
		const soft = Math.max(0.02, cur.soft);
		const aspect = window.innerWidth / Math.max(1, window.innerHeight);

		// 折线轮廓（对称右半边，yy 从 -0.3 到 tip）
		const pts = new Float64Array(SEGS * 2);
		for (let i = 0; i < SEGS; i++) {
			const yy = -0.3 + (tip + 0.3) * (i / (SEGS - 1));
			const base = 1 - yy / tip;
			const cx = half * aspect * Math.pow(Math.max(0, base), 0.72);
			pts[i * 2] = cx;
			pts[i * 2 + 1] = yy;
		}

		let p = 0;
		for (let py = 0; py < ROWS; py++) {
			const dy = (py + 0.5) / ROWS;
			for (let px = 0; px < COLS; px++) {
				const dx = Math.abs((px + 0.5) / COLS - 0.5) * aspect;

				// 到最近线段的距离
				let sd = Infinity;
				for (let i = 0; i < SEGS - 1; i++) {
					const d = distToSeg(dx, dy, pts[i * 2], pts[i * 2 + 1], pts[(i + 1) * 2], pts[(i + 1) * 2 + 1]);
					if (d < sd) sd = d;
				}
				// 内部取负
				const edgeX = half * aspect * Math.pow(Math.max(0, 1 - dy / tip), 0.72);
				if (dy < tip && dx < edgeX) sd = -sd;
				// 圆底：膨胀形状
				sd -= RND;

				// 填充量
				const g = 1 - smoothstep01((sd + soft) / (2 * soft));

				// 三色混合
				let r, gc, b;
				if (g < 0.38) {
					const t = smoothstep01(g / 0.38);
					r = lerp(outside[0], rim[0], t);
					gc = lerp(outside[1], rim[1], t);
					b = lerp(outside[2], rim[2], t);
				} else {
					const t = smoothstep01((g - 0.38) / 0.62);
					r = lerp(rim[0], core[0], t);
					gc = lerp(rim[1], core[1], t);
					b = lerp(rim[2], core[2], t);
				}
				data[p++] = r;
				data[p++] = gc;
				data[p++] = b;
				data[p++] = 255;
			}
		}
		ctx.putImageData(image, 0, 0);
		raf = requestAnimationFrame(draw);
	};

	const wake = () => {
		if (!raf) raf = requestAnimationFrame(draw);
	};

	const onScroll = () => wake();
	const onResize = () => wake();
	window.addEventListener('scroll', onScroll, { passive: true });
	window.addEventListener('resize', onResize);
	wake();

	const syncColors = () => {
		outside = readRgbVar('--bg', outside);
		rim = readRgbVar('--ochre', rim);
		core = readRgbVar('--accent-deep', core);
		wake();
	};
	document.addEventListener('theme-change', syncColors);
	document.addEventListener('accent-change', syncColors);

	const dispose = () => {
		if (raf) cancelAnimationFrame(raf);
		raf = 0;
		window.removeEventListener('scroll', onScroll);
		window.removeEventListener('resize', onResize);
		document.removeEventListener('theme-change', syncColors);
		document.removeEventListener('accent-change', syncColors);
		mounted.delete(canvas);
	};
	mounted.add(canvas);
	return dispose;
}

const disposers = new Map();

export function bootBowlGlow() {
	document.querySelectorAll('canvas[data-bowl-glow]').forEach((canvas) => {
		if (disposers.has(canvas)) return;
		disposers.set(canvas, mountBowlGlow(canvas));
	});
}

export function disposeBowlGlow() {
	for (const dispose of disposers.values()) dispose();
	disposers.clear();
}

document.addEventListener('astro:before-swap', disposeBowlGlow);
