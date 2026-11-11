// About 首屏运行时：镀铬机器人 + 横向无限文字轨道 + 磁吸让位。
//
// 两条独立的循环合在一个 rAF 里：
//   1) three.js 画机器人（PMREM 黑房间环境、液态玻璃揭示线、蓝色 hover 辉光）；
//   2) DOM 文字轨道按固定速度向左漂，经过机器人脚下的椭圆禁区时整行被顶开，过去后再落回。
//
// 文字之所以留在 DOM：一行一个 <span>，逐行 translateY 就够了，读屏和 SEO 也一起保住。
// 3D 只负责金属头，字不用画进 canvas。

import * as THREE from 'three';

type Line = {
	el: HTMLElement;
	block: number;
	/** 行相对块的左偏移（px） */
	x: number;
	w: number;
	/** 行顶在 stage 坐标系里的位置 */
	top: number;
	h: number;
	shift: number;
	need: number;
};

type BlockRef = {
	el: HTMLElement;
	baseX: number;
	sideY: number;
	/** 当前帧的横向位置（环绕之后） */
	scrollX: number;
	lines: Line[];
};

const GAP_MIN = 200;
const TRACK_SPEED = 26; // px/s，慢速自漂
const SIDE_GAP = 170;
const PAD = 24;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

class StudioHero {
	host: HTMLElement;
	canvas: HTMLCanvasElement;
	stage: HTMLElement;
	track: HTMLElement;
	burst: HTMLElement | null;
	hint: HTMLElement | null;

	renderer!: THREE.WebGLRenderer;
	scene = new THREE.Scene();
	camera!: THREE.PerspectiveCamera;
	bot = new THREE.Group();
	eyes: THREE.Mesh[] = [];
	halo: THREE.Object3D | null = null;

	uniforms = {
		reveal: { value: 0 },
		hover: { value: 0 },
		hit: { value: new THREE.Vector3(0, 0, 0) },
	};

	blocks: BlockRef[] = [];
	allLines: Line[] = [];
	loopLen = 0;
	offset = 0;
	speed = 1;
	paused = false;

	vw = 0;
	vh = 0;
	dpr = 1;

	rot = { x: -0.62, y: 0.59, z: 0.2 };
	rotTarget = { x: -0.62, y: 0.59, z: 0.2 };
	pointer = { x: 0, y: 0, seen: false };
	phase = 0;
	floatSpeed = 1;
	floatAmp = 1;
	blinkAt = 0;
	blink = 0;
	lastInput = performance.now();
	asleep = false;

	raf = 0;
	alive = true;
	last = performance.now();
	ac = new AbortController();
	resizeTimer = 0;
	startedAt = performance.now();

	constructor(host: HTMLElement) {
		this.host = host;
		this.canvas = host.querySelector<HTMLCanvasElement>('[data-sh-bot]')!;
		this.stage = host.querySelector<HTMLElement>('.sh__stage')!;
		this.track = host.querySelector<HTMLElement>('[data-sh-track]')!;
		this.burst = host.querySelector<HTMLElement>('[data-sh-burst]');
		this.hint = host.querySelector<HTMLElement>('[data-sh-hint]');

		this.vw = window.innerWidth;
		this.vh = window.innerHeight;
		this.dpr = Math.min(window.devicePixelRatio || 1, 2);

		this.initRenderer();
		this.initBot();
		this.applySize();
		this.splitText();
		this.layoutTrack();

		const { signal } = this.ac;
		window.addEventListener('resize', this.onResize, { signal });
		window.addEventListener('pointermove', this.onMove, { signal, passive: true });
		window.addEventListener('pointerdown', this.onDown, { signal });
		window.addEventListener('keydown', this.onWake, { signal });
		window.addEventListener('wheel', this.onWake, { signal, passive: true });
		window.addEventListener('touchstart', this.onWake, { signal, passive: true });
		window.addEventListener('scroll', this.onScroll, { signal, passive: true });
		document.addEventListener('visibilitychange', this.onVisibility, { signal });

		this.loop();
	}

