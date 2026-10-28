// GitHub REST 客户端：管理后台的“后端”。
//
// 站点是纯静态的，没有服务端，所以所有写操作都由浏览器带着用户自己粘贴的
// Fine-grained PAT 直接打 https://api.github.com。Token 不落盘、不进提交内容，
// 只由 app.ts 放在 sessionStorage 里。
//
// 约定：所有请求都带 Authorization / Accept / X-GitHub-Api-Version；
// 非 2xx 一律抛 GitHubError，message 是可以直接展示给用户的中文，
// status === 0 表示请求没到 GitHub（断网、CORS、响应无法解析）。

export type Repo = { owner: string; repo: string; branch: string };

export class GitHubError extends Error {
	/** HTTP 状态码；0 表示本地/网络层错误，没有拿到 GitHub 的响应 */
	status: number;

	constructor(status: number, message: string) {
		super(message);
		this.name = 'GitHubError';
		this.status = status;
	}
}

const API_BASE = 'https://api.github.com';

// ---------------------------------------------------------------- base64

/** 把字节编码成 base64；分块处理，避免大文件把 String.fromCharCode 的参数撑爆 */
export function bytesToBase64(bytes: Uint8Array): string {
	const chunk = 0x8000;
	let binary = '';
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
	const clean = base64.replace(/\s+/g, '');
	const binary = atob(clean);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

function utf8ToBase64(text: string): string {
	return bytesToBase64(new TextEncoder().encode(text));
}

function base64ToUtf8(base64: string): string {
	return new TextDecoder().decode(base64ToBytes(base64));
}

// ---------------------------------------------------------------- 请求

/** 路径逐段转义：中文、空格、# 这类文件名不能让 URL 断掉 */
function encodePath(path: string): string {
	return path
		.split('/')
		.filter((part) => part.length > 0)
		.map((part) => encodeURIComponent(part))
		.join('/');
}

async function toGitHubError(res: Response): Promise<GitHubError> {
	let detail = '';
	try {
		const body = (await res.json()) as { message?: unknown };
		if (body && typeof body.message === 'string') detail = body.message;
	} catch {
		// 错误响应未必是 JSON（代理页、网关错误等）
	}

	let hint: string;
	switch (res.status) {
		case 401:
			hint = 'Token 无效或已过期，请重新生成后再粘贴。';
			break;
		case 403:
			if (res.headers.get('x-ratelimit-remaining') === '0') {
				const reset = Number(res.headers.get('x-ratelimit-reset') ?? '');
				const when = Number.isFinite(reset) && reset > 0
					? new Date(reset * 1000).toLocaleTimeString('zh-CN', { hour12: false })
					: '稍后';
				hint = `触发了 GitHub API 限流（额度已用完），请在 ${when} 之后重试。`;
			} else {
				hint = 'Token 没有 Contents 读写权限，或没勾选这个仓库。';
			}
			break;
		case 404:
			hint = '找不到这个仓库或路径：请确认 Token 勾选了这个仓库，并且分支名正确。';
			break;
		case 409:
			hint = '文件在远端已被改动（sha 不一致），请刷新列表后重试。';
			break;
		case 422:
			hint = 'GitHub 拒绝了这次提交：可能是同名文件已存在、内容过大，或分支保护不允许直接推送。';
			break;
		case 429:
			hint = '请求太频繁，被 GitHub 限流了，请等一分钟再试。';
			break;
		default:
			hint = `GitHub 返回了错误（HTTP ${res.status}）。`;
	}

	return new GitHubError(res.status, detail ? `${hint}（${detail}）` : hint);
}

async function apiFetch(token: string, path: string, init: RequestInit = {}): Promise<Response> {
	const headers: Record<string, string> = {
		Authorization: `Bearer ${token}`,
		Accept: 'application/vnd.github+json',
		'X-GitHub-Api-Version': '2022-11-28',
	};
	if (init.body !== undefined) headers['Content-Type'] = 'application/json';
	if (init.headers) Object.assign(headers, init.headers as Record<string, string>);

	let res: Response;
	try {
		res = await fetch(`${API_BASE}${path}`, { ...init, headers });
	} catch (err) {
		const reason = err instanceof Error ? err.message : String(err);
		throw new GitHubError(
			0,
			`网络请求失败：${reason}。请确认网络能访问 api.github.com（必要时先关掉拦截代理）后重试。`,
		);
	}

	if (!res.ok) throw await toGitHubError(res);
	return res;
}

// ---------------------------------------------------------------- 账号

/** 校验 Token 并返回当前账号；登录时用来确认「这个 Token 是谁的」 */
export async function whoAmI(token: string): Promise<{ login: string }> {
	const res = await apiFetch(token, '/user');
	const data = (await res.json()) as { login?: unknown };
	if (typeof data.login !== 'string' || data.login.length === 0) {
		throw new GitHubError(0, 'GitHub 返回的账号信息里没有 login 字段，请稍后重试。');
	}
	return { login: data.login };
}

/** GET /repos/{owner}/{repo} 的 permissions.push：false 说明这个 Token 只能读 */
export async function canWrite(repo: Repo, token: string): Promise<boolean> {
	const res = await apiFetch(token, `/repos/${repo.owner}/${repo.repo}`);
	const data = (await res.json()) as {
		permissions?: { push?: boolean; admin?: boolean; maintain?: boolean };
	};
	const permissions = data.permissions;
	return Boolean(permissions?.push || permissions?.admin || permissions?.maintain);
}

// ---------------------------------------------------------------- 读

interface ContentFileResponse {
	type?: string;
	sha?: string;
	path?: string;
	name?: string;
	encoding?: string;
	content?: string;
}

/** 取一个文件/目录的原始响应；404 返回 null，不抛错 */
async function getContent(repo: Repo, token: string, path: string): Promise<Response | null> {
	const url = `/repos/${repo.owner}/${repo.repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(repo.branch)}`;
	try {
		return await apiFetch(token, url);
	} catch (err) {
		if (err instanceof GitHubError && err.status === 404) return null;
		throw err;
	}
}

export async function readTextFile(
	repo: Repo,
	token: string,
	path: string,
): Promise<{ text: string; sha: string } | null> {
	const res = await getContent(repo, token, path);
	if (!res) return null;

	const data = (await res.json()) as ContentFileResponse;
	if (data.type !== 'file') return null;
	if (typeof data.sha !== 'string') {
		throw new GitHubError(0, `读取 ${path} 时没有拿到 sha，无法安全提交。`);
	}
	if (data.encoding !== 'base64' || typeof data.content !== 'string') {
		// Contents API 对 >1MB 的文件只返回元信息
		throw new GitHubError(422, `${path} 超过 1MB，GitHub Contents API 不返回内容，后台改不了，请到 GitHub 网页上编辑。`);
	}

	return { text: base64ToUtf8(data.content), sha: data.sha };
}

export async function readJsonFile<T>(
	repo: Repo,
	token: string,
	path: string,
): Promise<{ data: T; sha: string } | null> {
	const file = await readTextFile(repo, token, path);
	if (!file) return null;
	try {
		return { data: JSON.parse(file.text) as T, sha: file.sha };
	} catch {
		throw new GitHubError(422, `${path} 不是合法的 JSON，请先到 GitHub 上修好再试。`);
	}
}

export async function listDir(
	repo: Repo,
	token: string,
	path: string,
): Promise<{ name: string; path: string; sha: string; type: string }[]> {
	const res = await getContent(repo, token, path);
	if (!res) return [];

	const data = (await res.json()) as unknown;
	if (!Array.isArray(data)) return [];

	return data.map((item) => {
		const entry = item as ContentFileResponse;
		return {
			name: String(entry.name ?? ''),
			path: String(entry.path ?? ''),
			sha: String(entry.sha ?? ''),
			type: String(entry.type ?? ''),
		};
	});
}

// ---------------------------------------------------------------- 写

interface CommitInput {
	path: string;
	message: string;
	base64: string;
	sha?: string;
}

async function commitFile(
	repo: Repo,
	token: string,
	input: CommitInput,
): Promise<{ sha: string; path: string }> {
	const body: Record<string, string> = {
		message: input.message,
		content: input.base64,
		branch: repo.branch,
	};
	// 有 sha 是更新，没有 sha 是新建（同名已存在时 GitHub 会返回 422）
	if (input.sha) body.sha = input.sha;

	const res = await apiFetch(token, `/repos/${repo.owner}/${repo.repo}/contents/${encodePath(input.path)}`, {
		method: 'PUT',
		body: JSON.stringify(body),
	});
	const data = (await res.json()) as { content?: { sha?: string; path?: string } };
	return {
		sha: data.content?.sha ?? '',
		path: data.content?.path ?? input.path,
	};
}

export async function putFile(
	repo: Repo,
	token: string,
	options: {
		path: string;
		message: string;
		/** 文本内容，默认按 UTF-8 编码；encoding: 'base64' 时原样当成 base64 提交 */
		content: string;
		sha?: string;
		encoding?: 'utf8' | 'base64';
	},
): Promise<{ sha: string; path: string }> {
	return commitFile(repo, token, {
		path: options.path,
		message: options.message,
		sha: options.sha,
		base64: options.encoding === 'base64' ? options.content.replace(/\s+/g, '') : utf8ToBase64(options.content),
	});
}

export async function putBinary(
	repo: Repo,
	token: string,
	options: { path: string; message: string; base64: string; sha?: string },
): Promise<{ sha: string; path: string }> {
	return commitFile(repo, token, {
		path: options.path,
		message: options.message,
		sha: options.sha,
		base64: options.base64.replace(/\s+/g, ''),
	});
}

export async function deleteFile(
	repo: Repo,
	token: string,
	options: { path: string; message: string; sha: string },
): Promise<void> {
	await apiFetch(token, `/repos/${repo.owner}/${repo.repo}/contents/${encodePath(options.path)}`, {
		method: 'DELETE',
		body: JSON.stringify({
			message: options.message,
			sha: options.sha,
			branch: repo.branch,
		}),
	});
}
