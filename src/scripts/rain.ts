/**
 * 首页雨滴层运行时（Canvas 2D，无依赖）。
 *
 * 两层景深：远景是细密斜雨，近景是贴在「玻璃」上的水珠——水珠会缓慢下滑、
 * 左右微摆，并在身后拖出一条水痕。只画一块 fixed 画布，滚出首屏后整层淡出并停帧。
 * View Transitions 用 mount/unmount 成对重建，所有监听器走同一个 AbortController。
 */

/** 画布分辨率上限：雨是低频细节，1.75 倍足够，再高只是白烧 GPU */
const DPR_CAP = 1.5;
/** 帧率上限：雨不需要 60fps，压在 45 能明显降低长时间停留的功耗 */
const MAX_FPS = 40;
const STREAK_H = 96;
const BEAD_SIZE = 64;
const TRAIL_H = 64;
const WIND = 0.17;
/** 雨丝跟着风速倾斜：倾斜的是线本身，不只是它的路径，否则看起来像刻痕 */
const SLANT = -Math.atan(WIND);
const FADE_AT = 0.9;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const rand = (min: number, max: number) => min + Math.random() * (max - min);

interface Streak {
	x: number;
	y: number;
	len: number;
	speed: number;
	alpha: number;
	width: number;
}

interface Bead {
	x: number;
	y: number;
	r: number;
	speed: number;
	drift: number;
	phase: number;
	alpha: number;
	trail: number;
	wait: number;
}

interface Palette {
	streak: string;
	highlight: string;
	body: string;
	rim: string;
	tint: number;
}

const PALETTES: Record<'dark' | 'light', Palette> = {
	dark: {
		streak: '190, 222, 255',
		highlight: '238, 248, 255',
		body: '126, 176, 220',
		rim: '8, 18, 32',
		tint: 1,
	},
	light: {
		streak: '92, 122, 156',
		highlight: '255, 255, 255',
		body: '150, 176, 202',
		rim: '122, 142, 166',
		tint: 0.55,
	},
};

const makeCanvas = (width: number, height: number) => {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	return canvas;
};

/** 雨丝贴图：顶端透明、末端接近实色，缩放后就是一条带收尾的雨线 */
function streakSprite(rgb: string) {
	const canvas = makeCanvas(4, STREAK_H);
	const ctx = canvas.getContext('2d');
	if (!ctx) return canvas;
	const gradient = ctx.createLinearGradient(0, 0, 0, STREAK_H);
	gradient.addColorStop(0, `rgba(${rgb}, 0)`);
	gradient.addColorStop(0.55, `rgba(${rgb}, 0.28)`);
	gradient.addColorStop(0.9, `rgba(${rgb}, 0.85)`);
	gradient.addColorStop(1, `rgba(${rgb}, 0)`);
	ctx.fillStyle = gradient;
	ctx.fillRect(1.1, 0, 1.8, STREAK_H);
	return canvas;
}

/** 水珠贴图：左上高光 + 中间透明水体 + 右下暗边，缩放到半径后像一颗透镜 */
function beadSprite(palette: Palette) {
	const canvas = makeCanvas(BEAD_SIZE, BEAD_SIZE);
	const ctx = canvas.getContext('2d');
	if (!ctx) return canvas;
	const c = BEAD_SIZE / 2;
	const body = ctx.createRadialGradient(c - 9, c - 11, 1, c, c, c - 1);
	body.addColorStop(0, `rgba(${palette.highlight}, 0.72)`);
	body.addColorStop(0.2, `rgba(${palette.body}, 0.32)`);
	body.addColorStop(0.58, `rgba(${palette.body}, 0.12)`);
	body.addColorStop(0.82, `rgba(${palette.rim}, 0.5)`);
	body.addColorStop(1, `rgba(${palette.rim}, 0)`);
	ctx.fillStyle = body;
	ctx.beginPath();
	ctx.arc(c, c, c - 1, 0, Math.PI * 2);
	ctx.fill();

	// 月牙形高光，让水珠有体积而不是一块圆斑
	ctx.strokeStyle = `rgba(${palette.highlight}, 0.6)`;
	ctx.lineWidth = 2.4;
	ctx.beginPath();
	ctx.arc(c, c, c * 0.62, Math.PI * 1.05, Math.PI * 1.62);
	ctx.stroke();
	return canvas;
}

/** 水痕贴图：从透明到淡色，贴在滑落的水珠上方 */
function trailSprite(palette: Palette) {
	const canvas = makeCanvas(8, TRAIL_H);
	const ctx = canvas.getContext('2d');
	if (!ctx) return canvas;
	const gradient = ctx.createLinearGradient(0, 0, 0, TRAIL_H);
	gradient.addColorStop(0, `rgba(${palette.highlight}, 0)`);
	gradient.addColorStop(0.65, `rgba(${palette.highlight}, 0.18)`);
	gradient.addColorStop(1, `rgba(${palette.body}, 0.44)`);
	ctx.fillStyle = gradient;
	ctx.beginPath();
	ctx.moveTo(4, 0);
	ctx.lineTo(5.4, TRAIL_H);
	ctx.lineTo(2.6, TRAIL_H);
	ctx.closePath();
	ctx.fill();
	return canvas;
}

