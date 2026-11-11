// 照片墙的 WebGL 网格引擎（three.js）。
//
// 一个全视口画布，页面自己在画布里纵向滚动（不动 body），像素口径刻意统一：
// 相机 fov 35、z = h/2 / tan(17.5°)，所以 z=0 平面上「1 世界单位 = 1 CSS 像素」，
// 排版的数字可以直接照抄设计稿（8px 间距、40px 行距…）。
//
// 结构：scene（网格 + 文字）→ 4× MSAA 离屏 → 全屏 pass（上下 8% 玻璃折射 + 色散）→ 屏幕。
// 每块 tile 用同一个 shader：骨架灰块 + 斜向流光，贴图到位后 uReveal 淡入；
// 有视频时 uMix 在静帧与视频之间交叉淡化，没有视频就只在静帧上做缓慢推近。
//
// 性能约定：dpr ≤ 2、单 rAF、页面不可见即停帧、离屏只在尺寸变化时重建。

import * as THREE from 'three';

export type GlassItem = {
	/** 静帧（webp，构建期生成） */
	src: string;
	/** 点击放大的大图 */
	big: string;
	title: string;
	meta: string;
	label: string;
	alt: string;
	/** 可选：16:9 预览视频，留空则用静帧做缓慢推近 */
	video?: string;
	/** 媒体宽高比，用于 cover 裁切 */
	ar?: number;
};

type Tile = {
	item: GlassItem;
	group: THREE.Group;
	media: THREE.Mesh;
	chip: THREE.Mesh;
	label: THREE.Mesh;
	mediaMat: THREE.ShaderMaterial;
	chipMat: THREE.ShaderMaterial;
	labelMat: THREE.MeshBasicMaterial;
	reveal: number;
	revealTarget: number;
	mix: number;
	mixTarget: number;
	hover: number;
	hoverTarget: number;
	enter: number;
	delay: number;
	loaded: boolean;
	tex: THREE.Texture | null;
	videoEl: HTMLVideoElement | null;
	videoTex: THREE.VideoTexture | null;
	baseX: number;
	baseY: number;
	col: number;
	row: number;
};

const PAD = 8;
const GAP = 8;
const ROW_GAP = 64;
const HEAD_TOP = 200;
const HEAD_TO_GRID = 80;

const TILE_VS = /* glsl */ `
	varying vec2 vUv;
	void main() {
		vUv = uv;
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	}
`;

const TILE_FS = /* glsl */ `
	precision highp float;
	uniform sampler2D uStill;
	uniform sampler2D uVideo;
	uniform float uMix;     // 0 = 静帧，1 = 视频
	uniform float uReveal;  // 0 = 骨架，1 = 媒体
	uniform float uTime;
	uniform float uPlaneAR;
	uniform float uMediaAR;
	uniform float uZoom;    // 悬停时的缓慢推近
	varying vec2 vUv;

	vec2 coverUv(vec2 uv) {
		vec2 s = uPlaneAR > uMediaAR
			? vec2(1.0, uMediaAR / uPlaneAR)
			: vec2(uPlaneAR / uMediaAR, 1.0);
		// uZoom 让画面轻微放大，避免悬停时看到黑边
		s /= (1.0 + uZoom);
		return (uv - 0.5) * s + 0.5;
	}

	void main() {
		// 骨架：11% 灰 + 一条 45° 斜带扫过
		float sweep = fract(uTime * 0.6);
		float band = smoothstep(0.18, 0.0, abs((vUv.x + vUv.y) * 0.5 - sweep)) * 0.035;
		vec3 skeleton = vec3(0.085) + band;

		vec2 uv = coverUv(vUv);
		vec3 still = texture2D(uStill, uv).rgb;
		vec3 moving = texture2D(uVideo, uv).rgb;
		vec3 media = mix(still, moving, uMix);

		vec3 col = mix(skeleton, media, uReveal);
		gl_FragColor = vec4(col, 1.0);
	}
`;

