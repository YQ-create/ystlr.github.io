// 站点全局信息：改这一处即可同步到页头、页脚、RSS 与 SEO 元信息。

export const SITE_TITLE = 'ystlr';
export const SITE_DESCRIPTION = '一个记录写作、生活与日常思考的个人博客 —— 文字、照片与随笔，慢慢沉淀。';
export const SITE_URL = 'https://ystlr.com';
export const AUTHOR_NAME = 'ystlr';

// ICP 备案号：填了才在页脚显示（例：'京ICP备2026000000号-1'）。留空 = 不显示。
export const ICP_NUMBER = '';

// 首页 Hero 展示文案
export const HERO = {
	role: 'Notes on life & writing',
	title: '在这里记录日常',
	subtitle: '想法与读过的东西',
	tagline: '在这里记录日常、想法与读过的东西',
	tagline2: '把散落的生活片段整理成文字与照片',
};

// 个人资料：改这里即可同步到首页资料卡、关于页名片、页脚。
export const PROFILE = {
	// 头像图片：把图片放进 public/ 目录（如 public/avatar.png），这里填 '/avatar.png'；
	// 留空字符串则显示名字首字母。
	avatar: '',
	role: 'Notes on life & writing',
	bio: '奇奇怪怪',
	topics: ['日常随笔', '阅读笔记', '生活片段', '随想与思考', '照片记录', '慢慢整理'],
};

// 社交链接（留空字符串则在页头隐藏对应入口）
export const SOCIAL_LINKS = {
	github: 'https://github.com/YQ-create',
	x: '',
	email: 'mailto:hello@ystlr.com',
};

// 投稿：访客在 /blog 点「投稿」，会打开 GitHub 的「新建 Issue」页并预填标题/正文，
// 用自己的 GitHub 账号确认提交。管理员在 Issues 里审核通过后转成文章。
//
// 安全约定（重要）：纯静态站没有服务端，任何写进前端代码的 PAT 都会随构建产物
// 一起发给访客，等于公开泄露密钥，可被拿去无限灌 Issue。所以这里刻意不提供
// token 配置项。若将来确实需要「点一下就自动建 Issue」，必须走 Serverless 代理
// 或 GitHub Actions，把密钥放在服务端环境变量里，绝不能出现在客户端代码中。
export const SUBMIT_REPO = {
	owner: 'YQ-create',
	repo: 'ystlr.github.io',
};

/** 是否显示投稿入口。默认关闭；改成 true 即可启用，无需任何密钥。 */
export const SUBMIT_ENABLED = false;

// 发现页链接：名称 + 链接 + 一句话简介，按分类分组。
// 数据在 src/data/discover.json（不是这里）——新增链接请改那个文件，
// 格式见文件内注释。logo 由前端自动抓取该站点 favicon，抓不到回退到首字母。
