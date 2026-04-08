import { execFile as execFileCallback } from 'node:child_process';
import { Buffer } from 'node:buffer';
import * as path from 'node:path';
import { TextDecoder, promisify } from 'node:util';
import * as vscode from 'vscode';
import { pickLocalizedString } from './i18n';

const execFile = promisify(execFileCallback);
const textDecoder = new TextDecoder('utf-8', { fatal: true });
const maxPromptDiffLength = 160_000;
const summaryOnlyExtensions = new Set([
	'.apng',
	'.avif',
	'.bmp',
	'.cur',
	'.gif',
	'.heic',
	'.heif',
	'.ico',
	'.icns',
	'.jpeg',
	'.jpg',
	'.jxl',
	'.png',
	'.psd',
	'.raw',
	'.svg',
	'.svgz',
	'.tif',
	'.tiff',
	'.webp',
]);

interface PendingChange {
	readonly kind: 'tracked' | 'untracked';
	readonly relativePath: string;
	readonly uri?: vscode.Uri;
}

export interface RepositoryState {
	readonly HEAD?: {
		readonly name?: string;
	};
	readonly indexChanges: readonly unknown[];
	readonly workingTreeChanges: readonly unknown[];
	readonly untrackedChanges?: readonly unknown[];
}

export interface Repository {
	readonly rootUri: vscode.Uri;
	readonly inputBox: {
		value: string;
	};
	readonly state: RepositoryState;
	status(): Promise<void>;
}

export interface GitApi {
	readonly repositories: readonly Repository[];
	getRepository(uri: vscode.Uri): Repository | null;
}

interface GitExtension {
	getAPI(version: 1): GitApi;
}

export interface RepositoryContext {
	readonly repositoryName: string;
	readonly branchName: string;
	readonly diffText: string;
	readonly diffMode: 'staged' | 'workingTree';
	readonly recentRepositoryCommits: readonly string[];
	readonly recentUserCommits: readonly string[];
}

async function runGit(repoPath: string, args: readonly string[]): Promise<string> {
	const result = await execFile('git', args, {
		cwd: repoPath,
		windowsHide: true,
		maxBuffer: 16 * 1024 * 1024,
	});

	return result.stdout.replace(/\r\n/g, '\n');
}

async function tryRunGit(repoPath: string, args: readonly string[]): Promise<string | undefined> {
	try {
		return await runGit(repoPath, args);
	} catch {
		return undefined;
	}
}

function parseNullSeparated(output: string | undefined): string[] {
	return output
		?.split('\0')
		.map((value) => value.trim())
		.filter(Boolean) ?? [];
}

async function listPendingChanges(
	repository: Repository,
): Promise<{ hasStagedChanges: boolean; changes: readonly PendingChange[] }> {
	const repoPath = repository.rootUri.fsPath;
	const stagedPaths = parseNullSeparated(
		await tryRunGit(repoPath, ['diff', '--cached', '--name-only', '-z', '--diff-filter=ACDMRTUXB']),
	);

	if (stagedPaths.length > 0) {
		return {
			hasStagedChanges: true,
			changes: stagedPaths.map((relativePath) => ({
				kind: 'tracked',
				relativePath,
			})),
		};
	}

	const [workingTreePaths, untrackedPaths] = await Promise.all([
		tryRunGit(repoPath, ['diff', '--name-only', '-z', '--diff-filter=ACDMRTUXB']),
		tryRunGit(repoPath, ['ls-files', '--others', '--exclude-standard', '-z']),
	]);

	const changes: PendingChange[] = [
		...parseNullSeparated(workingTreePaths).map((relativePath) => ({
			kind: 'tracked' as const,
			relativePath,
		})),
		...parseNullSeparated(untrackedPaths).map((relativePath) => ({
			kind: 'untracked' as const,
			relativePath,
			uri: vscode.Uri.file(path.join(repoPath, relativePath)),
		})),
	];

	return {
		hasStagedChanges: false,
		changes,
	};
}

async function buildUntrackedPatch(relativePath: string, changeUri: vscode.Uri): Promise<string | undefined> {
	if (shouldOmitFileContent(relativePath)) {
		return buildOmittedFileSummary(relativePath);
	}

	const bytes = await vscode.workspace.fs.readFile(changeUri);
	const buffer = Buffer.from(bytes);

	if (buffer.includes(0)) {
		return buildOmittedFileSummary(relativePath);
	}

	let text: string;
	try {
		text = textDecoder.decode(bytes).replace(/\r\n/g, '\n');
	} catch {
		return buildOmittedFileSummary(relativePath);
	}

	if (text.length === 0) {
		return [
			`diff --git a/${relativePath} b/${relativePath}`,
			'new file mode 100644',
			'--- /dev/null',
			`+++ b/${relativePath}`,
		].join('\n');
	}

	const lines = text.split('\n');
	const body = lines.map((line) => `+${line}`).join('\n');

	return [
		`diff --git a/${relativePath} b/${relativePath}`,
		'new file mode 100644',
		'--- /dev/null',
		`+++ b/${relativePath}`,
		`@@ -0,0 +1,${lines.length} @@`,
		body,
	].join('\n');
}

function shouldOmitFileContent(relativePath: string): boolean {
	return summaryOnlyExtensions.has(path.extname(relativePath).toLowerCase());
}