	/* ---------------- three ---------------- */

	initRenderer() {
		this.renderer = new THREE.WebGLRenderer({
			canvas: this.canvas,
			antialias: true,
			alpha: true,
			powerPreference: 'high-performance',
		});
		this.renderer.setClearAlpha(0);
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.renderer.toneMapping = THREE.NoToneMapping;

		this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
		this.camera.position.set(0, 0, 13);
		this.camera.lookAt(0, 0, 0);

		this.scene.environment = this.buildEnv();
		this.scene.add(this.bot);
		this.bot.position.z = -1;
	}

	/** 小黑屋 + 几块发光板：金属反射的全部内容都来自这里 */
	buildEnv() {
		const room = new THREE.Scene();
		room.background = new THREE.Color(0x0a0a0b);

		const panel = (w: number, h: number, pos: [number, number, number], rot: [number, number, number], power: number) => {
			const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
			mat.color.setScalar(power);
			const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
			mesh.position.set(...pos);
			mesh.rotation.set(...rot);
			room.add(mesh);
		};

		// 黑房间里只点几块窄长白板：板子一大，镜面球就整颗发白，读不出金属感
		// 正面这块最大最亮：镜面球要有正脸高光，否则整颗头沉进黑底里
		panel(7, 5, [2, 2, 6], [0, Math.PI, 0], 2.2);
		panel(8, 3, [0, 6, 0], [Math.PI / 2, 0, 0], 1.6);
		panel(2.2, 8, [-6, 0, 0], [0, Math.PI / 2, 0], 1.5);
		panel(1.8, 8, [6, 0, 0], [0, -Math.PI / 2, 0], 1.1);
		panel(8, 1.6, [0, -1.5, -6], [0, 0, 0], 1.0);
		panel(10, 4, [0, -6, 0], [-Math.PI / 2, 0, 0], 0.25);

		const pmrem = new THREE.PMREMGenerator(this.renderer);
		const rt = pmrem.fromScene(room, 0.035);
		pmrem.dispose();
		return rt.texture;
	}

	/** 给所有机器人材质注入：揭示线（上方 discard）+ 命中点蓝色辉光 */
	patchMaterial(mat: THREE.Material) {
		const uniforms = this.uniforms;
		mat.onBeforeCompile = (shader) => {
			shader.uniforms.uReveal = uniforms.reveal;
			shader.uniforms.uHover = uniforms.hover;
			shader.uniforms.uHit = uniforms.hit;

			shader.vertexShader = 'varying vec3 vWPos;\n' + shader.vertexShader.replace(
				'#include <begin_vertex>',
				'#include <begin_vertex>\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz;',
			);

			shader.fragmentShader =
				'uniform float uReveal;\nuniform float uHover;\nuniform vec3 uHit;\nvarying vec3 vWPos;\n' +
				shader.fragmentShader
					.replace(
						'void main() {',
						`void main() {
		// 一条从下往上推的液体线，线以上整片丢掉
		float washLine = mix(-2.2, 2.6, uReveal);
		if (vWPos.y > washLine) discard;`,
					)
					.replace(
						'#include <emissivemap_fragment>',
						`#include <emissivemap_fragment>
		float glowD = length(vWPos - uHit);
		float glow = 1.0 - smoothstep(0.0, 1.09, glowD);
		totalEmissiveRadiance += vec3(0.086, 0.129, 1.0) * pow(max(glow, 0.0), 3.0) * 0.4 * uHover;`,
					);
		};
		mat.customProgramCacheKey = () => 'studio-bot-reveal';
		return mat;
	}

