// @ts-nocheck
/**
 * LetterReveal —— 逐字揭示系统（1:1 移植「bowl-glow scroll hero」规范）。
 *
 * paint(chars, p, spread, final, accent, ghost) 给每个字符一个局部进度：
 *   t = clamp((p·(1+spread) − i/n) / spread)
 * 状态映射：
 *   t=0          → 透明度 0、ghost 色、blur 8px
 *   0→.35        → 透明度 0→1、ghost、blur 8→1.5px
 *   .35→.70      → 透明度 1、ghost→accent、blur 1.5→0
 *   .70→1        → 透明度 1、accent→final（.hl 标记的字符终色为 accent）。
 *
 * split(node) 把元素拆成逐字 span：词包在 inline-block nowrap 里（行内不断词），
 * 空白保留纯文本，<br> 保留，.hl 内的字符打标记。
 */

function clamp(v, a, b) {
	return Math.min(b, Math.max(a, v));
}
function lerp(a, b, t) {
	return a + (b - a) * t;
}

/** #rrggbb / rgb() → [r,g,b] */
function parseRGB(color) {
	if (!color) return [255, 255, 255];
	const s = String(color).trim();
	const m = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(s);
	if (m) {
		let hex = m[1];
		if (hex.length === 3) hex = hex.replace(/./g, (c) => c + c);
		return [0, 2, 4].map((o) => parseInt(hex.slice(o, o + 2), 16));
	}
	const n = s.match(/[\d.]+/g);
	if (n && n.length >= 3) return [Number(n[0]), Number(n[1]), Number(n[2])];
	return [255, 255, 255];
}

function mixRGB(a, b, t) {
	return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;
}

/**
 * 把元素的文本拆成逐字 span，返回字符数组（含 .hl 标记信息）。
 * 词包 inline-block nowrap，空白纯文本保留，<br> 保留。
 */
export function splitChars(el) {
	const chars = [];
	let index = 0;

	const wrapWord = (word, hl) => {
		const w = document.createElement('span');
		w.className = 'w';
		for (const ch of word) {
			const c = document.createElement('span');
			c.className = 'ch' + (hl ? ' ch--hl' : '');
			c.textContent = ch;
			w.appendChild(c);
			chars.push({ el: c, hl, i: index++ });
		}
		return w;
	};

	const walk = (node, hl) => {
		if (node.nodeType === Node.TEXT_NODE) {
			const text = node.textContent || '';
			const frag = document.createDocumentFragment();
			// 词 = 连续非空白；空白按原样保留
			const parts = text.split(/(\s+)/);
			for (const part of parts) {
				if (!part) continue;
				if (/^\s+$/.test(part)) {
					frag.appendChild(document.createTextNode(part));
				} else {
					// 中文逐字拆（CJK 无空格分词），拉丁词整体 nowrap
					const tokens = part.match(/[\u4e00-\u9fff\u3400-\u4dbf]|[^\u4e00-\u9fff\u3400-\u4dbf]+/g) || [part];
					for (const tk of tokens) frag.appendChild(wrapWord(tk, hl));
				}
			}
			node.parentNode.replaceChild(frag, node);
		} else if (node.nodeType === Node.ELEMENT_NODE) {
			if (node.tagName === 'BR') return;
			const h = hl || node.classList.contains('hl');
			// 递归前先快照子节点（会被替换）
			const kids = Array.from(node.childNodes);
			for (const k of kids) walk(k, h);
		}
	};

	const kids = Array.from(el.childNodes);
	for (const k of kids) walk(k, false);
	return chars;
}

/**
 * 逐字绘制。p∈[0,1] 总进度，spread 为每字相位差，
 * final/accent/ghost 为三阶段颜色（.hl 字符 final 用 accent 色）。
 */
export function paint(chars, p, spread, final, accent, ghost) {
	const n = chars.length;
	if (!n) return;
	const f = parseRGB(final);
	const a = parseRGB(accent);
	const g = parseRGB(ghost);
	for (const c of chars) {
		const t = clamp((p * (1 + spread) - c.i / n) / spread, 0, 1);
		const el = c.el;
		let opacity, color, blur;
		if (t <= 0) {
			opacity = 0;
			color = mixRGB(g, g, 0);
			blur = 8;
		} else if (t < 0.35) {
			const u = t / 0.35;
			opacity = u;
			color = mixRGB(g, g, 0);
			blur = lerp(8, 1.5, u);
		} else if (t < 0.7) {
			const u = (t - 0.35) / 0.35;
			opacity = 1;
			color = mixRGB(g, a, u);
			blur = lerp(1.5, 0, u);
		} else {
			const u = (t - 0.7) / 0.3;
			opacity = 1;
			// .hl 字符停在 accent 色
			color = mixRGB(a, c.hl ? a : f, u);
			blur = 0;
		}
		el.style.opacity = opacity.toFixed(3);
		el.style.color = color;
		el.style.filter = blur > 0.01 ? `blur(${blur.toFixed(2)}px)` : '';
	}
}
