/**
 * CircularCarousel 运行时（无 React / 无依赖）。
 *
 * 组件只输出静态 DOM 与 data-cfg(JSON)：圆柱切片几何在构建期算好，
 * 这里只维护一个 rAF 循环，按帧写 camera / ring / card 的 transform 与景深变量。
 * 同一页可有多个实例；View Transitions 用 mount/unmount 成对重建，
 * 所有监听器走同一个 AbortController，不会累积。
 */

interface Slide {
	title: string;
	subtitle: string;
	href: string;
}

interface Cfg {
	count: number;
	step: number;
	radius: number;
	cardW: number;
	cardH: number;
	axis: 'x' | 'y';
	tilt: number;
	perspective: number;
	window: number;
	inward: boolean;
	billboard: boolean;
	intro: 'assemble' | 'rise' | 'spin' | 'none';
	introLength: number;
	autoplay: 'drift' | 'step' | 'off';
	speed: number;
	interval: number;
	directionSign: number;
	draggable: boolean;
	momentum: number;
	snap: boolean;
	pauseOnHover: boolean;
	focusOnClick: boolean;
	parallax: number;
	stretch: number;
	depthFade: number;
	captions: boolean;
	digitCount: number;
	items: Slide[];
}

type IntroType = Cfg['intro'];

interface Settings extends Cfg {
	reduced: boolean;
}

interface Sample {
	time: number;
	angle: number;
}

interface Press {
	id: number;
	x: number;
	y: number;
	angle: number;
	moved: boolean;
	origin: number;
	samples: Sample[];
}

interface State {
	angle: number;
	velocity: number;
	target: number | null;
	dir: number;
	press: Press | null;
	drag: boolean;
	hover: boolean;
	pointer: { inside: boolean; x: number; y: number };
	yaw: number;
	pitch: number;
	intro: { type: IntroType; start: number } | null;
	introDone: boolean;
	holdUntil: number;
	stepAt: number;
	suppressClick: boolean;
	wheelTimer: number;
	fit: number;
	shift: number;
	drop: number;
	last: number;
}

const INTRO_LENGTH: Record<IntroType, number> = { assemble: 1500, rise: 1400, spin: 1800, none: 0 };
const CAPTION_SPACE = 76;
const DRAG_THRESHOLD = 5;
const SPRING = 118;
const SETTLE_SPEED = 9;
const TO_RAD = Math.PI / 180;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const wrap = (degrees: number) => ((((degrees + 180) % 360) + 360) % 360) - 180;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);
const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5);

type Point = [number, number, number];

const rotateX = (p: Point, degrees: number): Point => {
	const r = degrees * TO_RAD;
	const c = Math.cos(r);
	const s = Math.sin(r);
	return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c];
};

const rotateY = (p: Point, degrees: number): Point => {
	const r = degrees * TO_RAD;
	const c = Math.cos(r);
	const s = Math.sin(r);
	return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
};

const instances = new Map<HTMLElement, () => void>();
let bound = false;

