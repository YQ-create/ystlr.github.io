/// <reference types="astro/client" />

// 全站挂到 window 上的自定义函数，由 BaseHead 内联脚本定义。
interface Window {
	__getTheme?: () => string;
}