const CHIP_FS = /* glsl */ `
	precision highp float;
	uniform sampler2D uStill;
	uniform sampler2D uLabel;
	uniform float uOpacity;
	uniform vec2 uSize;     // chip 尺寸（css px）
	uniform float uPlaneAR;
	uniform float uMediaAR;
	uniform vec3 uInk;
	varying vec2 vUv;

	// 圆角矩形 SDF
	float sdRound(vec2 p, vec2 b, float r) {
		vec2 q = abs(p) - b + r;
		return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
	}

	// 金色角螺旋取样：32 个点，让底下的照片糊成一块毛玻璃
	vec3 frosted(vec2 uv) {
		vec2 px = vec2(40.0) / uSize;       // 40px 半径，换算成 uv
		vec2 base = (uv - 0.5) * (uPlaneAR > uMediaAR
			? vec2(1.0, uMediaAR / uPlaneAR)
			: vec2(uPlaneAR / uMediaAR, 1.0));
		vec3 sum = vec3(0.0);
		float wsum = 0.0;
		for (int i = 0; i < 32; i++) {
			float fi = float(i);
			float a = fi * 2.39996323;       // 金色角
			float r = sqrt(fi / 32.0) * 0.5; // 半径平方根分布
			vec2 off = vec2(cos(a), sin(a)) * r * px;
			sum += texture2D(uStill, base + 0.5 + off).rgb;
			wsum += 1.0;
		}
		return sum / wsum;
	}

	void main() {
		vec2 p = (vUv - 0.5) * uSize;
		float d = sdRound(p, uSize * 0.5 - 1.0, 4.0);
		float shape = 1.0 - smoothstep(-1.0, 0.5, d);

		// 毛玻璃底：模糊后的媒体压向近黑
		vec3 glass = mix(frosted(vUv), vec3(0.05), 0.45);
		// 顶部一层很淡的高光，读起来像一片玻璃而不是纯色块
		glass += 0.06 * smoothstep(0.0, 1.0, vUv.y);

		vec4 label = texture2D(uLabel, vUv);
		vec3 col = mix(glass, uInk, label.a);

		gl_FragColor = vec4(col, shape * uOpacity);
	}
`;

const POST_FS = /* glsl */ `
	precision highp float;
	uniform sampler2D uScene;
	uniform vec2 uRes;
	varying vec2 vUv;

	const float BAND = 0.07;

	// 上下两条带：越靠屏幕边缘，取样越往内挤（sag 曲线），三通道各错开一点做色散。
	// 只取三次 sample —— 之前 9 次按通道加权求和会把整条带压成彩虹，得不偿失。
	void main() {
		vec2 uv = vUv;
		float t = -1.0;
		float dir = 1.0;
		if (uv.y > 1.0 - BAND) {
			t = (uv.y - (1.0 - BAND)) / BAND;
			dir = -1.0;
		} else if (uv.y < BAND) {
			t = (BAND - uv.y) / BAND;
			dir = 1.0;
		}

		if (t < 0.0) {
			gl_FragColor = vec4(texture2D(uScene, uv).rgb, 1.0);
			return;
		}

		float sag = 1.0 - sqrt(max(0.0, 1.0 - t * t));
		vec2 base = uv;
		base.y = clamp(base.y + dir * sag * BAND * 0.12, 0.0, 1.0);

		float spread = t * t * 0.0016;
		vec3 col;
		col.r = texture2D(uScene, clamp(base + vec2(0.0, spread * dir), 0.0, 1.0)).r;
		col.g = texture2D(uScene, base).g;
		col.b = texture2D(uScene, clamp(base - vec2(0.0, spread * dir), 0.0, 1.0)).b;

		// 边缘压一点点暗，读起来像一片玻璃的厚度
		col *= 1.0 - 0.16 * t * t;

		gl_FragColor = vec4(col, 1.0);
	}
`;
const easeExpoOut = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

const fontVar = (name: string, fallback: string) => {
	const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
	return v || fallback;
};