function setup(root: HTMLElement): () => void {
	let cfg: Cfg;
	try {
		cfg = JSON.parse(root.dataset.cfg || '{}') as Cfg;
	} catch {
		return () => {};
	}
	if (!cfg.count || !cfg.items?.length) return () => {};

	const stage = root.querySelector<HTMLElement>('[data-cc-stage]');
	const camera = root.querySelector<HTMLElement>('[data-cc-camera]');
	const ring = root.querySelector<HTMLElement>('[data-cc-ring]');
	const cards = Array.from(root.querySelectorAll<HTMLElement>('[data-cc-card]'));
	const titleEl = root.querySelector<HTMLElement>('[data-cc-title]');
	const reels = Array.from(root.querySelectorAll<HTMLElement>('[data-cc-reel]'));
	const liveEl = root.querySelector<HTMLElement>('[data-cc-live]');
	if (!stage || !camera || !ring || cards.length !== cfg.count) return () => {};

	const ac = new AbortController();
	const signal = ac.signal;
	const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
	const s: Settings = { ...cfg, reduced: false };
	let alive = true;
	let raf = 0;
	let visible = true;
	let readyTimer = 0;
	let activeIndex = 0;

	const state: State = {
		angle: 0,
		velocity: 0,
		target: null,
		dir: cfg.directionSign,
		press: null,
		drag: false,
		hover: false,
		pointer: { inside: false, x: 0, y: 0 },
		yaw: 0,
		pitch: 0,
		intro: null,
		introDone: false,
		holdUntil: 0,
		stepAt: 0,
		suppressClick: false,
		wheelTimer: 0,
		fit: 1,
		shift: 0,
		drop: 0,
		last: 0,
	};

	const isReady = () => root.hasAttribute('data-cc-ready');
	const nearest = (angle: number) => Math.round(angle / s.step) * s.step;

	const applyReduced = () => {
		const reduced = motionQuery.matches;
		s.reduced = reduced;
		s.intro = reduced ? 'none' : cfg.intro;
		s.autoplay = reduced ? 'off' : cfg.autoplay;
		s.parallax = reduced ? 0 : cfg.parallax;
		s.stretch = reduced ? 0 : cfg.stretch;
		wake();
	};

	/* 把整圈投影出的包围盒缩到容器里；窄屏放宽水平余量，让环两侧自然溢出裁切，
	   避免 7 张照片被压成一排缩略图。 */
	const measure = () => {
		const rect = root.getBoundingClientRect();
		if (!rect.width || !rect.height) return;
		const captionRoom = s.captions ? CAPTION_SPACE : 0;
		const width = rect.width < 700 ? rect.width * 1.9 : rect.width * 0.94;
		const height = (rect.height - captionRoom) * 0.92;
		const P = s.perspective;
		let minX = Infinity;
		let maxX = -Infinity;
		let minY = Infinity;
		let maxY = -Infinity;
		if (s.inward) {
			minX = -width / 2;
			maxX = width / 2;
			minY = -s.cardH / 2;
			maxY = s.cardH / 2;
		} else {
			const corners: [number, number][] = [
				[-s.cardW / 2, -s.cardH / 2],
				[s.cardW / 2, -s.cardH / 2],
				[-s.cardW / 2, s.cardH / 2],
				[s.cardW / 2, s.cardH / 2],
			];
			const limit = s.window ? s.window * s.step : 180;
			for (let a = -limit; a <= limit; a += limit / 24) {
				for (const [cx, cy] of corners) {
					let p: Point;
					if (s.axis === 'x') {
						p = rotateY(rotateX([cx, cy, s.radius], -a), s.tilt);
					} else if (s.billboard) {
						const c = rotateY([0, 0, s.radius], a);
						p = rotateX([c[0] + cx, cy, c[2]], s.tilt);
					} else {
						p = rotateX(rotateY([cx, cy, s.radius], a), s.tilt);
					}
					p = [p[0], p[1], p[2] - s.radius];
					if (p[2] >= P * 0.95) continue;
					const k = P / (P - p[2]);
					minX = Math.min(minX, p[0] * k);
					maxX = Math.max(maxX, p[0] * k);
					minY = Math.min(minY, p[1] * k);
					maxY = Math.max(maxY, p[1] * k);
				}
			}
		}
		const spanX = Math.max(maxX - minX, 1);
		const spanY = Math.max(maxY - minY, 1);
		const fit = Math.min(1, width / spanX, height / spanY);
		state.fit = fit;
		state.shift = -((minY + maxY) / 2) * fit - captionRoom / 2;
		state.drop =
			s.axis === 'x'
				? (rect.width / fit) * 0.55 + s.cardW
				: (rect.height / fit) * 0.55 + s.cardH;
		stage.style.perspective = `${P}px`;
		stage.style.transform = `translate3d(0, ${state.shift}px, 0) scale(${fit})`;
	};

	const introCard = (elapsed: number, landing: number) => {
		if (!state.intro) return { radius: 1, lift: 0 };
		const type = state.intro.type;
		const reach = Math.abs(wrap(landing + state.angle));
		if (type === 'assemble') {
			const delay = (reach / 180) * 420;
			const p = easeOut(clamp((elapsed - delay) / 1080, 0, 1));
			return { radius: 1 + 0.6 * (1 - p), lift: 0 };
		}
		if (type === 'rise') {
			const delay = (reach / 180) * 480;
			const p = easeOutQuint(clamp((elapsed - delay) / 900, 0, 1));
			return { radius: 1, lift: (1 - p) * state.drop };
		}
		if (type === 'spin') {
			const p = easeOut(clamp(elapsed / INTRO_LENGTH.spin, 0, 1));
			return { radius: 1 + 0.28 * (1 - p), lift: 0 };
		}
		return { radius: 1, lift: 0 };
	};

	const advance = (dt: number, now: number) => {
		if (!state.introDone && isReady()) {
			if (!state.intro) {
				if (s.intro === 'none') state.introDone = true;
				else state.intro = { type: s.intro, start: now };
			}
			if (state.intro && now - state.intro.start >= INTRO_LENGTH[state.intro.type]) {
				state.intro = null;
				state.introDone = true;
			}
		}

		const paused = (s.pauseOnHover && state.hover) || state.drag || now < state.holdUntil;
		const cruise = s.autoplay === 'drift' && !paused && !state.intro ? s.speed * state.dir : 0;
		let busy = Boolean(state.intro) || state.drag;

		if (state.drag || state.intro) {
			state.velocity = state.drag ? state.velocity : 0;
		} else if (state.target !== null) {
			let remaining = dt;
			const damping = 2 * Math.sqrt(SPRING);
			while (remaining > 0) {
				const h = Math.min(remaining, 1 / 240);
				const accel = SPRING * (state.target - state.angle) - damping * state.velocity;
				state.velocity += accel * h;
				state.angle += state.velocity * h;
				remaining -= h;
			}
			if (Math.abs(state.target - state.angle) < 0.004 && Math.abs(state.velocity) < 0.03) {
				state.angle = state.target;
				state.velocity = 0;
				state.target = null;
			}
			busy = true;
		} else {
			const tau = 0.18 + s.momentum * 1.5;
			state.velocity += (cruise - state.velocity) * (1 - Math.exp(-dt / tau));
			state.angle += state.velocity * dt;
			if (cruise === 0 && s.snap && Math.abs(state.velocity) < SETTLE_SPEED) {
				state.target = nearest(state.angle);
			}
			busy = busy || cruise !== 0 || Math.abs(state.velocity) > 0.01 || state.target !== null;
		}

		if (s.autoplay === 'step' && !paused && !state.intro && state.introDone) {
			if (!state.stepAt) state.stepAt = now + s.interval * 1000;
			if (now >= state.stepAt) {
				state.target = (state.target ?? nearest(state.angle)) + s.step * state.dir;
				state.stepAt = now + s.interval * 1000;
			}
			busy = true;
		} else {
			state.stepAt = 0;
		}

		if (now < state.holdUntil) busy = true;

		const ease = 1 - Math.exp(-dt / 0.35);
		const aimYaw = state.pointer.inside ? state.pointer.x * s.parallax * 9 : 0;
		const aimPitch = state.pointer.inside ? -state.pointer.y * s.parallax * 6 : 0;
		state.yaw += (aimYaw - state.yaw) * ease;
		state.pitch += (aimPitch - state.pitch) * ease;
		if (Math.abs(aimYaw - state.yaw) > 0.01 || Math.abs(aimPitch - state.pitch) > 0.01) busy = true;

		return busy;
	};

	const setActive = (index: number) => {
		if (index === activeIndex) return;
		activeIndex = index;
		const item = s.items[index] ?? s.items[0];
		if (s.captions) {
			if (titleEl) {
				titleEl.textContent = item.title;
				if (item.subtitle) {
					const sub = document.createElement('span');
					sub.className = 'cc__subtitle';
					sub.textContent = item.subtitle;
					titleEl.appendChild(sub);
				}
				if (!s.reduced && typeof titleEl.animate === 'function') {
					titleEl.getAnimations().forEach((a) => a.cancel());
					titleEl.animate(
						[
							{ opacity: 0, transform: 'translateY(8px)' },
							{ opacity: 1, transform: 'none' },
						],
						{ duration: 520, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
					);
				}
			}
			const digits = String(index + 1).padStart(s.digitCount, '0');
			reels.forEach((reel, i) => {
				reel.style.transform = `translateY(${-Number(digits[i] ?? '0') * 10}%)`;
			});
		}
		if (liveEl) liveEl.textContent = `${item.title}，第 ${index + 1} 张，共 ${s.count} 张`;
		root.dispatchEvent(new CustomEvent('cc:change', { detail: { index, item } }));
	};

	const render = (now: number) => {
		const elapsed = state.intro ? now - state.intro.start : 0;
		const swell = 1 + s.stretch * 0.12 * Math.min(1, Math.abs(state.velocity) / 420);
		let spinOffset = 0;
		if (state.intro?.type === 'spin') {
			const p = easeOut(clamp(elapsed / INTRO_LENGTH.spin, 0, 1));
			spinOffset = -300 * state.dir * (1 - p);
		} else if (state.intro?.type === 'assemble') {
			const p = easeOut(clamp(elapsed / INTRO_LENGTH.assemble, 0, 1));
			spinOffset = -32 * state.dir * (1 - p);
		}
		const angle = state.angle + spinOffset;
		const R = s.radius * swell;

		if (s.axis === 'x') {
			camera.style.transform = `translate3d(0, 0, ${-R}px) rotateY(${s.tilt + state.yaw}deg) rotateX(${state.pitch}deg)`;
			ring.style.transform = `rotateX(${-angle}deg)`;
		} else if (s.inward) {
			camera.style.transform = `translate3d(0, 0, ${s.perspective - 1}px) rotateX(${s.tilt + state.pitch}deg) rotateY(${state.yaw}deg)`;
			ring.style.transform = `rotateY(${angle}deg)`;
		} else {
			camera.style.transform = `translate3d(0, 0, ${-R}px) rotateX(${s.tilt + state.pitch}deg) rotateY(${state.yaw}deg)`;
			ring.style.transform = `rotateY(${angle}deg)`;
		}

		for (let index = 0; index < s.count; index++) {
			const card = cards[index];
			const base = index * s.step;
			const mod = introCard(elapsed, base);
			const r = R * mod.radius;
			let transform: string;
			if (s.axis === 'x') {
				transform = `rotateX(${-base}deg) translateZ(${r}px)`;
			} else if (s.inward) {
				transform = `rotateY(${base}deg) translateZ(${-r}px)`;
			} else {
				transform = `rotateY(${base}deg) translateZ(${r}px)`;
				if (s.billboard) transform += ` rotateY(${-(base + angle)}deg)`;
			}
			if (mod.lift) transform += s.axis === 'x' ? ` translateX(${mod.lift}px)` : ` translateY(${mod.lift}px)`;
			card.style.transform = transform;

			const world = wrap(base + angle);
			const facing = Math.cos(world * TO_RAD);
			if (s.inward) card.style.visibility = Math.abs(world) > 86 ? 'hidden' : '';
			const fade = s.depthFade * Math.pow((1 - facing) / 2, 1.25);
			card.style.setProperty('--cc-depth', fade.toFixed(3));
		}

		const index = ((Math.round(-state.angle / s.step) % s.count) + s.count) % s.count || 0;
		setActive(index);
	};

	const frame = (now: number) => {
		raf = 0;
		const dt = state.last ? Math.min((now - state.last) / 1000, 0.05) : 1 / 60;
		state.last = now;
		const busy = advance(dt, now);
		render(now);
		if (busy && visible && !document.hidden) raf = requestAnimationFrame(frame);
		else state.last = 0;
	};

	const wake = () => {
		if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame);
	};

	// wake/frame 定义完成后再读一次系统动效偏好（首次调用要能安全唤醒循环）。
	applyReduced();

	const onVisibility = () => {
		if (document.hidden) {
			cancelAnimationFrame(raf);
			raf = 0;
			state.last = 0;
		} else wake();
	};

	const focusIndex = (index: number) => {
		let target = -index * s.step;
		target += 360 * Math.round((state.angle - target) / 360);
		state.target = target;
		state.holdUntil = performance.now() + 2800;
		wake();
	};

	const stepBy = (delta: number) => {
		const base = state.target ?? Math.round(state.angle / s.step) * s.step;
		state.target = base - delta * s.step * (s.inward ? -1 : 1);
		state.holdUntil = performance.now() + 2800;
		wake();
	};

	const updatePointer = (event: PointerEvent) => {
		const rect = root.getBoundingClientRect();
		state.pointer.x = clamp(((event.clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
		state.pointer.y = clamp(((event.clientY - rect.top) / rect.height) * 2 - 1, -1, 1);
	};

	const onWheel = (event: WheelEvent) => {
		if (!s.draggable) return;
		const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : 0;
		if (!delta) return;
		event.preventDefault();
		const perPixel = 180 / (Math.PI * s.radius * state.fit);
		const sign = s.inward ? -1 : 1;
		state.target = null;
		state.angle -= delta * perPixel * sign;
		state.velocity = -delta * perPixel * sign * 30;
		state.holdUntil = performance.now() + 1600;
		clearTimeout(state.wheelTimer);
		state.wheelTimer = window.setTimeout(() => {
			if (s.snap) state.target = nearest(state.angle + state.velocity * 0.12);
			wake();
		}, 140);
		wake();
	};

	const onPointerDown = (event: PointerEvent) => {
		state.suppressClick = false;
		if (!s.draggable || event.button !== 0) return;
		state.press = {
			id: event.pointerId,
			x: event.clientX,
			y: event.clientY,
			angle: state.angle,
			moved: false,
			origin: 0,
			samples: [{ time: performance.now(), angle: state.angle }],
		};
	};

	const onPointerMove = (event: PointerEvent) => {
		if (event.pointerType === 'mouse') {
			state.pointer.inside = true;
			updatePointer(event);
		}
		const press = state.press;
		if (!press || press.id !== event.pointerId) {
			wake();
			return;
		}
		const delta = s.axis === 'x' ? event.clientY - press.y : event.clientX - press.x;
		const cross = s.axis === 'x' ? event.clientX - press.x : event.clientY - press.y;
		if (!press.moved) {
			if (Math.abs(delta) < DRAG_THRESHOLD) return;
			if (Math.abs(cross) > Math.abs(delta) * 1.2 && event.pointerType !== 'mouse') {
				state.press = null;
				return;
			}
			press.moved = true;
			press.origin = delta;
			state.drag = true;
			state.target = null;
			state.velocity = 0;
			root.setAttribute('data-cc-dragging', '');
			try {
				root.setPointerCapture(event.pointerId);
			} catch {
				/* 指针已释放时忽略 */
			}
		}
		const perPixel = 180 / (Math.PI * s.radius * state.fit);
		state.angle = press.angle + (delta - press.origin) * perPixel * (s.inward ? -1 : 1);
		const now = performance.now();
		press.samples.push({ time: now, angle: state.angle });
		while (press.samples.length > 2 && now - press.samples[0].time > 110) press.samples.shift();
		wake();
	};

	const releasePointer = (event: PointerEvent) => {
		const press = state.press;
		if (!press || press.id !== event.pointerId) return;
		state.press = null;
		if (!press.moved) return;
		state.drag = false;
		root.removeAttribute('data-cc-dragging');
		state.suppressClick = true;
		const first = press.samples[0];
		const last = press.samples[press.samples.length - 1];
		const span = (last.time - first.time) / 1000;
		const velocity = span > 0.008 ? clamp((last.angle - first.angle) / span, -1400, 1400) : 0;
		state.velocity = velocity;
		if (Math.abs(velocity) > 60) state.dir = Math.sign(velocity);
		const coasting = s.autoplay === 'drift' && !(s.pauseOnHover && state.hover && event.pointerType === 'mouse');
		if (s.snap && !coasting) {
			const tau = 0.18 + s.momentum * 1.5;
			state.target = Math.round((state.angle + velocity * tau * 0.55) / s.step) * s.step;
		}
		wake();
	};

	const onPointerEnter = (event: PointerEvent) => {
		if (event.pointerType !== 'mouse') return;
		state.hover = true;
		wake();
	};

	const onPointerLeave = (event: PointerEvent) => {
		if (event.pointerType === 'mouse') {
			state.hover = false;
			state.pointer.inside = false;
		}
		wake();
	};

	const onClick = (event: MouseEvent) => {
		if (state.suppressClick) {
			state.suppressClick = false;
			return;
		}
		const card = (event.target as Element | null)?.closest?.('[data-cc-index]');
		if (!card) return;
		const index = Number(card.getAttribute('data-cc-index'));
		if (!Number.isFinite(index)) return;
		if (s.focusOnClick) focusIndex(index);
		root.dispatchEvent(new CustomEvent('cc:item-click', { detail: { index, item: s.items[index] } }));
	};

	const onKeyDown = (event: KeyboardEvent) => {
		const forward = s.axis === 'x' ? 'ArrowDown' : 'ArrowRight';
		const backward = s.axis === 'x' ? 'ArrowUp' : 'ArrowLeft';
		if (event.key === forward) stepBy(1);
		else if (event.key === backward) stepBy(-1);
		else if (event.key === 'Home') focusIndex(0);
		else if (event.key === 'End') focusIndex(s.count - 1);
		else if (event.key === 'Enter' || event.key === ' ') {
			root.dispatchEvent(new CustomEvent('cc:item-click', { detail: { index: activeIndex, item: s.items[activeIndex] } }));
		} else return;
		event.preventDefault();
	};

	root.addEventListener('wheel', onWheel, { passive: false, signal });
	root.addEventListener('pointerdown', onPointerDown, { signal });
	root.addEventListener('pointermove', onPointerMove, { signal });
	root.addEventListener('pointerup', releasePointer, { signal });
	root.addEventListener('pointercancel', releasePointer, { signal });
	root.addEventListener('pointerenter', onPointerEnter, { signal });
	root.addEventListener('pointerleave', onPointerLeave, { signal });
	root.addEventListener('click', onClick, { signal });
	root.addEventListener('keydown', onKeyDown, { signal });
	document.addEventListener('visibilitychange', onVisibility, { signal });
	motionQuery.addEventListener('change', applyReduced, { signal });

	const resize = new ResizeObserver(() => {
		measure();
		wake();
	});
	resize.observe(root);

	const io = new IntersectionObserver(
		([entry]) => {
			visible = entry.isIntersecting;
			if (visible) wake();
			else {
				cancelAnimationFrame(raf);
				raf = 0;
				state.last = 0;
			}
		},
		{ rootMargin: '80px' },
	);
	io.observe(root);

	// 首帧先摆好位置，等图片解码完（最多 2.4s）再淡入，避免半圈空白图闪一下。
	measure();
	render(performance.now());

	const sources = Array.from(new Set(Array.from(root.querySelectorAll<HTMLImageElement>('.cc__photo')).map((img) => img.src))).slice(0, 16);
	const load = (src: string) =>
		new Promise<void>((resolve) => {
			const image = new Image();
			image.decoding = 'async';
			image.onload = () => (image.decode ? image.decode().then(resolve, resolve) : resolve());
			image.onerror = () => resolve();
			image.src = src;
		});
	Promise.race([
		Promise.all(sources.map(load)),
		new Promise<void>((resolve) => {
			readyTimer = window.setTimeout(resolve, 2400);
		}),
	]).then(() => {
		if (!alive) return;
		clearTimeout(readyTimer);
		root.setAttribute('data-cc-ready', '');
		state.introDone = false;
		state.intro = null;
		wake();
	});

	return () => {
		alive = false;
		ac.abort();
		cancelAnimationFrame(raf);
		resize.disconnect();
		io.disconnect();
		clearTimeout(state.wheelTimer);
		clearTimeout(readyTimer);
	};
}

function mount() {
	document.querySelectorAll<HTMLElement>('[data-circular-carousel]').forEach((root) => {
		if (root.dataset.ccBound === '1') return;
		root.dataset.ccBound = '1';
		instances.set(root, setup(root));
	});
}

function unmount() {
	instances.forEach((destroy) => destroy());
	instances.clear();
	document.querySelectorAll<HTMLElement>('[data-circular-carousel]').forEach((root) => {
		delete root.dataset.ccBound;
	});
}

export function initCircularCarousel() {
	if (bound) return;
	bound = true;
	document.addEventListener('astro:before-swap', unmount);
	document.addEventListener('astro:page-load', mount);
	if (document.readyState !== 'loading') mount();
	else document.addEventListener('DOMContentLoaded', mount, { once: true });
}
