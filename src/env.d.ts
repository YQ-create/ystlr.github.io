/// <reference types="astro/client" />

// 全站挂到 window 上的自定义函数（主题 / 强调色切换），由 BaseHead 内联脚本定义。
interface Window {
	__setTheme?: (theme: string) => void;
	__getTheme?: () => string;
	__setAccent?: (accent: string) => void;
	__getAccent?: () => string;
}