class GlassGrid {
	host: HTMLElement;
	canvas: HTMLCanvasElement;
	items: GlassItem[];
	renderer: THREE.WebGLRenderer;
	scene = new THREE.Scene();
	camera: THREE.PerspectiveCamera;
	world = new THREE.Group();
	tiles: Tile[] = [];
	rt!: THREE.WebGLRenderTarget;
	postScene = new THREE.Scene();
	postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
	postMat!: THREE.ShaderMaterial;
	raycaster = new THREE.Raycaster();
	pointer = new THREE.Vector2(-10, -10);
	pointerActive = false;
	hovered = -1;
	offset = 0;
	target = 0;
	maxScroll = 0;
	vw = 0;
	vh = 0;
	dpr = 1;
	cols = 3;
	tileW = 0;
	tileH = 0;
	startTime = performance.now();
	last = performance.now();
	raf = 0;
	alive = true;
	drag: { id: number; x: number; y: number; lastY: number; vy: number; moved: number; path: number; t: number } | null =
		null;
	bubble: HTMLElement | null;
	hint: HTMLElement | null;
	sans: string;
	editorial: string;
	ac: AbortController;
	lightbox: HTMLElement | null = null;

	constructor(host: HTMLElement) {
		this.host = host;
		this.canvas = host.querySelector<HTMLCanvasElement>('[data-gg-canvas]')!;
		this.bubble = host.querySelector<HTMLElement>('[data-gg-bubble]');
		this.hint = host.querySelector<HTMLElement>('[data-gg-hint]');
		const raw = host.querySelector<HTMLScriptElement>('[data-gg-items]')?.textContent ?? '[]';
		this.items = JSON.parse(raw) as GlassItem[];

		this.sans = fontVar('--font-sans', 'system-ui');
		this.editorial = fontVar('--font-editorial', this.sans);

		this.renderer = new THREE.WebGLRenderer({
			canvas: this.canvas,
			antialias: true,
			alpha: false,
			powerPreference: 'high-performance',
		});
		this.renderer.setClearColor(0x0c0c0d, 1);
		// 画面里没有真实光照，全链路按 sRGB 数值直接算，不做线性转换
		this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

		this.camera = new THREE.PerspectiveCamera(35, 1, 1, 20000);
		this.scene.background = new THREE.Color(0x0c0c0d);
		this.scene.add(this.world);

		this.ac = new AbortController();
		this.buildPost();
		this.resize();
		this.build();

		window.addEventListener('resize', this.onResize, { signal: this.ac.signal });
		window.addEventListener('pointermove', this.onPointerMove, { signal: this.ac.signal, passive: true });
		window.addEventListener('scroll', this.onScroll, { signal: this.ac.signal, passive: true });
		this.canvas.addEventListener('click', this.onClick, { signal: this.ac.signal });
		document.addEventListener('visibilitychange', this.onVisibility, { signal: this.ac.signal });
		document.addEventListener('keydown', this.onKey, { signal: this.ac.signal });

		this.target = window.scrollY;
		this.loop();
	}

	/* ---------------- 尺寸与排版 ---------------- */

	resizeTimer = 0;

	onResize = () => {
		window.clearTimeout(this.resizeTimer);
		this.resizeTimer = window.setTimeout(() => {
			this.resize();
			if (this.tiles.length) this.buildHeadline();
		}, 140);
	};

	resize() {
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const wasMobile = this.cols;
		this.vw = vw;
		this.vh = vh;
		this.dpr = Math.min(window.devicePixelRatio || 1, 2);
		this.cols = vw > 1024 ? 3 : vw > 640 ? 2 : 1;

		this.renderer.setPixelRatio(this.dpr);
		this.renderer.setSize(vw, vh, false);
		this.canvas.style.width = `${vw}px`;
		this.canvas.style.height = `${vh}px`;

		// 相机摆位：让 z=0 平面上 1 单位正好 1 像素
		const half = THREE.MathUtils.degToRad(35 / 2);
		const dist = vh / 2 / Math.tan(half);
		this.camera.fov = 35;
		this.camera.aspect = vw / vh;
		this.camera.position.set(vw / 2, -vh / 2, dist);
		this.camera.lookAt(vw / 2, -vh / 2, 0);
		this.camera.updateProjectionMatrix();

		this.rt?.dispose();
		this.rt = new THREE.WebGLRenderTarget(Math.max(2, Math.round(vw * this.dpr)), Math.max(2, Math.round(vh * this.dpr)), {
			samples: 4,
			depthBuffer: true,
		});
		if (this.postMat) {
			this.postMat.uniforms.uScene.value = this.rt.texture;
			this.postMat.uniforms.uRes.value.set(vw, vh);
		}

		if (this.tiles.length) this.layout();
		void wasMobile;
	}