function setup(host: HTMLElement) {
	const canvas = host.querySelector<HTMLCanvasElement>('[data-rain-canvas]');
	const ctx = canvas?.getContext('2d', { alpha: true });
	if (!canvas || !ctx) return () => {};

	const ac = new AbortController();
	const signal = ac.signal;
	const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
	let reduce = reduceQuery.matches;
	let light = document.documentElement.dataset.theme === 'light';
	let palette = PALETTES[light ? 'light' : 'dark'];
	let sprites = {
		streak: streakSprite(palette.streak),
		bead: beadSprite(palette),
		trail: trailSprite(palette),
	};

	let width = 0;
	let height = 0;
	let dpr = 1;
	let streaks: Streak[] = [];
	let beads: Bead[] = [];
	let raf = 0;
	let timer = 0;
	let lastDraw = 0;
	let alive = true;
	let active = true;
	let time = 0;

	const hero = document.querySelector<HTMLElement>('.hero');
	let heroHeight = 0;

	const rebuild = () => {
		palette = PALETTES[light ? 'light' : 'dark'];
		sprites = {
			streak: streakSprite(palette.streak),
			bead: beadSprite(palette),
			trail: trailSprite(palette),
		};
	};

	const spawnStreak = (fromTop: boolean): Streak => {
		const speed = rand(760, 1680) * (height / 900);
		return {
			x: rand(-width * 0.12, width * 1.06),
			y: fromTop ? rand(-height * 0.6, -20) : rand(0, height),
			len: clamp(speed * rand(0.055, 0.1), 22, height * 0.22),
			speed,
			alpha: rand(0.14, 0.46),
			width: rand(1.5, 2.9),
		};
	};

	const spawnBead = (fromTop: boolean): Bead => {
		// 分三档：静止的小凝珠、缓滑的中珠、偶尔一颗带痕迹的大水珠
		const tier = Math.random();
		const still = tier < 0.32;
		const r = still ? rand(1.2, 3) : tier < 0.82 ? rand(2.4, 4.8) : rand(5.2, 9.6);
		return {
			x: rand(6, width - 6),
			y: fromTop ? rand(-height * 0.35, -12) : rand(0, height),
			r,
			speed: still ? 0 : rand(10, 68) * (1.15 - r / 13),
			drift: rand(1.6, 5.5),
			phase: rand(0, Math.PI * 2),
			alpha: still ? rand(0.4, 0.7) : rand(0.6, 1),
			trail: 0,
			wait: still ? 0 : rand(0, 2.4),
		};
	};

	const seed = () => {
		const streakCount = clamp(Math.round((width * height) / 19000), 36, 180);
		const beadCount = clamp(Math.round((width * height) / 32000), 12, 60);
		streaks = Array.from({ length: streakCount }, () => spawnStreak(false));
		beads = Array.from({ length: beadCount }, () => spawnBead(false));
	};

	const resize = () => {
		const rect = host.getBoundingClientRect();
		width = Math.max(1, rect.width);
		height = Math.max(1, rect.height);
		dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
		canvas.width = Math.round(width * dpr);
		canvas.height = Math.round(height * dpr);
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		seed();
		heroHeight = hero ? hero.getBoundingClientRect().height : height;
		draw(0);
		wake();
	};

	const step = (dt: number) => {
		time += dt;
		for (const streak of streaks) {
			streak.y += streak.speed * dt;
			streak.x += streak.speed * WIND * dt;
			if (streak.y - streak.len > height || streak.x > width * 1.2) Object.assign(streak, spawnStreak(true));
		}
		for (const bead of beads) {
			if (bead.speed === 0) continue;
			if (bead.wait > 0) {
				bead.wait -= dt;
				bead.trail += (0 - bead.trail) * Math.min(1, dt * 3);
				continue;
			}
			bead.y += bead.speed * dt;
			bead.x += Math.sin(time * 0.9 + bead.phase) * bead.drift * dt;
			const target = clamp(bead.speed * 2.6, 0, 120);
			bead.trail += (target - bead.trail) * Math.min(1, dt * 4);
			if (bead.y - bead.r > height) Object.assign(bead, spawnBead(true));
			// 偶尔卡住再滑，水珠才有「玻璃上走走停停」的感觉
			else if (Math.random() < dt * 0.22) bead.wait = rand(0.6, 2.8);
		}
	};

	const draw = (dt: number) => {
		ctx.clearRect(0, 0, width, height);
		ctx.globalAlpha = palette.tint;

		if (!reduce) {
			// 整层只旋转一次坐标系，而不是每条雨丝各保存/旋转/还原一次：
			// 90 条线意味着每帧 90 次变换，这个开销比画线本身还高。
			ctx.save();
			ctx.translate(width / 2, height / 2);
			ctx.rotate(SLANT);
			ctx.translate(-width / 2, -height / 2);
			for (const streak of streaks) {
				ctx.globalAlpha = streak.alpha * palette.tint;
				ctx.drawImage(sprites.streak, streak.x - streak.width / 2, streak.y - streak.len, streak.width, streak.len);
			}
			ctx.restore();
		}

		for (const bead of beads) {
			const stretch = bead.speed > 0 ? 1.18 : 1;
			if (bead.trail > 2) {
				const w = Math.max(3, bead.r * 1.5);
				ctx.globalAlpha = bead.alpha * 0.55 * palette.tint;
				ctx.drawImage(sprites.trail, bead.x - w / 2, bead.y - bead.trail, w, bead.trail);
			}
			ctx.globalAlpha = bead.alpha * palette.tint;
			ctx.drawImage(
				sprites.bead,
				bead.x - bead.r,
				bead.y - bead.r * stretch,
				bead.r * 2,
				bead.r * 2 * stretch,
			);
		}
		ctx.globalAlpha = 1;
		void dt;
	};

	const frame = (now: number) => {
		raf = 0;
		if (!alive || document.hidden || !active) return;
		const wait = 1000 / MAX_FPS - (now - lastDraw);
		// 没到下一帧就先睡一会儿再唤醒，而不是每帧都空转一次 rAF：
		// 60/120Hz 屏幕上「每帧空转」会让合成器一直保持高温，白白耗电。
		if (!reduce && wait > 1.5) {
			timer = window.setTimeout(() => {
				timer = 0;
				wake();
			}, wait);
			return;
		}
		const dt = lastDraw ? clamp((now - lastDraw) / 1000, 0.002, 0.05) : 1 / 60;
		lastDraw = now;
		if (!reduce) step(dt);
		draw(dt);
		if (reduce) return;
		timer = window.setTimeout(() => {
			timer = 0;
			wake();
		}, 1000 / MAX_FPS);
	};

	function wake() {
		if (raf || timer || !alive || !active || document.hidden || reduce) return;
		raf = requestAnimationFrame(frame);
	}

	const updateFade = () => {
		const reach = Math.max(1, heroHeight * FADE_AT);
		const progress = clamp(1 - window.scrollY / reach, 0, 1);
		// reduced motion 不滚出淡出：只留一张很淡的静态水珠
		host.style.opacity = (progress * (reduce ? 0.55 : 1)).toFixed(3);
		const next = progress > 0.02;
		if (next === active) return;
		active = next;
		if (active) wake();
		else {
			cancelAnimationFrame(raf);
			raf = 0;
			clearTimeout(timer);
			timer = 0;
		}
	};

	let scrollRaf = 0;
	const onScroll = () => {
		if (scrollRaf) return;
		scrollRaf = requestAnimationFrame(() => {
			scrollRaf = 0;
			updateFade();
		});
	};

	const onResize = () => {
		resize();
		updateFade();
	};

	const onVisibility = () => {
		lastDraw = 0;
		wake();
	};

	const onTheme = () => {
		const next = document.documentElement.dataset.theme === 'light';
		if (next === light) return;
		light = next;
		rebuild();
		draw(0);
	};

	const onReduce = () => {
		reduce = reduceQuery.matches;
		lastDraw = 0;
		if (reduce) {
			cancelAnimationFrame(raf);
			raf = 0;
			clearTimeout(timer);
			timer = 0;
			draw(0);
		} else wake();
	};

	resize();
	updateFade();

	window.addEventListener('resize', onResize, { passive: true, signal });
	window.addEventListener('scroll', onScroll, { passive: true, signal });
	document.addEventListener('visibilitychange', onVisibility, { signal });
	reduceQuery.addEventListener?.('change', onReduce);
	const themeObserver = new MutationObserver(onTheme);
	themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

	return () => {
		alive = false;
		ac.abort();
		cancelAnimationFrame(raf);
		cancelAnimationFrame(scrollRaf);
		clearTimeout(timer);
		clearTimeout(timer);
		themeObserver.disconnect();
		reduceQuery.removeEventListener?.('change', onReduce);
		host.style.opacity = '';
	};
}

const instances = new Map<HTMLElement, () => void>();

function mount() {
	document.querySelectorAll<HTMLElement>('[data-rain]').forEach((host) => {
		if (host.dataset.rainBound === '1') return;
		host.dataset.rainBound = '1';
		instances.set(host, setup(host));
	});
}

function unmount() {
	instances.forEach((destroy) => destroy());
	instances.clear();
	document.querySelectorAll<HTMLElement>('[data-rain]').forEach((host) => {
		delete host.dataset.rainBound;
	});
}

let bound = false;

export function initRain() {
	if (bound) return;
	bound = true;
	document.addEventListener('astro:before-swap', unmount);
	document.addEventListener('astro:page-load', mount);
	if (document.readyState !== 'loading') mount();
	else document.addEventListener('DOMContentLoaded', mount, { once: true });
}
