/**
 * FadeContent — 滚动进场（React Bits 的 FadeContent 原生移植，去 React、保留 GSAP）。
 *
 * 给一块内容在滚入视口时做「进场」动画，六种效果：
 *   fade     淡入（可带高斯模糊）
 *   focus    先轻微缩小+模糊，再聚焦到清晰
 *   develop  从「灰度+低对比+高亮」显影成正常
 *   dissolve / mist / pixel  用 SVG feTurbulence 生成噪点遮罩，随进度「蚀刻」显形
 *
 * 支持 stagger（子元素错峰）、scroll/mount 两种触发、scrub（滚动驱动）、
 * exit（滚出反向退出）与 disappearAfter（显形后延时再隐去）。
 * 组件只负责标记，逻辑在本文件统一跑，配合 Astro View Transitions 的 page-load 挂载。
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

type Effect = 'fade' | 'focus' | 'develop' | 'dissolve' | 'mist' | 'pixel';
type StaggerFrom = 'start' | 'end' | 'center' | 'edges' | 'random';

interface Settings {
	container: string | null;
	effect: Effect;
	blur: number;
	duration: number;
	ease: string;
	delay: number;
	threshold: number;
	initialOpacity: number;
	stagger: number;
	staggerFrom: StaggerFrom;
	trigger: 'scroll' | 'mount';
	once: boolean;
	exit: boolean;
	scrub: number; // <0 表示关闭
	disappearAfter: number;
	disappearDuration: number;
	disappearEase: string;
}

const NOISE_EFFECTS: Effect[] = ['dissolve', 'mist', 'pixel'];

// 33 级 sigmoid 查找表，用于噪点遮罩的 alpha 曲线
const LEVELS = Array.from({ length: 33 }, (_, i) => 1 / (1 + Math.exp(-10.8 * (i / 32 - 0.5))));

let maskCount = 0;

const toSeconds = (value: number) => (typeof value === 'number' && value > 10 ? value / 1000 : value);
const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);
const smoothstep = (from: number, to: number, value: number) => {
	const t = clamp01((value - from) / (to - from));
	return t * t * (3 - 2 * t);
};

const numOf = (value: string | undefined, fallback: number) => {
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
};

const noiseFor = (kind: Effect, size: number) => {
	if (kind === 'mist') {
		return { frequency: Math.min(Math.max(4 / size, 0.004), 0.02), octaves: 3, edge: 0.35, blur: 10, block: 0 };
	}
	if (kind === 'pixel') {
		const block = 2 * Math.round(Math.min(Math.max(size / 32, 6), 24) / 2);
		return { frequency: 0.5 / block, octaves: 1, edge: 0.06, blur: 0, block };
	}
	return { frequency: 0.6, octaves: 1, edge: 0.15, blur: 0, block: 0 };
};

const SVG_NS = 'http://www.w3.org/2000/svg';

const createNoiseMask = (target: HTMLElement, kind: Effect, floor: number, extraBlur: number) => {
	const box = target.getBoundingClientRect();
	const { frequency, octaves, edge, blur, block } = noiseFor(kind, Math.sqrt(Math.max(box.width * box.height, 1)));
	const node = (name: string, attrs: Record<string, string | number>, parent: Element) => {
		const child = document.createElementNS(SVG_NS, name) as SVGElement;
		Object.entries(attrs).forEach(([key, value]) => child.setAttribute(key, String(value)));
		parent.appendChild(child);
		return child;
	};
	const svg = node('svg', { width: 0, height: 0, 'aria-hidden': 'true' }, document.body);
	svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
	const id = 'fade-content-mask-' + (maskCount += 1);
	const filter = node(
		'filter',
		{ id, x: '-10%', y: '-10%', width: '120%', height: '120%', 'color-interpolation-filters': 'sRGB' },
		svg,
	);
	node(
		'feTurbulence',
		{
			type: 'fractalNoise',
			baseFrequency: frequency,
			numOctaves: octaves,
			seed: Math.floor(Math.random() * 1000),
			result: 'noise',
		},
		filter,
	);
	let source = 'noise';
	if (block > 0) {
		const dot = block / 2 - 1;
		node('feColorMatrix', { in: 'noise', type: 'matrix', values: '1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 0 0 0 0 1', result: 'gray' }, filter);
		node('feFlood', { x: dot, y: dot, width: 2, height: 2, 'flood-color': '#000', result: 'dot' }, filter);
		node('feComposite', { in: 'dot', in2: 'dot', width: block, height: block, result: 'cell' }, filter);
		node('feTile', { in: 'cell', result: 'grid' }, filter);
		node('feComposite', { in: 'gray', in2: 'grid', operator: 'in', result: 'samples' }, filter);
		node('feMorphology', { in: 'samples', operator: 'dilate', radius: dot, result: 'blocks' }, filter);
		source = 'blocks';
	}
	node('feColorMatrix', { in: source, type: 'matrix', values: '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1.43 0 0 0 -0.21' }, filter);
	const curve = node('feFuncA', { type: 'table' }, node('feComponentTransfer', { result: 'mask' }, filter));
	node('feComposite', { in: 'SourceGraphic', in2: 'mask', operator: 'in' }, filter);

	const url = 'url(#' + id + ')';
	const blurFrom = blur + extraBlur;
	const state = { progress: 0 };
	let drawn = -1;

	const render = () => {
		const progress = state.progress;
		if (progress === drawn) return;
		drawn = progress;
		if (progress >= 1) {
			target.style.filter = '';
			target.style.visibility = 'inherit';
			return;
		}
		const front = progress * (1 + 2 * edge) - edge;
		curve.setAttribute(
			'tableValues',
			LEVELS.map((level) => (floor + (1 - floor) * (1 - smoothstep(front - edge, front + edge, level))).toFixed(3)).join(' '),
		);
		target.style.filter = blurFrom > 0 ? url + ' blur(' + (blurFrom * (1 - progress)).toFixed(2) + 'px)' : url;
		target.style.visibility = progress <= 0 && floor <= 0 ? 'hidden' : 'inherit';
	};

	render();

	return {
		state,
		render,
		remove: () => {
			svg.remove();
			target.style.filter = '';
		},
	};
};

const getLooks = (effect: Effect, blur: number, initialOpacity: number) => {
	const soften = (amount: number) => 'blur(' + amount + 'px)';
	if (effect === 'focus') {
		return [
			{ from: { autoAlpha: initialOpacity }, to: { autoAlpha: 1 }, share: 0.6 },
			{ from: { filter: soften(12 + blur), scale: 0.97 }, to: { filter: soften(0), scale: 1 }, share: 1 },
		];
	}
	if (effect === 'develop') {
		return [
			{ from: { autoAlpha: initialOpacity }, to: { autoAlpha: 1 }, share: 0.5 },
			{
				from: { filter: 'grayscale(1) contrast(0.55) brightness(1.3) ' + soften(blur) },
				to: { filter: 'grayscale(0) contrast(1) brightness(1) ' + soften(0) },
				share: 1,
			},
		];
	}
	if (blur > 0) {
		return [{ from: { autoAlpha: initialOpacity, filter: soften(blur) }, to: { autoAlpha: 1, filter: soften(0) }, share: 1 }];
	}
	return [{ from: { autoAlpha: initialOpacity }, to: { autoAlpha: 1 }, share: 1 }];
};

const readSettings = (el: HTMLElement): Settings => {
	const d = el.dataset;
	return {
		container: d.fadeContainer || null,
		effect: (d.fadeEffect as Effect) || 'fade',
		blur: d.fadeBlur === 'true' ? 10 : numOf(d.fadeBlur, 0),
		duration: numOf(d.fadeDuration, 1),
		ease: d.fadeEase || 'power2.out',
		delay: numOf(d.fadeDelay, 0),
		threshold: numOf(d.fadeThreshold, 0.1),
		initialOpacity: numOf(d.fadeInitialOpacity, 0),
		stagger: numOf(d.fadeStagger, 0),
		staggerFrom: (d.fadeStaggerFrom as StaggerFrom) || 'start',
		trigger: (d.fadeTrigger as 'scroll' | 'mount') || 'scroll',
		once: d.fadeOnce !== 'false',
		exit: d.fadeExit === 'true',
		scrub: d.fadeScrub === 'true' ? 0 : numOf(d.fadeScrub, -1),
		disappearAfter: numOf(d.fadeDisappearAfter, 0),
		disappearDuration: numOf(d.fadeDisappearDuration, 0.5),
		disappearEase: d.fadeDisappearEase || 'power2.in',
	};
};

function mount(el: HTMLElement) {
	if (el.dataset.fadeReady === '1') return;
	el.dataset.fadeReady = '1';

	const s = readSettings(el);

	// 覆盖已有标记的隐藏态，交给 GSAP 控制
	const applyInitialHidden = () => {
		el.style.visibility = 'visible';
	};

	const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

	let masks: ReturnType<typeof createNoiseMask>[] = [];
	let follow: gsap.core.Tween | null = null;

	const source = s.container || document.getElementById('snap-main-container') || null;
	const scroller: Element | null = typeof source === 'string' ? document.querySelector(source) : source;

	const ctx = gsap.context(() => {
		const targets: HTMLElement[] = s.stagger > 0 && el.children.length ? (Array.from(el.children) as HTMLElement[]) : [el];
		gsap.set(el, { visibility: 'visible' });

		if (reduce) {
			return;
		}

		const seconds = Math.max(toSeconds(s.duration) || 0, 0.01);
		const startOpacity = clamp01(Number(s.initialOpacity) || 0);
		const staggerVars: gsap.TweenVars = s.stagger > 0 ? { stagger: { each: toSeconds(s.stagger), from: s.staggerFrom } } : {};
		const noisy = NOISE_EFFECTS.includes(s.effect);
		const looks = noisy ? [] : getLooks(s.effect, s.blur, startOpacity);

		if (noisy) masks = targets.map((target) => createNoiseMask(target, s.effect, startOpacity, s.blur));
		const proxies = masks.map((mask) => mask.state);
		const draw = () => masks.forEach((mask) => mask.render());

		const reveal = (timeline: gsap.core.Timeline, position: number) => {
			if (noisy) {
				timeline.fromTo(proxies, { progress: 0 }, { progress: 1, duration: seconds, ease: s.ease, ...staggerVars, onUpdate: draw }, position);
				return;
			}
			looks.forEach((look) =>
				timeline.fromTo(targets, look.from, { ...look.to, duration: seconds * look.share, ease: s.ease, ...staggerVars }, position),
			);
		};

		const conceal = (timeline: gsap.core.Timeline, vars: gsap.TweenVars) => {
			if (noisy) {
				timeline.to(proxies, { progress: 0, ...vars, onUpdate: draw }, 0);
				return;
			}
			looks.forEach((look) => timeline.to(targets, { ...look.from, ...vars }, 0));
		};

		const settle = () => {
			if (noisy) {
				masks.forEach((mask) => mask.remove());
				masks = [];
				return;
			}
			gsap.set(targets, { clearProps: 'filter,transform' });
		};

		const scrubbing = s.scrub >= 0 && s.trigger !== 'mount';
		const replaying = !s.once || s.exit;
		const disappearing = s.disappearAfter > 0 && !replaying && !scrubbing;

		const tl = gsap.timeline({
			paused: true,
			onComplete: () => {
				if (scrubbing) return;
				if (disappearing) {
					const out = gsap.timeline({ delay: toSeconds(s.disappearAfter) });
					conceal(out, { duration: Math.max(toSeconds(s.disappearDuration) || 0, 0.01), ease: s.disappearEase, ...staggerVars });
					return;
				}
				if (!replaying || !noisy) settle();
			},
		});
		reveal(tl, scrubbing ? 0 : Math.max(toSeconds(s.delay) || 0, 0));

		if (s.trigger === 'mount') {
			tl.play();
			return;
		}

		const measure = () => {
			const view = scroller ? scroller.getBoundingClientRect() : { top: 0, height: window.innerHeight };
			const scrolled = scroller ? (scroller as HTMLElement).scrollTop : window.scrollY;
			const box = el.getBoundingClientRect();
			return {
				height: view.height,
				scrolled,
				limit: scroller
					? (scroller as HTMLElement).scrollHeight - (scroller as HTMLElement).clientHeight
					: document.documentElement.scrollHeight - window.innerHeight,
				top: box.top - view.top + scrolled,
				bottom: box.bottom - view.top + scrolled,
			};
		};

		if (scrubbing) {
			const smoothing = s.scrub;
			const update = () => {
				const { height, scrolled, limit, top, bottom } = measure();
				const zone = height * Math.min(Math.max((1 - 2 * s.threshold) * 0.4, 0.05), 0.4);
				const revealed = Math.min(top - height * (1 - s.threshold) + zone, limit);
				let visible = clamp01((scrolled - revealed) / zone + 1);
				if (s.exit) {
					const outStart = Math.max(bottom - height * s.threshold - zone, 0);
					const outEnd = Math.max(bottom - height * s.threshold, outStart + zone / 2);
					visible = Math.min(visible, 1 - clamp01((scrolled - outStart) / (outEnd - outStart)));
				}
				visible = Math.round(visible * 1000) / 1000;
				if (smoothing > 0) {
					follow = gsap.to(tl, { progress: visible, duration: smoothing, ease: 'power3.out', overwrite: true });
				} else {
					tl.progress(visible);
				}
			};
			ScrollTrigger.create({
				trigger: el,
				scroller,
				start: 'top bottom',
				end: 'bottom top',
				onUpdate: update,
				onRefresh: update,
			});
			update();
			return;
		}

		ScrollTrigger.create({
			trigger: el,
			scroller,
			start: () => {
				const { height, limit, top } = measure();
				const start = top - height * (1 - s.threshold);
				return start > limit ? limit - 1 : start;
			},
			end: s.exit ? 'bottom ' + s.threshold * 100 + '%' : undefined,
			once: !replaying,
			onEnter: () => tl.play(),
			onLeave: s.exit ? () => tl.reverse() : undefined,
			onEnterBack: s.exit ? () => tl.play() : undefined,
			onLeaveBack: s.once ? undefined : () => tl.reverse(),
		});
	}, el);

	const dispose = () => {
		follow?.kill();
		ctx.revert();
		masks.forEach((mask) => mask.remove());
		masks = [];
		delete el.dataset.fadeReady;
	};

	(el as HTMLElement & { __fadeDispose?: () => void }).__fadeDispose = dispose;
}

export function bootAllFade() {
	document.querySelectorAll<HTMLElement>('[data-fade-content]').forEach(mount);
}

export function dropAllFade() {
	document.querySelectorAll<HTMLElement>('[data-fade-content]').forEach((el) => {
		const fn = (el as HTMLElement & { __fadeDispose?: () => void }).__fadeDispose;
		if (fn) {
			fn();
			delete (el as HTMLElement & { __fadeDispose?: () => void }).__fadeDispose;
		}
	});
}

let wired = false;
if (!wired) {
	wired = true;
	document.addEventListener('astro:before-swap', dropAllFade);
	document.addEventListener('astro:page-load', () => {
		// 换页后 ScrollTrigger 的测量可能残留，刷新一遍
		ScrollTrigger.refresh();
		bootAllFade();
	});
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootAllFade, { once: true });
else bootAllFade();