function buildOmittedFileSummary(relativePath: string): string {
	return [
		`diff --git a/${relativePath} b/${relativePath}`,
		`Binary or image file changed: ${relativePath}`,
		'Content omitted from prompt.',
	].join('\n');
}

function isBinaryNumstat(output: string | undefined): boolean {
	const firstLine = output?.split('\n').map((value) => value.trim()).find(Boolean);
	if (!firstLine) {
		return false;
	}

	const [added, removed] = firstLine.split('\t');
	return added === '-' && removed === '-';
}

async function buildTrackedPatch(repository: Repository, relativePath: string, staged: boolean): Promise<string | undefined> {
	if (shouldOmitFileContent(relativePath)) {
		return buildOmittedFileSummary(relativePath);
	}

	const repoPath = repository.rootUri.fsPath;
	const numstatArgs = staged
		? ['diff', '--cached', '--no-ext-diff', '--no-color', '--numstat', '--', relativePath]
		: ['diff', '--no-ext-diff', '--no-color', '--numstat', '--', relativePath];
	const numstat = await tryRunGit(repoPath, numstatArgs);

	if (isBinaryNumstat(numstat)) {
		return buildOmittedFileSummary(relativePath);
	}

	const args = staged
		? ['diff', '--cached', '--no-ext-diff', '--no-color', '--', relativePath]
		: ['diff', '--no-ext-diff', '--no-color', '--', relativePath];

	const diff = await tryRunGit(repoPath, args);
	return diff?.trim() ? diff.trim() : undefined;
}

async function getRecentRepositoryCommits(repository: Repository): Promise<string[]> {
	const repoPath = repository.rootUri.fsPath;
	const output = await tryRunGit(repoPath, ['log', '-5', '--pretty=%s']);
	return output ? output.split('\n').map((value) => value.trim()).filter(Boolean) : [];
}

async function getRecentUserCommits(repository: Repository): Promise<string[]> {
	const repoPath = repository.rootUri.fsPath;
	const author = (await tryRunGit(repoPath, ['config', 'user.name']))?.trim()
		|| (await tryRunGit(repoPath, ['config', '--global', 'user.name']))?.trim();

	if (!author) {
		return [];
	}

	const output = await tryRunGit(repoPath, ['log', '-5', '--pretty=%s', `--author=${author}`]);
	return output ? output.split('\n').map((value) => value.trim()).filter(Boolean) : [];
}

export async function getGitApi(): Promise<GitApi> {
	const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');

	if (!extension) {
		throw new Error(
			pickLocalizedString({
				en: 'The built-in Git extension is not available.',
				zh: '内置 Git 扩展不可用。',
			}),
		);
	}

	if (!extension.isActive) {
		await extension.activate();
	}

	return extension.exports.getAPI(1);
}

export async function resolveRepository(gitApi: GitApi, rootUri: vscode.Uri | undefined): Promise<Repository | undefined> {
	if (rootUri) {
		const repository = gitApi.getRepository(rootUri);
		if (repository) {
			return repository;
		}
	}

	const activeEditorUri = vscode.window.activeTextEditor?.document.uri;
	if (activeEditorUri) {
		const repository = gitApi.getRepository(activeEditorUri);
		if (repository) {
			return repository;
		}
	}

	if (gitApi.repositories.length === 1) {
		return gitApi.repositories[0];
	}

	if (gitApi.repositories.length > 1) {
		const selected = await vscode.window.showQuickPick(
			gitApi.repositories.map((repository) => ({
				label: path.basename(repository.rootUri.fsPath),
				description: repository.rootUri.fsPath,
				repository,
			})),
			{
				placeHolder: pickLocalizedString({
					en: 'Select a repository for commit message generation',
					zh: '选择一个用于生成提交信息的仓库',
				}),
			},
		);

		return selected?.repository;
	}

	return undefined;
}

export async function collectRepositoryContext(
	repository: Repository,
	token: vscode.CancellationToken | undefined,
): Promise<RepositoryContext | undefined> {
	await repository.status();

	const { hasStagedChanges, changes } = await listPendingChanges(repository);

	if (changes.length === 0) {
		return undefined;
	}

	const patches: string[] = [];

	for (const change of changes) {
		if (token?.isCancellationRequested) {
			throw new vscode.CancellationError();
		}

		const patch = change.kind === 'untracked'
			? await buildUntrackedPatch(change.relativePath, change.uri!)
			: await buildTrackedPatch(repository, change.relativePath, hasStagedChanges);

		if (patch) {
			patches.push(patch);
		}
	}

	if (patches.length === 0) {
		return undefined;
	}

	let diffText = patches.join('\n\n');
	if (diffText.length > maxPromptDiffLength) {
		diffText = `${diffText.slice(0, maxPromptDiffLength)}\n\n${pickLocalizedString({
			en: `[Diff truncated after ${maxPromptDiffLength} characters.]`,
			zh: `[Diff 在 ${maxPromptDiffLength} 个字符后被截断。]`,
		})}`;
	}

	const [recentRepositoryCommits, recentUserCommits] = await Promise.all([
		getRecentRepositoryCommits(repository),
		getRecentUserCommits(repository),
	]);

	return {
		repositoryName: path.basename(repository.rootUri.fsPath),
		branchName: repository.state.HEAD?.name ?? '',
		diffText,
		diffMode: hasStagedChanges ? 'staged' : 'workingTree',
		recentRepositoryCommits,
		recentUserCommits,
	};
}
