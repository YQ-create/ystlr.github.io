// 极简 GitHub API 客户端：只做后台需要的读写。
// 用 Git Trees API 一次性提交多个文件，保证「保存一次 = 一次构建」。

export interface Repo {
	owner: string;
	repo: string;
	branch: string;
	token: string;
}

export interface RepoFile {
	path: string;
	/** 文本内容（UTF-8） */
	content?: string;
	/** 二进制内容（图片 / 音频） */
	bytes?: Uint8Array;
	/** 为 true 时删除该文件 */
	remove?: boolean;
}

export class GitHubError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
		this.name = 'GitHubError';
	}
}

const API = 'https://api.github.com';

async function request<T>(repo: Repo, path: string, init: RequestInit = {}): Promise<T> {
	const headers: Record<string, string> = {
		Accept: 'application/vnd.github+json',
		'X-GitHub-Api-Version': '2022-11-28',
		Authorization: `Bearer ${repo.token}`,
	};
	if (init.body) headers['Content-Type'] = 'application/json';

	const res = await fetch(`${API}${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });

	if (!res.ok) {
		let detail = res.statusText;
		try {
			const data = (await res.json()) as { message?: string };
			detail = data.message ?? detail;
		} catch {
			/* ignore */
		}
		if (res.status === 401) detail = 'Token 无效或已过期';
		if (res.status === 403) detail = `${detail}（Token 权限不足，需要对该仓库的 Contents 读写权限）`;
		if (res.status === 404) detail = `${detail}（仓库或分支不存在，或 Token 无权访问）`;
		throw new GitHubError(detail, res.status);
	}
	if (res.status === 204) return undefined as T;
	return (await res.json()) as T;
}

function base64ToBytes(value: string): Uint8Array {
	const binary = atob(value.replace(/\s/g, ''));
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = '';
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(binary);
}

export function textToBase64(text: string): string {
	return bytesToBase64(new TextEncoder().encode(text));
}

/** 校验 Token 并返回账号信息 */
export async function whoAmI(repo: Repo): Promise<{ login: string; avatar?: string }> {
	const data = await request<{ login: string; avatar_url?: string }>(repo, '/user');
	return { login: data.login, avatar: data.avatar_url };
}

/** 体检结果的一项 */
export interface DiagStep {
	label: string;
	ok: boolean;
	detail?: string;
}

function messageOf(error: unknown): string {
	if (error instanceof GitHubError) return error.message;
	if (error instanceof Error) return error.message;
	return String(error);
}

/**
 * 逐项体检 Token：身份 → 仓库（含写入权限）→ Contents 读取 → 分支引用。
 * 返回失败项，调用方据此给出可操作的提示。
 */
export async function diagnose(repo: Repo): Promise<{ login?: string; steps: DiagStep[] }> {
	const steps: DiagStep[] = [];
	let login: string | undefined;

	try {
		const me = await request<{ login: string }>(repo, '/user');
		login = me.login;
		steps.push({ label: `Token 有效（${me.login}）`, ok: true });
	} catch (error) {
		steps.push({ label: 'Token 有效', ok: false, detail: messageOf(error) });
		return { steps };
	}

	try {
		const info = await request<{ permissions?: { push?: boolean } }>(repo, `/repos/${repo.owner}/${repo.repo}`);
		const push = info.permissions?.push;
		steps.push({ label: '仓库可访问', ok: true });
		steps.push({
			label: 'Contents 读写权限',
			ok: push !== false,
			detail: push === false ? 'Token 对这个仓库是只读，需要设为 Read and write' : undefined,
		});
	} catch (error) {
		steps.push({ label: '仓库可访问', ok: false, detail: messageOf(error) });
	}

	try {
		await request(
			repo,
			`/repos/${repo.owner}/${repo.repo}/contents/package.json?ref=${encodeURIComponent(repo.branch)}`,
		);
		steps.push({ label: '读取仓库文件', ok: true });
	} catch (error) {
		steps.push({ label: '读取仓库文件', ok: false, detail: messageOf(error) });
	}

	try {
		await request(repo, `/repos/${repo.owner}/${repo.repo}/git/ref/heads/${repo.branch}`);
		steps.push({ label: `分支 ${repo.branch}`, ok: true });
	} catch (error) {
		steps.push({ label: `分支 ${repo.branch}`, ok: false, detail: messageOf(error) });
	}

	return { login, steps };
}

/** 读取文本文件；不存在返回 null */
export async function readTextFile(repo: Repo, path: string): Promise<{ text: string; sha: string } | null> {
	try {
		const data = await request<{ content?: string; encoding?: string; sha: string }>(
			repo,
			`/repos/${repo.owner}/${repo.repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(repo.branch)}`,
		);
		if (!data.content) return null;
		const bytes = base64ToBytes(data.content);
		return { text: new TextDecoder().decode(bytes), sha: data.sha };
	} catch (error) {
		if (error instanceof GitHubError && error.status === 404) return null;
		throw error;
	}
}

/** 列出目录下的文件（不含子目录内容） */
export async function listDir(repo: Repo, path: string): Promise<{ name: string; path: string; sha: string }[]> {
	try {
		const data = await request<{ name: string; path: string; sha: string; type: string }[]>(
			repo,
			`/repos/${repo.owner}/${repo.repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(repo.branch)}`,
		);
		return data.filter((item) => item.type === 'file').map(({ name, path: p, sha }) => ({ name, path: p, sha }));
	} catch (error) {
		if (error instanceof GitHubError && error.status === 404) return [];
		throw error;
	}
}

/** 读取最新的提交号（用于「是否还在构建」提示，可省略） */
export async function headSha(repo: Repo): Promise<string> {
	const data = await request<{ object: { sha: string } }>(
		repo,
		`/repos/${repo.owner}/${repo.repo}/git/ref/heads/${repo.branch}`,
	);
	return data.object.sha;
}

/**
 * 一次提交多个文件（新增 / 修改 / 删除）。
 * 使用 Git Trees API，避免多次 Contents API 调用产生多个提交。
 */
export async function commitFiles(repo: Repo, message: string, files: RepoFile[]): Promise<string> {
	if (!files.length) throw new Error('没有要提交的文件');

	const ref = await request<{ object: { sha: string } }>(
		repo,
		`/repos/${repo.owner}/${repo.repo}/git/ref/heads/${repo.branch}`,
	);
	const parentSha = ref.object.sha;

	const parent = await request<{ tree: { sha: string } }>(
		repo,
		`/repos/${repo.owner}/${repo.repo}/git/commits/${parentSha}`,
	);

	const entries: { path: string; mode: string; type: string; sha: string | null }[] = [];
	for (const file of files) {
		if (file.remove) {
			entries.push({ path: file.path, mode: '100644', type: 'blob', sha: null });
			continue;
		}
		const base64 = file.bytes ? bytesToBase64(file.bytes) : textToBase64(file.content ?? '');
		const blob = await request<{ sha: string }>(repo, `/repos/${repo.owner}/${repo.repo}/git/blobs`, {
			method: 'POST',
			body: JSON.stringify({ content: base64, encoding: 'base64' }),
		});
		entries.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha });
	}

	const tree = await request<{ sha: string }>(repo, `/repos/${repo.owner}/${repo.repo}/git/trees`, {
		method: 'POST',
		body: JSON.stringify({ base_tree: parent.tree.sha, tree: entries }),
	});

	const commit = await request<{ sha: string }>(repo, `/repos/${repo.owner}/${repo.repo}/git/commits`, {
		method: 'POST',
		body: JSON.stringify({ message, tree: tree.sha, parents: [parentSha] }),
	});

	await request(repo, `/repos/${repo.owner}/${repo.repo}/git/refs/heads/${repo.branch}`, {
		method: 'PATCH',
		body: JSON.stringify({ sha: commit.sha }),
	});

	return commit.sha;
}

export { base64ToBytes, bytesToBase64 };