	/* ---------------- 场景构建 ---------------- */

	buildPost() {
		this.postMat = new THREE.ShaderMaterial({
			vertexShader: TILE_VS,
			fragmentShader: POST_FS,
			uniforms: {
				uScene: { value: null },
				uRes: { value: new THREE.Vector2(1, 1) },
			},
			depthTest: false,
			depthWrite: false,
		});
		this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat));
	}

	build() {
		const headTop = this.vw <= 640 ? 128 : HEAD_TOP;
		this.headTop = headTop;

		for (const item of this.items) {
			const mediaMat = new THREE.ShaderMaterial({
				vertexShader: TILE_VS,
				fragmentShader: TILE_FS,
				uniforms: {
					uStill: { value: null },
					uVideo: { value: null },
					uMix: { value: 0 },
					uReveal: { value: 0 },
					uTime: { value: 0 },
					uPlaneAR: { value: 16 / 9 },
					uMediaAR: { value: item.ar ?? 16 / 9 },
					uZoom: { value: 0 },
				},
			});
			const media = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mediaMat);
			media.position.z = 0;

			const chipMat = new THREE.ShaderMaterial({
				vertexShader: TILE_VS,
				fragmentShader: CHIP_FS,
				transparent: true,
				depthTest: false,
				depthWrite: false,
				uniforms: {
					uStill: { value: null },
					uLabel: { value: null },
					uOpacity: { value: 0 },
					uSize: { value: new THREE.Vector2(64, 24) },
					uPlaneAR: { value: 16 / 9 },
					uMediaAR: { value: item.ar ?? 16 / 9 },
					uInk: { value: new THREE.Color(0xededeb) },
				},
			});
			const chip = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), chipMat);
			chip.position.z = 1;

			const labelMat = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false });
			const label = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), labelMat);
			label.position.z = 1;

			const group = new THREE.Group();
			group.add(media, chip, label);
			this.world.add(group);

			const col = this.tiles.length % 12;
			this.tiles.push({
				item,
				group,
				media,
				chip,
				label,
				mediaMat,
				chipMat,
				labelMat,
				reveal: 0,
				revealTarget: 0,
				mix: 0,
				mixTarget: 0,
				hover: 0,
				hoverTarget: 0,
				enter: 0,
				delay: 0.35 + 0.08 * (col % 3) + 0.06 * Math.floor(col / 3),
				loaded: false,
				tex: null,
				videoEl: null,
				videoTex: null,
				baseX: 0,
				baseY: 0,
				col: 0,
				row: 0,
			});
		}

		this.layout();
		this.buildHeadline();
	}

	headTop = HEAD_TOP;

	/** 按当前视口重排所有 tile，并算出可滚动高度 */
	layout() {
		const cols = this.cols;
		const tileW = (this.vw - PAD * 2 - GAP * (cols - 1)) / cols;
		const tileH = (tileW * 9) / 16;
		this.tileW = tileW;
		this.tileH = tileH;

		const headTop = this.vw <= 640 ? 128 : HEAD_TOP;
		this.headTop = headTop;
		const gridTop = headTop + HEAD_TO_GRID;

		this.tiles.forEach((t, i) => {
			const col = i % cols;
			const row = Math.floor(i / cols);
			t.col = col;
			t.row = row;
			t.delay = 0.35 + 0.08 * col + 0.06 * row;

			const x = PAD + col * (tileW + GAP) + tileW / 2;
			const y = -(gridTop + row * (tileH + ROW_GAP) + tileH / 2);
			t.baseX = x;
			t.baseY = y;

			t.group.position.set(x, y, 0);
			t.media.scale.set(tileW, tileH, 1);
			t.mediaMat.uniforms.uPlaneAR.value = tileW / tileH;

			// 角标：左上角内缩 8px
			this.sizeChip(t);

			// 标题在图片下方 12px（块高 40：12 + 标题 + 6 + 日期）
			const labelH = 40;
			t.label.scale.set(tileW, labelH, 1);
			t.label.position.set(0, -tileH / 2 - 12 - labelH / 2, 1);
		});

		const rows = Math.ceil(this.tiles.length / cols);
		const pageH = headTop + HEAD_TO_GRID + rows * tileH + Math.max(0, rows - 1) * ROW_GAP + 240;
		this.maxScroll = Math.max(0, pageH - this.vh);
		this.target = THREE.MathUtils.clamp(this.target, 0, this.maxScroll);
		this.offset = Math.min(this.offset, this.maxScroll);

		// 撑开文档流：画布是 fixed 的，页面高度全靠这块占位，滚到底之后才是页脚
		const spacer = this.host.parentElement?.querySelector<HTMLElement>('[data-gg-spacer]');
		if (spacer) spacer.style.height = `${pageH}px`;

		// 重排后重绘文字（宽度变了）
		this.tiles.forEach((t) => this.drawLabel(t));
	}

	/** 角标尺寸随文字长度变化：量一遍 canvas 再定 plane 大小 */
	sizeChip(t: Tile) {
		const dpr = Math.min(this.dpr, 2);
		const padX = 8;
		const h = 24;
		const font = `500 ${12 * dpr}px ${this.sans}, system-ui, sans-serif`;
		const c = document.createElement('canvas');
		const ctx = c.getContext('2d')!;
		ctx.font = font;
		const text = t.item.label;
		const w = Math.ceil(ctx.measureText(text).width / dpr) + padX * 2;

		c.width = Math.ceil(w * dpr);
		c.height = Math.ceil(h * dpr);
		const g = c.getContext('2d')!;
		g.scale(dpr, dpr);
		g.fillStyle = '#ededeb';
		g.font = `500 12px ${this.sans}, system-ui, sans-serif`;
		g.textBaseline = 'middle';
		g.fillText(text, padX, h / 2 + 0.5);

		const tex = new THREE.CanvasTexture(c);
		tex.minFilter = THREE.LinearFilter;
		tex.magFilter = THREE.LinearFilter;
		tex.generateMipmaps = false;

		const old = t.chipMat.uniforms.uLabel.value as THREE.Texture | null;
		old?.dispose();
		t.chipMat.uniforms.uLabel.value = tex;
		t.chipMat.uniforms.uSize.value.set(w, h);

		t.chip.scale.set(w, h, 1);
		t.chip.position.set(-this.tileW / 2 + 8 + w / 2, this.tileH / 2 - 8 - h / 2, 1);
	}

	/** 图片下方的两行小字：标题 + 日期 */
	drawLabel(t: Tile) {
		const dpr = Math.min(this.dpr, 2);
		const w = Math.ceil(this.tileW);
		const h = 40;
		const c = document.createElement('canvas');
		c.width = Math.ceil(w * dpr);
		c.height = Math.ceil(h * dpr);
		const g = c.getContext('2d')!;
		g.scale(dpr, dpr);
		g.textBaseline = 'alphabetic';

		g.fillStyle = '#ededeb';
		g.font = `500 12px ${this.sans}, system-ui, sans-serif`;
		const title = t.item.title.length > 26 ? `${t.item.title.slice(0, 25)}…` : t.item.title;
		g.fillText(title, 0, 15);

		g.fillStyle = '#8a8a88';
		g.font = `400 13px ${this.editorial}, Georgia, serif`;
		g.fillText(t.item.meta, 0, 35);

		const tex = new THREE.CanvasTexture(c);
		tex.minFilter = THREE.LinearFilter;
		tex.magFilter = THREE.LinearFilter;
		tex.generateMipmaps = false;
		tex.colorSpace = THREE.NoColorSpace;

		t.labelMat.map?.dispose();
		t.labelMat.map = tex;
		t.labelMat.needsUpdate = true;
	}

	headline: THREE.Mesh | null = null;

	buildHeadline() {
		this.headline?.removeFromParent();
		const w = Math.min(this.vw - PAD * 2, 1200);
		const dpr = Math.min(this.dpr, 2);
		const c = document.createElement('canvas');
		c.width = Math.ceil(w * dpr);
		c.height = Math.ceil(120 * dpr);
		const g = c.getContext('2d')!;
		g.scale(dpr, dpr);

		const big = this.vw <= 640 ? 34 : 46;
		g.fillStyle = '#ededeb';
		g.font = `400 ${big}px ${this.editorial}, 'Noto Serif SC', Georgia, serif`;
		g.textBaseline = 'alphabetic';
		g.textAlign = 'center';
		g.fillText('照片墙', w / 2, big + 6);

		g.fillStyle = '#8a8a88';
		g.font = `500 11px ${this.sans}, system-ui, sans-serif`;
		const meta = `A WALL OF MOMENTS · ${String(this.items.length).padStart(2, '0')} FRAMES`;
		g.fillText(meta.split('').join('\u2009'), w / 2, big + 40);

		const tex = new THREE.CanvasTexture(c);
		tex.minFilter = THREE.LinearFilter;
		tex.generateMipmaps = false;

		const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
		const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, 120), mat);
		const top = this.vw <= 640 ? 128 : HEAD_TOP;
		mesh.position.set(this.vw / 2, -(top + 30), 2);
		this.scene.add(mesh);
		this.headline = mesh;
	}

	/* ---------------- 媒体加载 ---------------- */

	ensureMedia(t: Tile) {
		if (t.loaded) return;
		t.loaded = true;

		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.decoding = 'async';
		img.onload = () => {
			const tex = new THREE.Texture(img);
			tex.colorSpace = THREE.NoColorSpace;
			tex.minFilter = THREE.LinearFilter;
			tex.magFilter = THREE.LinearFilter;
			tex.generateMipmaps = false;
			tex.needsUpdate = true;
			t.tex = tex;
			t.mediaMat.uniforms.uStill.value = tex;
			t.chipMat.uniforms.uStill.value = tex;
			t.mediaMat.uniforms.uMediaAR.value = img.naturalWidth / img.naturalHeight;
			t.chipMat.uniforms.uMediaAR.value = img.naturalWidth / img.naturalHeight;
			t.revealTarget = 1;
		};
		img.src = t.item.src;

		// 有视频才走视频管线：先定位到 30% 处当静帧，悬停时再播
		if (t.item.video) {
			const v = document.createElement('video');
			v.crossOrigin = 'anonymous';
			v.muted = true;
			v.loop = true;
			v.playsInline = true;
			v.setAttribute('playsinline', '');
			v.setAttribute('webkit-playsinline', '');
			v.preload = 'auto';
			v.src = t.item.video;
			v.addEventListener('loadedmetadata', () => {
				v.currentTime = Math.min(1.2, (v.duration || 4) * 0.3);
			});
			const vt = new THREE.VideoTexture(v);
			vt.minFilter = THREE.LinearFilter;
			vt.generateMipmaps = false;
			t.videoEl = v;
			t.videoTex = vt;
			t.mediaMat.uniforms.uVideo.value = vt;
		}
	}

	/* ---------------- 交互 ---------------- */

	onScroll = () => {
		this.target = window.scrollY;
		if (window.scrollY > 24) this.hideHint();
	};

	onClick = (e: MouseEvent) => {
		if (this.lightbox?.classList.contains('is-open')) return;
		const i = this.hitTest(e.clientX, e.clientY);
		if (i >= 0) this.openLightbox(i);
	};

	onPointerMove = (e: PointerEvent) => {
		// 触摸没有真正的 hover，别把气泡留在屏幕上
		if (e.pointerType === 'touch') {
			this.pointerActive = false;
			this.bubble?.classList.remove('is-on');
			return;
		}
		this.pointer.set(e.clientX, e.clientY);
		this.pointerActive = true;
		this.bubble?.style.setProperty('--x', `${e.clientX}px`);
		this.bubble?.style.setProperty('--y', `${e.clientY}px`);
	};

	onKey = (e: KeyboardEvent) => {
		if (e.key === 'Escape') this.closeLightbox();
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

	hideHint() {
		this.hint?.classList.add('is-hidden');
	}

	/** 屏幕坐标 → tile 索引：直接用相机投影算，省掉 raycast 的矩阵开销 */
	hitTest(x: number, y: number) {
		// 屏幕 y 向下为正，世界 y 向上为正：Y = -screenY - offset
		const wx = x;
		const wy = -y - this.offset;
		for (let i = 0; i < this.tiles.length; i++) {
			const t = this.tiles[i];
			if (
				wx >= t.baseX - this.tileW / 2 &&
				wx <= t.baseX + this.tileW / 2 &&
				wy >= t.baseY - this.tileH / 2 &&
				wy <= t.baseY + this.tileH / 2
			) {
				return i;
			}
		}
		return -1;
	}

	openLightbox(i: number) {
		const t = this.tiles[i];
		if (!t) return;
		this.lightbox ??= this.buildLightbox();
		const lb = this.lightbox!;
		const img = lb.querySelector<HTMLImageElement>('[data-gg-lb-img]')!;
		const title = lb.querySelector<HTMLElement>('[data-gg-lb-title]')!;
		const meta = lb.querySelector<HTMLElement>('[data-gg-lb-meta]')!;
		img.src = t.item.big;
		img.alt = t.item.alt;
		title.textContent = t.item.title;
		meta.textContent = t.item.meta;
		lb.classList.add('is-open');
		lb.setAttribute('aria-hidden', 'false');
		this.lockScroll();
		lb.querySelector<HTMLElement>('[data-gg-lb-close]')?.focus({ preventScroll: true });
	}

	closeLightbox() {
		if (!this.lightbox?.classList.contains('is-open')) return;
		this.lightbox.classList.remove('is-open');
		this.lightbox.setAttribute('aria-hidden', 'true');
		this.lightbox.querySelector<HTMLImageElement>('[data-gg-lb-img]')?.removeAttribute('src');
		this.unlockScroll();
		this.canvas.focus({ preventScroll: true });
	}

	/* 灯箱打开时锁住页面滚动，并补上滚动条宽度，避免整页横向抖一下 */
	lockScroll() {
		const bar = window.innerWidth - document.documentElement.clientWidth;
		document.documentElement.style.overflow = 'hidden';
		document.body.style.overflow = 'hidden';
		if (bar > 0) document.body.style.paddingRight = `${bar}px`;
	}

	unlockScroll() {
		document.documentElement.style.removeProperty('overflow');
		document.body.style.removeProperty('overflow');
		document.body.style.removeProperty('padding-right');
	}

	buildLightbox() {
		const el = document.createElement('div');
		el.className = 'gg-lb';
		el.setAttribute('aria-hidden', 'true');
		el.setAttribute('role', 'dialog');
		el.setAttribute('aria-label', '照片大图');
		el.innerHTML = `
			<button class="gg-lb__close" type="button" data-gg-lb-close aria-label="关闭">关闭</button>
			<figure class="gg-lb__figure">
				<img data-gg-lb-img alt="" loading="lazy" />
				<figcaption><strong data-gg-lb-title></strong><span data-gg-lb-meta></span></figcaption>
			</figure>`;
		this.host.appendChild(el);
		el.addEventListener('click', (e) => {
			const target = e.target as Element;
			if (target.closest('[data-gg-lb-close]') || target === el) this.closeLightbox();
		});
		return el;
	}

	/* ---------------- 每帧 ---------------- */

	loop = () => {
		if (!this.alive) return;
		this.raf = requestAnimationFrame(this.loop);

		const now = performance.now();
		const dt = Math.min(0.05, (now - this.last) / 1000);
		this.last = now;
		const time = (now - this.startTime) / 1000;

		// 滚动缓动：每帧 0.12，按 dt 归一到 60fps
		const k = 1 - Math.pow(1 - 0.12, dt * 60);
		this.offset += (this.target - this.offset) * k;
		if (Math.abs(this.target - this.offset) < 0.05) this.offset = this.target;
		this.world.position.y = this.offset;
		if (this.headline) this.headline.position.y = -(this.headTop + 30) + this.offset;

		// 网格滚完之后把整层让出来，否则固定画布会盖住页脚
		const over = Math.max(0, this.target - this.maxScroll);
		const away = THREE.MathUtils.clamp(1 - over / 180, 0, 1);
		this.host.style.opacity = String(away);
		this.host.style.pointerEvents = away < 0.6 ? 'none' : '';

		// 命中测试：每帧一次，不做逐 mousemove 的乱序计算
		const hoveringUI = !!this.lightbox?.classList.contains('is-open') || !this.pointerActive;
		const hit = hoveringUI ? -1 : this.hitTest(this.pointer.x, this.pointer.y);
		if (hit !== this.hovered) {
			this.hovered = hit;
			this.canvas.style.cursor = hit >= 0 ? 'pointer' : 'grab';
			if (this.bubble) {
				this.bubble.classList.toggle('is-on', hit >= 0);
				this.bubble.style.setProperty('--x', `${this.pointer.x}px`);
				this.bubble.style.setProperty('--y', `${this.pointer.y}px`);
			}
		}

		const enterT = Math.min(1, Math.max(0, (time - 0.1) / 1.2));

		this.tiles.forEach((t, i) => {
			// 进场：按行列错开，位移 60px + 淡入
			const p = THREE.MathUtils.clamp((enterT - t.delay * 0.35) / 0.65, 0, 1);
			t.enter = easeExpoOut(p);
			const rise = (1 - t.enter) * 60;
			t.group.position.y = t.baseY + rise;

			// 进场后再加载媒体（首屏优先）
			if (t.enter > 0.35 && !t.loaded) {
				const top = t.baseY - this.offset;
				if (top > -this.vh * 1.6 && top < this.vh * 2.2) this.ensureMedia(t);
			}

			const isHover = i === this.hovered;
			t.hoverTarget = isHover ? 1 : 0;
			t.hover += (t.hoverTarget - t.hover) * (1 - Math.pow(1 - 0.18, dt * 60));
			t.mixTarget = isHover && t.videoEl ? 1 : 0;
			t.mix += (t.mixTarget - t.mix) * (1 - Math.pow(1 - 0.2, dt * 60));

			// 无视频时的「呼吸」：缓慢推近 4%
			const zoom = t.videoEl ? t.hover * 0.02 : t.hover * 0.04;
			t.mediaMat.uniforms.uZoom.value = zoom;
			t.mediaMat.uniforms.uMix.value = t.mix;
			t.mediaMat.uniforms.uTime.value = time;
			t.mediaMat.uniforms.uReveal.value += (t.revealTarget - t.mediaMat.uniforms.uReveal.value) * k;
			t.chipMat.uniforms.uOpacity.value = t.enter * 0.96;
			t.labelMat.opacity = t.enter;

			if (t.videoEl) {
				if (isHover && t.videoEl.paused) void t.videoEl.play().catch(() => {});
				else if (!isHover && !t.videoEl.paused) t.videoEl.pause();
			}

			// 悬停轻微放大
			const s = 1 + t.hover * 0.012;
			t.group.scale.setScalar(s);
		});

		this.renderer.setRenderTarget(this.rt);
		this.renderer.clear();
		this.renderer.render(this.scene, this.camera);
		this.renderer.setRenderTarget(null);
		this.renderer.render(this.postScene, this.postCam);
	};

	dispose() {
		this.alive = false;
		cancelAnimationFrame(this.raf);
		this.ac.abort();
		this.tiles.forEach((t) => {
			t.tex?.dispose();
			t.videoTex?.dispose();
			t.videoEl?.pause();
			t.mediaMat.dispose();
			t.chipMat.dispose();
			t.labelMat.map?.dispose();
			t.labelMat.dispose();
			t.group.clear();
		});
		this.rt?.dispose();
		this.postMat.dispose();
		this.renderer.dispose();
	}
}

const registry = new WeakMap<HTMLElement, GlassGrid>();

async function start() {
	const hosts = Array.from(document.querySelectorAll<HTMLElement>('[data-glass-grid]'));
	if (!hosts.length) return;

	// 文字全都画在 canvas 上，必须等字体到位，否则会先渲染一版系统字再跳
	try {
		await document.fonts.ready;
	} catch {
		/* 字体 API 不可用时照常跑，只是字形回退 */
	}

	for (const host of hosts) {
		if (registry.has(host)) continue;
		const grid = new GlassGrid(host);
		registry.set(host, grid);
		host.dataset.ggReady = '1';
	}
}

export function initGlassGrid() {
	void start();
	document.addEventListener('astro:before-swap', () => {
		document.querySelectorAll<HTMLElement>('[data-glass-grid]').forEach((host) => {
			registry.get(host)?.dispose();
			registry.delete(host);
		});
	});
}