	initBot() {
		const chrome = this.patchMaterial(
			new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 1, roughness: 0.14, envMapIntensity: 1.15 }),
		);
		const visorMat = this.patchMaterial(
			new THREE.MeshPhysicalMaterial({
				color: 0x040405,
				metalness: 0.3,
				roughness: 0.12,
				clearcoat: 1,
				clearcoatRoughness: 0.04,
			}),
		);
		const eyeMat = this.patchMaterial(new THREE.MeshBasicMaterial({ color: 0xf2f2ee }));

		// 头
		const head = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), chrome);
		head.scale.set(1.1, 1, 0.98);
		this.bot.add(head);

		// 面罩：同一颗球的前脸切片，放大 1.5% 贴在表面
		const visor = new THREE.Mesh(
			new THREE.SphereGeometry(1, 48, 32, Math.PI / 2 - 1.02, 2.04, Math.PI / 2 - 0.5, 1.0),
			visorMat,
		);
		visor.scale.set(1.1 * 1.015, 1.015, 0.98 * 1.015);
		this.bot.add(visor);

		// 眼睛：两颗压扁的胶囊，浮在面罩外
		for (const sx of [-1, 1]) {
			const eye = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.2, 6, 12), eyeMat);
			// 放在球面外侧一点，否则会被头挡住
			eye.position.set(sx * 0.3, 0.03, 0.97);
			eye.scale.set(0.9, 1, 0.45);
			eye.rotation.x = -0.06;
			this.bot.add(eye);
			this.eyes.push(eye);
		}

		// 天线
		const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.42, 16), chrome);
		stem.position.y = 1.15;
		this.bot.add(stem);

		const tip = new THREE.Mesh(new THREE.SphereGeometry(0.095, 24, 18), chrome);
		tip.position.y = 1.38;
		this.bot.add(tip);

		// 耳朵：竖起来的圆环 + 深色端盖
		for (const sx of [-1, 1]) {
			const ear = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.065, 16, 40), chrome);
			ear.position.set(sx * 1.1, 0, 0);
			ear.rotation.y = Math.PI / 2;
			this.bot.add(ear);

			const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.06, 32), visorMat);
			cap.position.set(sx * 1.16, 0, 0);
			cap.rotation.z = Math.PI / 2;
			this.bot.add(cap);
		}

		// 光环：压在头下方，绕自身轴慢转
		const halo = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.05, 16, 64), chrome);
		halo.position.y = -1.28;
		halo.rotation.x = 0.92 * (Math.PI / 2);
		this.bot.add(halo);
		this.halo = halo;

		// 量一次原始包围盒：把几何中心挪到原点，并记下基准高度
		const box = new THREE.Box3().setFromObject(this.bot);
		const center = new THREE.Vector3();
		const size = new THREE.Vector3();
		box.getCenter(center);
		box.getSize(size);
		this.bot.children.forEach((child) => child.position.sub(center));
		this.baseHeight = size.y;
	}

	baseHeight = 1;

	/** 尺寸相关的统一入口：渲染器、相机、机器人比例一起对齐 */
	applySize() {
		this.renderer.setPixelRatio(this.dpr);
		this.renderer.setSize(this.vw, this.vh, false);
		this.camera.aspect = this.vw / this.vh;
		this.camera.updateProjectionMatrix();
		this.fitBot();
	}

	/** 机器人恒定 200px 高（窄屏 170/180）—— 基准高度只在建模时量一次，别重复量 */
	fitBot() {
		const worldPerPx = (2 * 13 * Math.tan(THREE.MathUtils.degToRad(22.5))) / this.vh;
		const targetPx = this.vw <= 640 ? 148 : this.vw <= 1024 ? 168 : this.vw <= 1440 ? 180 : 200;
		this.bot.scale.setScalar((targetPx * worldPerPx) / Math.max(0.0001, this.baseHeight));
	}

	/* ---------------- 文字轨道 ---------------- */

	/** 把整段正文按视觉宽度切成一行行 <span class="sh-line"> */
	splitText() {
		const prob = document.createElement('canvas').getContext('2d')!;
		const maxW = this.vw <= 1024 ? 300 : 320;

		this.host.querySelectorAll<HTMLElement>('[data-sh-split]').forEach((p) => {
			const text = p.textContent ?? '';
			if (!text) return;
			const cs = getComputedStyle(p);
			prob.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
			const max = Math.min(maxW, this.vw * 0.72);

			const lines: string[] = [];
			let cur = '';
			for (const ch of text) {
				const next = cur + ch;
				if (prob.measureText(next).width > max && cur) {
					lines.push(cur);
					cur = ch;
				} else {
					cur = next;
				}
			}
			if (cur) lines.push(cur);

			p.textContent = '';
			for (const line of lines) {
				const span = document.createElement('span');
				span.className = 'sh-line';
				span.textContent = line;
				p.appendChild(span);
			}
		});
	}

	layoutTrack() {
		const els = Array.from(this.track.querySelectorAll<HTMLElement>('[data-sh-block]'));
		this.blocks = [];
		this.allLines = [];

		// 先量宽度（此时都是 display 块、transform 还没写）
		els.forEach((el) => {
			const side = el.dataset.side === 'top' ? 'top' : 'bottom';
			this.blocks.push({
				el,
				baseX: 0,
				sideY: side === 'top' ? -el.offsetHeight - SIDE_GAP : SIDE_GAP,
				scrollX: 0,
				lines: [],
			});
		});

		let cursor = this.vw * 0.5 + (this.vw <= 640 ? 70 : 200);
		this.blocks.forEach((b) => {
			b.baseX = cursor;
			// 每个站点往前推的距离：块宽的 62% 与 200px 取大，再加 90px 气口
			cursor += Math.max(b.el.offsetWidth * 0.62, GAP_MIN) + 90;
		});
		this.loopLen = cursor + 260 + this.vw * 0.5;

		// 逐行量位置：块先摆到 baseX，行位置取 offsetLeft/offsetTop（相对块）
		const stageRect = this.stage.getBoundingClientRect();
		this.blocks.forEach((b, bi) => {
			b.el.style.transform = `translate3d(${b.baseX}px, ${b.sideY}px, 0)`;
			const blockRect = b.el.getBoundingClientRect();
			b.el.querySelectorAll<HTMLElement>('.sh-line').forEach((el) => {
				const line: Line = {
					el,
					block: bi,
					x: el.offsetLeft,
					w: el.offsetWidth,
					top: blockRect.top - stageRect.top + el.offsetTop,
					h: el.offsetHeight,
					shift: 0,
					need: 0,
				};
				b.lines.push(line);
				this.allLines.push(line);
			});
			// 文案里有链接时，整块在高亮/点击上的手感更稳
			if (b.el.dataset.kind === 'links') b.el.style.pointerEvents = 'none';
		});
	}

	/* ---------------- 交互 ---------------- */

	onResize = () => {
		window.clearTimeout(this.resizeTimer);
		this.resizeTimer = window.setTimeout(() => this.resize(), 160);
	};

	resize() {
		this.vw = window.innerWidth;
		this.vh = window.innerHeight;
		this.dpr = Math.min(window.devicePixelRatio || 1, 2);

		this.applySize();

		this.splitText();
		this.layoutTrack();
	}

	onMove = (e: PointerEvent) => {
		if (e.pointerType === 'touch') return;
		this.pointer.x = e.clientX;
		this.pointer.y = e.clientY;
		this.pointer.seen = true;
		this.lastInput = performance.now();
		if (this.asleep) this.wake();
	};

	onDown = (e: PointerEvent) => {
		this.lastInput = performance.now();
		if (this.asleep) this.wake();
		if (!this.burst || this.uniforms.reveal.value < 0.8) return;

		// 只认落在机器人身上的点击
		const r = this.stage.getBoundingClientRect();
		const cx = r.left + r.width / 2;
		const cy = r.top + r.height / 2;
		if (Math.hypot(e.clientX - cx, e.clientY - cy) > 150) return;

		this.burst.classList.remove('is-fire');
		// 强制重启动画
		void this.burst.offsetWidth;
		this.burst.classList.add('is-fire');

		// 反应：先缩一下再弹回，然后摇头
		this.rotTarget.x = -0.45;
		this.rotTarget.y = 0.18;
		window.setTimeout(() => {
			this.rotTarget.x = 0;
			this.rotTarget.y = 0;
		}, 160);
		this.shake = 1;
	};

	onWake = () => {
		this.lastInput = performance.now();
		if (this.asleep) this.wake();
	};

	onScroll = () => {
		if (window.scrollY > 40) this.hint?.classList.add('is-off');
	};

	onVisibility = () => {
		if (document.hidden) {
			cancelAnimationFrame(this.raf);
			this.raf = 0;
		} else if (!this.raf && this.alive) {
			this.last = performance.now();
			this.loop();
		}
	};

	shake = 0;

	wake() {
		this.asleep = false;
		this.floatSpeed = 1;
		this.floatAmp = 1;
		this.eyes.forEach((e) => (e.scale.y = 1));
	}

	/* ---------------- 每帧 ---------------- */

	loop = () => {
		if (!this.alive) return;
		this.raf = requestAnimationFrame(this.loop);

		const now = performance.now();
		const dt = Math.min(0.05, (now - this.last) / 1000);
		this.last = now;

		this.updateBot(dt, now);
		if (!reduced()) this.updateTrack(dt);

		this.renderer.render(this.scene, this.camera);
	};

	updateBot(dt: number, now: number) {
		const revealed = this.uniforms.reveal.value;
		const rect = this.stage.getBoundingClientRect();
		// 揭示：首访 1s 延迟后 3.85s 推上来
		if (this.uniforms.reveal.value < 1) {
			const t = clamp((now - this.startedAt - 1000) / 3850, 0, 1);
			this.uniforms.reveal.value = 1 - (1 - t) * (1 - t);
		}

		// 鼠标跟随：目标角来自指针相对中心的偏移
		if (this.pointer.seen && !reduced()) {
			const nx = (this.pointer.x - (rect.left + rect.width / 2)) / (rect.width / 2);
			const ny = (this.pointer.y - (rect.top + rect.height / 2)) / (rect.height / 2);
			this.rotTarget.x = clamp(ny * 0.62, -0.62, 0.62);
			this.rotTarget.y = clamp(nx * 0.59, -0.59, 0.59);
			this.rotTarget.z = 0.2 * nx;
		}

		// 30 秒无输入就打瞌睡
		if (!this.asleep && this.pointer.seen && now - this.lastInput > 30000 && revealed > 0.99) {
			this.asleep = true;
			this.floatSpeed = 0.35;
			this.floatAmp = 1.6;
			this.rotTarget.x = 0.42;
			this.rotTarget.y = 0;
			this.rotTarget.z = 0.12;
			this.eyes.forEach((e) => (e.scale.y = 0.2));
		}

		const k = 1 - Math.pow(1 - 0.08, dt * 60);
		this.rot.x += (this.rotTarget.x - this.rot.x) * k;
		this.rot.y += (this.rotTarget.y - this.rot.y) * k;
		this.rot.z += (this.rotTarget.z - this.rot.z) * k;

		// 摇头：一下一下地摆正
		if (this.shake > 0) {
			const t = 1 - this.shake;
			const off = Math.sin(t * Math.PI * 6) * 0.22 * this.shake;
			this.bot.rotation.y = this.rot.y + off;
			this.shake = Math.max(0, this.shake - dt * 2.2);
		} else {
			this.bot.rotation.set(this.rot.x, this.rot.y, this.rot.z * 0.4);
		}

		// 漂浮
		this.phase += dt * 1.5 * this.floatSpeed;
		this.bot.position.y = Math.sin(this.phase) * 0.2 * this.floatAmp * revealed;

		// 眨眼：3–5 秒一次
		if (now > this.blinkAt) {
			this.blinkAt = now + 3000 + Math.random() * 2000;
			this.blink = 1;
		}
		if (this.blink > 0) {
			this.blink = Math.max(0, this.blink - dt / 0.18);
			// 0 → 1 → 0 的三角波：压到 10% 再回来
			const squash = 1 - Math.sin(this.blink * Math.PI) * 0.9;
			this.eyes.forEach((e) => (e.scale.y = this.asleep ? 0.2 : squash));
		}

		if (this.halo) this.halo.rotation.z += dt * 0.35;

		// hover 辉光：命中点用屏幕中心附近做近似（头就长在中间）
		const near =
			this.pointer.seen &&
			Math.hypot(this.pointer.x - (rect.left + rect.width / 2), this.pointer.y - (rect.top + rect.height / 2)) < 150;
		this.uniforms.hover.value += ((near ? 1 : 0) - this.uniforms.hover.value) * (near ? 0.1 : 0.05);
	}

	updateTrack(dt: number) {
		this.offset += dt * TRACK_SPEED * this.speed;
		const L = this.loopLen;
		if (this.offset > L) this.offset -= L;

		// 椭圆的横向半径随视口收一点
		const rect = this.stage.getBoundingClientRect();
		const rx = clamp(rect.width * 0.2, 140, 190);
		const ry = rx * 1.192;
		const cx = rect.width / 2;
		const cy = rect.height / 2;

		// 1) 摆块
		for (const b of this.blocks) {
			// 环绕：把 x 收在 [-L/2, L/2)
			const raw = b.baseX - this.offset;
			const x = (((raw + L / 2) % L) + L) % L - L / 2;
			b.el.style.transform = `translate3d(${x.toFixed(2)}px, ${b.sideY}px, 0)`;
			b.scrollX = x;
		}

		// 2) 算每一行需要的位移
		for (const line of this.allLines) {
			const b = this.blocks[line.block];
			const x1 = b.scrollX + line.x;
			const x2 = x1 + line.w;
			const dist = x1 > cx ? x1 - cx : x2 < cx ? cx - x2 : 0;

			let need = 0;
			if (dist < rx) {
				const h = ry * Math.sqrt(Math.max(0, 1 - (dist / rx) ** 2)) + PAD;
				const mid = line.top + line.h / 2;
				need = mid < cy ? Math.min(0, cy - h - (line.top + line.h)) : Math.max(0, cy + h - line.top);
			}
			line.need = need;
		}

		// 3) 由内向外传递：外圈至少跟内圈一样远，避免行与行互相压
		const order = this.allLines
			.filter((l) => l.need !== 0 || Math.abs(l.shift) > 0.4)
			.sort((a, b) => Math.abs(a.top - cy) - Math.abs(b.top - cy));

		let above = 0;
		let below = 0;
		for (const line of order) {
			const isAbove = line.top + line.h / 2 < cy;
			if (isAbove) {
				line.need = Math.min(line.need, above);
				above = line.need;
			} else {
				line.need = Math.max(line.need, below);
				below = line.need;
			}
		}

		// 4) 缓动：越靠近机器人跟得越快
		const rank = new Map<Line, number>();
		order.forEach((l, i) => rank.set(l, i));
		for (const line of this.allLines) {
			const k = rank.get(line) ?? 6;
			const f = Math.max(0.1, 0.14 - 0.012 * k);
			line.shift += (line.need - line.shift) * f;
			if (Math.abs(line.shift) < 0.05 && line.need === 0) {
				if (line.el.style.transform) line.el.style.transform = '';
			} else {
				line.el.style.transform = `translateY(${line.shift.toFixed(2)}px)`;
			}
		}
	}

	dispose() {
		this.alive = false;
		cancelAnimationFrame(this.raf);
		this.ac.abort();
		this.renderer.dispose();
		this.scene.traverse((o) => {
			const mesh = o as THREE.Mesh;
			if (mesh.geometry) mesh.geometry.dispose();
			const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
			if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
			else mat?.dispose();
		});
	}
}

const registry = new WeakMap<HTMLElement, StudioHero>();
let starting = false;

async function start() {
	const host = document.querySelector<HTMLElement>('[data-studio-hero]');
	if (!host || registry.has(host) || starting) return;
	starting = true;
	try {
		await document.fonts.ready;
	} catch {
		/* 字体没就绪也继续，最多切成系统字 */
	}
	const hero = new StudioHero(host);
	registry.set(host, hero);
	starting = false;
}

export function initStudioHero() {
	void start();
}
