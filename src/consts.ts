// 站点全局信息：改这一处即可同步到页头、页脚、RSS 与 SEO 元信息。

export const SITE_TITLE = 'ystlr';
export const SITE_DESCRIPTION = '一个记录写作、生活与日常思考的个人博客 —— 文字、照片与随笔，慢慢沉淀。';
export const SITE_URL = 'https://ystlr.com';
export const AUTHOR_NAME = 'ystlr';

// 首页 Hero 展示文案（占位：替换成你自己的一句话介绍）
export const HERO = {
	role: 'Notes on life & writing',
	tagline: '在这里记录日常、想法与读过的东西',
	tagline2: '把散落的生活片段整理成文字与照片',
};

// 社交链接（留空字符串则在页头隐藏对应入口）
export const SOCIAL_LINKS = {
	github: 'https://github.com/YQ-create',
	x: '',
	email: 'mailto:hello@ystlr.com',
};

// 投稿：访客在 /blog 点「投稿」，会创建一个带「投稿」label 的 GitHub Issue，
// 管理员在 Issues 里审核通过后转成文章。创建 Issue 需要认证（GitHub 不允许匿名），
// 所以这里需要一个专用机器人的 PAT——只勾「这个仓库的 Issues 写入」权限，别给代码权限。
//
// 生成步骤：GitHub → Settings → Developer settings → Personal access tokens →
// Fine-grained tokens → 新建 → Repository access 只选 YQ-create/ystlr.github.io →
// Permissions → Repository permissions → Issues = Read and write（其余全部 No access）。
// 生成后把 github_pat_… 填到 SUBMIT_TOKEN；留空则整站不显示投稿按钮。
export const SUBMIT_REPO = {
	owner: 'YQ-create',
	repo: 'ystlr.github.io',
};

// TODO(你)：去 GitHub 生成一个「仅 Issues 写权限」的 Fine-grained PAT，替换下面这行。
// 不填 = 关闭投稿入口。
export const SUBMIT_TOKEN = '';

// 发现页链接：名称 + 链接 + 一句话简介，按分类分组。
// 数据在 src/data/discover.json（不是这里）——新增链接请改那个文件，
// 格式见文件内注释。logo 由前端自动抓取该站点 favicon，抓不到回退到首字母。
