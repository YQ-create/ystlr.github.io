/**
 * SeaSky — 首页首屏的黄昏海景背景（原生 WebGL2，单 pass 全屏着色器）。
 *
 * 画面分三段纵向结构：
 *   · 天空 —— 地平线暖橙 → 玫瑰粉 → 紫 → 深靛的渐变，配两层不同速度的层云，
 *            云的底色随高度变化（云底被落日从下方照亮，云顶偏暗紫）；
 *   · 海面 —— 透视波纹（三组正弦 + fBm 细节），反射按「近处映天顶、远处映地平线」
 *            取天空色，落日在水面带出一条被波纹切碎的金色倒影；
 *   · 地平线 —— 一层窄的暖雾把海天缝起来，避免出现一条硬边。
 *
 * 时间只有两个量级：云层漂移（几十秒）与日落余晖的呼吸（约 140s 一个周期），
 * 所以整体是「缓慢变化」，不会抢文字的注意力。
 *
 * 性能：整屏只有一个全屏 quad，30fps 上限；滚过首屏后整层淡出并停帧，
 * 标签页隐藏时也会停。
 */

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `#version 300 es
precision highp float;

out vec4 fragColor;

uniform vec2  uRes;
uniform float uTime;
uniform vec2  uMouse;    // -1..1，已缓动
uniform float uHorizon;  // 地平线高度（uv.y，0 在底）
uniform float uSunX;     // 落日中心（uv.x）
uniform float uLight;    // 0 = 深色主题，1 = 浅色主题
uniform float uGain;     // 整体曝光（竖屏和小屏略提亮）

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm4(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(13.7, 7.3);
    a *= 0.5;
  }
  return s * 1.0667;
}

float fbm5(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = p * 2.02 + vec2(9.1, 17.3);
    a *= 0.5;
  }
  return s * 1.0323;
}

// a: 0 = 地平线，1 = 天顶
vec3 skyGradient(float a, float t) {
  float warm = 0.5 + 0.5 * sin(t * 0.045);
  warm = pow(warm, 1.5);

  // 亮带压在地平线附近，往上迅速转深：文字主要落在中高空
  vec3 c0 = mix(vec3(0.80, 0.46, 0.30), vec3(1.00, 0.70, 0.40), warm);
  vec3 c1 = mix(vec3(0.55, 0.26, 0.34), vec3(0.96, 0.46, 0.44), warm);
  vec3 c2 = vec3(0.200, 0.155, 0.285);
  vec3 c3 = mix(vec3(0.052, 0.062, 0.128), vec3(0.072, 0.085, 0.152), warm);

  vec3 c = mix(c0, c1, smoothstep(0.0, 0.075, a));
  c = mix(c, c2, smoothstep(0.055, 0.26, a));
  c = mix(c, c3, smoothstep(0.24, 0.68, a));
  return c;
}

// p: 居中坐标（x 已按 aspect 修正）
float cloudDensity(vec2 p, float a, float t) {
  vec2 q = vec2(p.x * 0.70, a * 3.2);
  q.x += t * 0.0105;                                  // 整体缓慢东移
  float n1 = fbm5(q * 1.65 + vec2(0.0, -t * 0.011));
  float n2 = fbm4(q * 3.85 + vec2(-t * 0.021, t * 0.006)); // 第二层反向，制造变形
  float n = n1 * 0.74 + n2 * 0.40;
  float d = smoothstep(0.455, 0.615, n);
  // 高层再压一层极薄的卷云，拉开层次
  float hi = fbm4(vec2(q.x * 0.62 + t * 0.006, q.y * 1.5));
  d = max(d, smoothstep(0.54, 0.74, hi) * smoothstep(0.20, 0.70, a) * 0.6);
  d *= smoothstep(0.008, 0.10, a);                    // 贴近地平线化成雾
  d *= 1.0 - smoothstep(0.34, 0.70, a) * 0.95;        // 天顶留白
  return d;
}

// 云不是「贴在天空上的另一块颜色」，而是天空本身的一层厚薄：
// 以天空色为底，低处云底吃落日、云芯稍暗，保证不会出现突兀的黑块。
vec3 cloudColor(vec3 sky, float a, float dens, float t) {
  float warm = 0.5 + 0.5 * sin(t * 0.045);
  warm = pow(warm, 1.5);
  vec3 lit = mix(vec3(0.74, 0.40, 0.34), vec3(1.00, 0.70, 0.48), warm);
  float low = 1.0 - smoothstep(0.02, 0.42, a);        // 低处的云底受光
  vec3 c = mix(sky * 0.60, lit, low * 0.86);
  c = mix(c, c * 0.70, smoothstep(0.55, 1.0, dens) * 0.5); // 云芯稍暗
  return c;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  // 竖屏也按接近 1:1 的横向尺度取样，否则云会被压成一整条没有形状的横带
  float ax = max(aspect, 1.3);
  vec2 p = vec2((uv.x - 0.5) * ax, uv.y);
  float t = uTime;
  float h = uHorizon;
  float y = uv.y;

  float sunC = (uSunX - 0.5) * ax + uMouse.x * 0.012;
  vec3 col;

  if (y > h) {
    float a = clamp((y - h) / (1.0 - h), 0.0, 1.0);
    col = skyGradient(a, t);

    // 落日余晖：宽光晕 + 内核，落在云层后面
    float sd = length(vec2(p.x - sunC, (y - h) * 0.92));
    float glow = exp(-sd * 7.0) * 0.50 + exp(-sd * 19.0) * 0.32 + exp(-sd * 48.0) * 0.16;
    col += vec3(1.0, 0.66, 0.40) * glow * 0.55;

    // 云：密度决定覆盖，云底额外吃一层落日的边光
    float d = cloudDensity(p, a, t);
    if (d > 0.002) {
      vec3 cc = cloudColor(col, a, d, t);
      float lit = exp(-length(vec2(p.x - sunC, a * 1.9)) * 3.2);
      cc += vec3(1.0, 0.56, 0.34) * lit * 0.30;
      col = mix(col, cc, d * 0.92);
    }
  } else {
    float below = max(h - y, 0.0);

    // 透视：越靠近地平线越远，屏幕上的「距离」按 1/below 压缩
    float persp = 1.0 / (below * 0.60 + 0.035);
    float px = p.x * persp * 0.40;

    float chop = fbm4(vec2(px * 2.6, persp * 1.9) + vec2(t * 0.08, -t * 0.14)) - 0.5;
    // 用噪声扰动相位，打散正弦的规则条纹，让波纹长得像水而不是百叶窗
    float w1 = sin(persp * 3.4 + chop * 4.2 + t * 0.85);
    float w2 = sin(persp * 8.2 - px * 0.85 + chop * 6.0 + t * 1.30);
    float w3 = sin(persp * 19.0 + px * 1.80 + chop * 7.5 - t * 1.95);
    float w4 = sin(persp * 41.0 - px * 3.20 + chop * 9.0 + t * 2.60);   // 近处的细碎小波
    float wave = w1 * 0.44 + w2 * 0.26 + w3 * 0.16 + w4 * 0.07 + chop * 1.35;

    float near = smoothstep(0.0, 0.030, below);          // 地平线处把高频抹平
    float far = 1.0 - smoothstep(0.12, 0.68, below) * 0.18;
    float surface = wave * near * far;

    // 水面扰动的是「倒影」而不是自身亮度：把波纹叠加到反射的采样高度上
    float ra = clamp(below * 1.60 + 0.05, 0.0, 0.95);
    vec3 refl = skyGradient(clamp(ra + surface * 0.055, 0.0, 1.0), t);

    // 水体会吃掉一部分反射的饱和度：倒影不是镜面复制，而是被压暗、偏冷
    float lum = dot(refl, vec3(0.299, 0.587, 0.114));
    vec3 seaRefl = mix(vec3(lum * 0.94, lum * 1.02, lum * 1.16), refl, 0.60) * 0.86;

    vec3 deep = vec3(0.115, 0.150, 0.190);
    float fres = mix(0.50, 0.95, 1.0 - smoothstep(0.0, 0.30, below));
    col = mix(deep, seaRefl, fres);
    col *= 1.0 + surface * 0.22;                          // 波面倾斜带来的明暗起伏
    float crest = smoothstep(0.55, 1.0, surface);         // 波峰上炸开一点天光
    col += seaRefl * crest * 0.22;

    // 落日在水面拉出的金色倒影带
    float bw = 0.042 + below * 0.40;
    float dxb = (p.x - sunC) / bw;
    float band = exp(-dxb * dxb);
    float glint = pow(min(surface * 0.55 + 0.55, 1.0), 5.0);
    col += vec3(1.0, 0.62, 0.36) * band * (0.07 + glint * 0.34) * smoothstep(0.0, 0.04, below);

    // 近处压暗，托住底部的索引条
    col *= mix(1.0, 0.88, 1.0 - smoothstep(0.0, 0.42, y));
  }

  // 地平线：窄暖雾 + 宽柔光，把海天缝起来
  float dh = abs(y - h);
  col = mix(col, vec3(1.0, 0.74, 0.52), exp(-dh * 58.0) * 0.46);
  col = mix(col, vec3(1.0, 0.62, 0.42), exp(-dh * 16.0) * 0.14);

  // 顶部压暗：只在最上面收一点，页头压得住就行
  col *= mix(1.0, 0.74, smoothstep(0.78, 1.0, y));

  // 暗角
  vec2 vq = (uv - 0.5) * vec2(aspect * 0.58, 1.0);
  col *= 1.0 - 0.26 * dot(vq, vq);

  // 抖动：压住大面积渐变的色带
  col += (hash21(gl_FragCoord.xy + fract(t) * 137.0) - 0.5) * 0.006;

  // 曝光 / 浅色主题整体提亮
  col *= uGain;
  col = mix(col, col * 1.08 + 0.012, uLight);

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

type Instance = { destroy: () => void };

const instances: Instance[] = [];
let bound = false;
let pageToken = 0;
let mountedToken = -1;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
	const sh = gl.createShader(type);
	if (!sh) return null;
	gl.shaderSource(sh, src);
	gl.compileShader(sh);
	if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
		console.warn('[sea-sky] shader error', gl.getShaderInfoLog(sh));
		gl.deleteShader(sh);
		return null;
	}
	return sh;
}

function setup(root: HTMLElement): Instance | null {
	const canvas = root.querySelector<HTMLCanvasElement>('[data-sea-canvas]');
	if (!canvas) return null;

	const gl = canvas.getContext('webgl2', {
		alpha: false,
		antialias: false,
		depth: false,
		stencil: false,
		powerPreference: 'low-power',
		preserveDrawingBuffer: false,
	});
	if (!gl) {
		root.dataset.seaFallback = '1';
		return null;
	}

	const vs = compile(gl, gl.VERTEX_SHADER, VERT);
	const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
	if (!vs || !fs) return null;
	const program = gl.createProgram()!;
	gl.attachShader(program, vs);
	gl.attachShader(program, fs);
	gl.bindAttribLocation(program, 0, 'aPos');
	gl.linkProgram(program);
	gl.deleteShader(vs);
	gl.deleteShader(fs);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		console.warn('[sea-sky] link error', gl.getProgramInfoLog(program));
		return null;
	}

	// 全屏三角
	const vao = gl.createVertexArray();
	gl.bindVertexArray(vao);
	const buffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
	gl.enableVertexAttribArray(0);
	gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

	gl.useProgram(program);
	const uRes = gl.getUniformLocation(program, 'uRes');
	const uTime = gl.getUniformLocation(program, 'uTime');
	const uMouse = gl.getUniformLocation(program, 'uMouse');
	const uHorizon = gl.getUniformLocation(program, 'uHorizon');
	const uSunX = gl.getUniformLocation(program, 'uSunX');
	const uLight = gl.getUniformLocation(program, 'uLight');
	const uGain = gl.getUniformLocation(program, 'uGain');

	// 首帧就按当前主题上色
	gl.uniform1f(uLight, document.documentElement.dataset.theme === 'light' ? 1 : 0);

	// 竖屏时画面被裁成窄条：横向取样范围放宽，让云还能看出形状；
	// 地平线也压回接近横屏的比例，否则海面只剩一条缝。
	function syncFrame() {
		const portrait = height > width * 1.15;
		const hz = portrait
			? Math.min(Number(root.dataset.horizon) || 0.42, 0.38)
			: Number(root.dataset.horizon) || 0.42;
		const sx = portrait ? 0.5 : Number(root.dataset.sun) || 0.56;
		gl.useProgram(program);
		gl.uniform1f(uHorizon, hz);
		gl.uniform1f(uSunX, sx);
		gl.uniform1f(uGain, portrait ? 1.16 : 1.0);
	}

	const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	// ---- 尺寸：像素预算内取 DPR，别在 4K 上硬跑满分辨率 ----
	let width = 1;
	let height = 1;
	function resize() {
		const rect = root.getBoundingClientRect();
		const w = Math.max(1, Math.round(rect.width || window.innerWidth));
		const hgt = Math.max(1, Math.round(rect.height || window.innerHeight));
		let dpr = Math.min(window.devicePixelRatio || 1, 2);
		const budget = 2_400_000;
		if (w * hgt * dpr * dpr > budget) dpr = Math.max(0.68, Math.sqrt(budget / (w * hgt)));
		width = Math.max(1, Math.round(w * dpr));
		height = Math.max(1, Math.round(hgt * dpr));
		if (canvas.width !== width || canvas.height !== height) {
			canvas.width = width;
			canvas.height = height;
		}
		gl.viewport(0, 0, width, height);
		gl.uniform2f(uRes, width, height);
		syncFrame();
	}
	resize();

	// ---- 鼠标视差：只做很小的位移，别让它变成「跟着鼠标晃」 ----
	const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
	const onPointer = (e: PointerEvent) => {
		mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
		mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
	};

	// ---- 滚动淡出：滚过约 0.75 屏后整层让位给正文 ----
	let fade = 1;
	let alive = true;
	function readFade() {
		const y = window.scrollY;
		// 差不多滚完一屏才退干净：前段慢、后段加速，像画面被内容慢慢盖过去。
		const span = Math.max(320, window.innerHeight * 0.92);
		const k = Math.min(1, Math.max(0, 1 - y / span));
		fade = Math.pow(k, 1.25);
		root.style.opacity = String(Math.round(fade * 1000) / 1000);
		// 让底下的字符光场按互补的不透明度浮现（见 index.astro 的 --sea-fade）
		document.documentElement.style.setProperty('--sea-fade', fade.toFixed(3));
	}

	// ---- 画布主题亮度：主题切换时只改 uniform，不重建上下文 ----
	function syncTheme() {
		const light = document.documentElement.dataset.theme === 'light' ? 1 : 0;
		gl.useProgram(program);
		gl.uniform1f(uLight, light);
		draw(performance.now()); // 停帧状态下也要把新颜色画出来
	}

	const start = performance.now();
	let raf = 0;
	let last = 0;
	let running = false;
	const FRAME = 1000 / 30; // 30fps 足够：画面本身是缓慢的

	function draw(now: number) {
		const elapsed = (now - start) / 1000;
		mouse.x += (mouse.tx - mouse.x) * 0.04;
		mouse.y += (mouse.ty - mouse.y) * 0.04;
		gl.useProgram(program);
		gl.uniform1f(uTime, reduced ? 24 : elapsed);
		gl.uniform2f(uMouse, mouse.x, mouse.y);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
	}

	// 首帧之前在 draw 之外调它会有 TDZ 问题（start 还没初始化），放在这里最稳
	window.addEventListener('sea-sky-theme', syncTheme);

	function loop(now: number) {
		if (!running) return;
		raf = requestAnimationFrame(loop);
		if (now - last < FRAME) return;
		last = now;
		draw(now);
	}

	function syncRunning() {
		// reduced motion：只画一帧静态画面，之后交给 CSS 的透明度过渡
		const want = alive && fade > 0.012 && !document.hidden && !reduced;
		if (want && !running) {
			running = true;
			last = 0;
			raf = requestAnimationFrame(loop);
		} else if (!want && running) {
			running = false;
			cancelAnimationFrame(raf);
		}
	}

	// ---- 事件 ----
	let resizeTimer = 0;
	const onResize = () => {
		window.clearTimeout(resizeTimer);
		resizeTimer = window.setTimeout(() => {
			resize();
			readFade();
			syncRunning();
			if (!reduced) return;
			draw(performance.now());
		}, 140) as unknown as number;
	};
	const onScroll = () => {
		readFade();
		syncRunning();
	};
	const onVisibility = () => syncRunning();

	window.addEventListener('pointermove', onPointer, { passive: true });
	window.addEventListener('scroll', onScroll, { passive: true });
	window.addEventListener('resize', onResize);
	document.addEventListener('visibilitychange', onVisibility);

	readFade();
	syncRunning();
	draw(performance.now()); // 先出一帧，别让首屏空着

	return {
		destroy() {
			alive = false;
			running = false;
			cancelAnimationFrame(raf);
			window.clearTimeout(resizeTimer);
			window.removeEventListener('pointermove', onPointer);
			window.removeEventListener('scroll', onScroll);
			window.removeEventListener('resize', onResize);
			window.removeEventListener('sea-sky-theme', syncTheme);
			document.removeEventListener('visibilitychange', onVisibility);
			document.documentElement.style.removeProperty('--sea-fade');
			gl.deleteBuffer(buffer);
			gl.deleteVertexArray(vao);
			gl.deleteProgram(program);
			gl.getExtension('WEBGL_lose_context')?.loseContext();
		},
	};
}

function mount() {
	if (mountedToken === pageToken) return;
	mountedToken = pageToken;
	for (const item of instances.splice(0)) item.destroy();
	document.querySelectorAll<HTMLElement>('[data-sea-sky]:not([data-sea-ready])').forEach((root) => {
		const instance = setup(root);
		root.dataset.seaReady = '1';
		if (instance) instances.push(instance);
	});
}

function unmount() {
	pageToken += 1;
	for (const item of instances.splice(0)) item.destroy();
	document.querySelectorAll<HTMLElement>('[data-sea-ready]').forEach((root) => {
		delete root.dataset.seaReady;
	});
}

export function mountSeaSky() {
	if (!bound) {
		bound = true;
		document.addEventListener('astro:before-swap', unmount);
		document.addEventListener('astro:page-load', mount);
		// 主题切换：广播一声，各实例只改 uniform，不重建上下文
		new MutationObserver(() => {
			window.dispatchEvent(new Event('sea-sky-theme'));
		}).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
	}
	mount();
}
