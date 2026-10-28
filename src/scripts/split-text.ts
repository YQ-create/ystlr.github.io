/**
 * SplitText — 逐字/逐词拆分进场动画（React Bits 的 SplitText 原生移植，去 React、保留 GSAP）。
 *
 * 把一段文字按字符/词/行拆开，滚入视口时逐块进场。效果有 rise / fade / blur /
 * flip / pop / skew / wave 七种；支持 hover 交互（lift 弹簧抬升 / wave 波浪）、
 * click 触发、loop 循环。mask 模式下每个字套一个裁切容器，位移不会溢出。
 *
 * 逻辑在本文件统一跑；组件输出 <tag data-split-text data-...> 标记。
 * 依赖 gsap + ScrollTrigger + SplitText 插件（纯 JS，未引入 React）。
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText as GSAPSplitText } from 'gsap/SplitText';

gsap.registerPlugin(ScrollTrigger, GSAPSplitText);

type Effect = 'rise' | 'fade' | 'blur' | 'flip' | 'pop' | 'skew' | 'wave';
type StaggerFrom = 'start' | 'center' | 'end' | 'edges' | 'random';
type Trigger = 'view' | 'load' | 'hover' | 'click';
type HoverEffect = 'none' | 'lift' | 'wave';

const DEFAULT_FROM = { opacity: 0, y: 40 };
const DEFAULT_TO = { opacity: 1, y: 0 };
const STIFFNESS = 180;
const DAMPING = 19;
const KICK = 0.024;

interface Spring {
	y: number;
	v: number;
}
interface Kick {
	index: number;
	velocity: number;
	at: number;
}

const waveEase = (t: number) => 1 - Math.cos(t * Math.PI * 1.5) * Math.pow(1 - t, 1.2);

const getEffect = (effect: Effect, em: number) => {
	switch (effect) {
		case 'fade':
			return { from: { opacity: 0 }, to: { opacity: 1 }, ease: 'power2.inOut' };
		case 'blur':
			return {
				from: { opacity: 0, filter: 'blur(' + Math.round(em * 1.4) / 10 + 'px)' },
				to: { opacity: 1, filter: 'blur(0px)' },
				ease: 'power2.out',
			};
		case 'flip': {
			const setup = { transformPerspective: em * 6, transformOrigin: '50% 100%' };
			return { from: { ...setup, opacity: 0, rotationX: -90 }, to: { ...setup, opacity: 1, rotationX: 0 }, ease: 'power3.out' };
		}
		case 'pop':
			return { from: { opacity: 0, scale: 0 }, to: { opacity: 1, scale: 1 }, ease: 'back.out(1.6)' };
		case 'skew':
			return {
				from: { transformOrigin: '50% 100%', opacity: 0, x: -em * 0.4, skewX: -24 },
				to: { transformOrigin: '50% 100%', opacity: 1, x: 0, skewX: 0 },
				ease: 'expo.out',
			};
		case 'wave':
			return { from: { opacity: 0, y: em * 0.45 }, to: { opacity: 1, y: 0 }, ease: waveEase };
		default:
			return { from: { ...DEFAULT_FROM }, to: { ...DEFAULT_TO }, ease: 'power3.out' };
	}
};

const fontsAreLoaded = (): boolean => typeof document !== 'undefined' && (!document.fonts || document.fonts.status === 'loaded');

const numOf = (value: string | undefined, fallback: number) => {
	if (value === undefined || value === '') return fallback;
	const n = Number(value);
	return Number.isNaN(n) ? fallback : n;
};

function mount(el: HTMLElement) {
	if (el.dataset.splitReady === '1') return;
	el.dataset.splitReady = '1';

	const d = el.dataset;
	const text = d.splitText || '';
	if (!text) {
		return;
	}

	const delay = numOf(d.splitDelay, 50);
	const duration = numOf(d.splitDuration, 1.25);
	const splitType = (d.splitType as 'chars' | 'words' | 'lines' | 'words, chars') || 'chars';
	const threshold = numOf(d.splitThreshold, 0.1);
	const rootMargin = d.splitRootMargin || '-100px';
	const staggerFrom = (d.splitStaggerFrom as StaggerFrom) || 'start';
	const mask = d.splitMask === 'true';
	const effect = (d.splitEffect as Effect) || 'rise';
	const trigger = (d.splitTrigger as Trigger) || 'view';
	const loop = d.splitLoop === 'true';
	const loopDelay = numOf(d.splitLoopDelay, 1.5);
	const hoverEffect = (d.splitHoverEffect as HoverEffect) || 'none';

	// 首屏前先隐藏，等字体就绪再拆，避免用回退字体量错位置。
	// 注意：组件 CSS 里 .split-parent 默认 visibility:hidden，这里必须用 inline
	// visible 显式覆盖（设 '' 会被样式表规则盖回去）。
	const revealOnce = () => {
		if (el.dataset.splitShown === '1') return;
		el.dataset.splitShown = '1';
		el.style.visibility = 'visible';
	};

	const run = () => {
		el.getBoundingClientRect();
		if (!fontsAreLoaded()) {
			document.fonts.ready.then(() => {
				if (document.contains(el)) run();
			});
			return;
		}

		if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
			revealOnce();
			return;
		}

		const startPct = (1 - threshold) * 100;
		const marginMatch = /^(-?\d+(?:\.\d+)?)(px|em|rem|%)?$/.exec(rootMargin);
		const marginValue = marginMatch ? parseFloat(marginMatch[1]) : 0;
		const marginUnit = marginMatch ? marginMatch[2] || 'px' : 'px';
		const sign = marginValue === 0 ? '' : marginValue < 0 ? '-=' + Math.abs(marginValue) + marginUnit : '+=' + marginValue + marginUnit;
		const start = 'top ' + startPct + '%' + sign;
		const unit: 'chars' | 'words' | 'lines' = splitType.includes('chars')
			? 'chars'
			: splitType.includes('words')
				? 'words'
				: 'lines';

		const em = parseFloat(getComputedStyle(el).fontSize) || 16;
		const look = getEffect(effect, em);
		const fromVars = look.from;
		const toVars = look.to;
		const easing = look.ease;
		const settle = 'transform,filter,willChange';
		const exit = Math.max(0.35, duration * 0.55);

		let pieces: Element[] = [];
		let movers: HTMLElement[] = [];
		let order = gsap.utils.distribute({ each: delay / 1000, from: staggerFrom });
		let revealed = false;
		let intro: gsap.core.Timeline | null = null;
		let busy: gsap.core.Timeline | null = null;
		let queued: gsap.core.Tween | null = null;
		let raf = 0;
		let last = 0;
		let centers: { x: number; y: number }[] | null = null;
		const lift = em * 0.2;
		const springs: Spring[] = [];
		const kicks: Kick[] = [];
		const pointer = { x: 0, y: 0, inside: false };

		const reveal = (initial: boolean, vars?: gsap.TimelineVars) => {
			const tl = gsap.timeline(vars);
			tl.fromTo(
				pieces,
				{ ...fromVars, willChange: 'transform, opacity' },
				{ ...toVars, duration, ease: easing, stagger: order, immediateRender: initial },
				0,
			);
			tl.set(pieces, { clearProps: settle });
			return tl;
		};

		const conceal = () => {
			const tl = gsap.timeline();
			tl.fromTo(
				pieces,
				{ ...toVars, willChange: 'transform, opacity' },
				{ ...fromVars, duration: exit, ease: 'power2.in', stagger: order, immediateRender: false },
				0,
			);
			return tl;
		};

		const cycle = () => {
			if (busy || !revealed || !pieces.length) return;
			queued?.kill();
			queued = null;
			busy = gsap
				.timeline({ onComplete: () => { busy = null; queue(); } })
				.add(conceal(), 0)
				.add(reveal(false), exit);
		};

		const queue = () => {
			queued?.kill();
			queued = loop ? gsap.delayedCall(loopDelay, cycle) : null;
		};

		const measure = () => {
			const box = el.getBoundingClientRect();
			centers = movers.map((node, i) => {
				const rect = node.getBoundingClientRect();
				return {
					x: rect.left + rect.width / 2 - box.left,
					y: rect.top + rect.height / 2 - box.top - (springs[i]?.y || 0),
				};
			});
		};

		const tick = (now: number) => {
			raf = 0;
			const dt = Math.min(0.032, Math.max(0.001, (now - last) / 1000));
			last = now;
			const spots = hoverEffect === 'lift' && pointer.inside && revealed ? centers : null;
			const radius = em * 1.15;
			let moving = false;
			for (let k = kicks.length - 1; k >= 0; k--) {
				if (now < kicks[k].at) continue;
				const spring = springs[kicks[k].index];
				if (spring) spring.v -= kicks[k].velocity;
				kicks.splice(k, 1);
			}
			movers.forEach((node, i) => {
				const spring = springs[i] || (springs[i] = { y: 0, v: 0 });
				const spot = spots?.[i];
				let target = 0;
				if (spot) {
					const dx = (spot.x - pointer.x) / radius;
					const dy = (spot.y - pointer.y) / (radius * 1.4);
					target = -lift * Math.exp(-(dx * dx + dy * dy) * 0.5);
				}
				spring.v += (STIFFNESS * (target - spring.y) - DAMPING * spring.v) * dt;
				spring.y += spring.v * dt;
				if (Math.abs(target - spring.y) < 0.02 && Math.abs(spring.v) < 0.05) {
					spring.y = target;
					spring.v = 0;
				} else {
					moving = true;
				}
				node.style.translate = Math.abs(spring.y) > 0.01 ? '0 ' + spring.y.toFixed(2) + 'px' : '';
			});
			if (moving || kicks.length) raf = requestAnimationFrame(tick);
		};

		const wake = () => {
			if (raf) return;
			last = performance.now();
			raf = requestAnimationFrame(tick);
		};

		const locate = (e: PointerEvent) => {
			const box = el.getBoundingClientRect();
			pointer.x = e.clientX - box.left;
			pointer.y = e.clientY - box.top;
		};

		const onEnter = (e: PointerEvent) => {
			locate(e);
			pointer.inside = true;
			if (!revealed) return;
			if (trigger === 'hover') cycle();
			if (hoverEffect === 'none') return;
			measure();
			if (hoverEffect === 'wave') {
				const now = performance.now();
				const speed = em * 9;
				const velocity = (em * 0.16) / KICK;
				centers?.forEach((center, index) => {
					kicks.push({ index, velocity, at: now + (Math.abs(center.x - pointer.x) / speed) * 1000 });
				});
			}
			wake();
		};

		const onMove = (e: PointerEvent) => {
			locate(e);
			pointer.inside = true;
			if (!revealed || hoverEffect !== 'lift') return;
			if (!centers) measure();
			wake();
		};

		const onLeave = () => {
			pointer.inside = false;
			wake();
		};

		const onClick = () => {
			if (trigger === 'click') cycle();
		};

		const splitInstance = new GSAPSplitText(el, {
			type: splitType,
			smartWrap: true,
			autoSplit: splitType === 'lines',
			mask: mask ? unit : undefined,
			linesClass: 'split-line',
			wordsClass: 'split-word',
			charsClass: 'split-char',
			reduceWhiteSpace: false,
			onSplit: (self: GSAPSplitText) => {
				pieces = [self[unit], self.chars, self.words, self.lines].find((list) => list.length) || [];
				movers = (mask && self.masks?.length === pieces.length ? self.masks : pieces) as HTMLElement[];
				order = gsap.utils.distribute({ each: delay / 1000, from: staggerFrom });
				centers = null;
				springs.length = 0;
				kicks.length = 0;
				if (busy && busy !== intro) {
					busy.kill();
					busy = null;
				}
				if (revealed) return undefined;
				intro = reveal(true, {
					scrollTrigger:
						trigger === 'load'
							? undefined
							: { trigger: el, start, once: true, fastScrollEnd: true, anticipatePin: 0.4 },
					onComplete: () => {
						revealed = true;
						intro = null;
						busy = null;
						revealOnce();
						queue();
					},
				});
				busy = intro;
				return intro;
			},
		});
		revealOnce();
		if (revealed) queue();

		el.addEventListener('pointerenter', onEnter);
		el.addEventListener('pointermove', onMove);
		el.addEventListener('pointerleave', onLeave);
		el.addEventListener('click', onClick);

		const dispose = () => {
			cancelAnimationFrame(raf);
			queued?.kill();
			busy?.kill();
			el.removeEventListener('pointerenter', onEnter);
			el.removeEventListener('pointermove', onMove);
			el.removeEventListener('pointerleave', onLeave);
			el.removeEventListener('click', onClick);
			movers.forEach((node) => {
				node.style.translate = '';
			});
			ScrollTrigger.getAll().forEach((st) => {
				if (st.trigger === el) st.kill();
			});
			splitInstance.revert();
			delete el.dataset.splitReady;
		};
		(el as HTMLElement & { __splitDispose?: () => void }).__splitDispose = dispose;
	};

	run();
}

export function bootAllSplit() {
	document.querySelectorAll<HTMLElement>('[data-split-text]').forEach(mount);
}

export function dropAllSplit() {
	document.querySelectorAll<HTMLElement>('[data-split-text]').forEach((el) => {
		const fn = (el as HTMLElement & { __splitDispose?: () => void }).__splitDispose;
		if (fn) {
			fn();
			delete (el as HTMLElement & { __splitDispose?: () => void }).__splitDispose;
		}
	});
}

let wired = false;
if (!wired) {
	wired = true;
	document.addEventListener('astro:before-swap', dropAllSplit);
	document.addEventListener('astro:page-load', () => {
		ScrollTrigger.refresh();
		bootAllSplit();
	});
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootAllSplit, { once: true });
else bootAllSplit();
