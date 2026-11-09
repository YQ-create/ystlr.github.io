/// <reference types="astro/client" />

// 全站挂到 window 上的自定义函数，由 BaseHead 内联脚本定义。
interface Window {
	__getTheme?: () => string;
	/** BaseHead 内联脚本：按 localStorage 里的外观偏好重刷 html 属性与变量 */
	__syncAppearance?: () => void;
}
