import { OpenAIMessage } from './openAICompatibleClient';
import { resolveDisplayLanguage } from './i18n';

export interface CommitPromptContext {
	readonly repositoryName: string;
	readonly branchName: string;
	readonly diffText: string;
	readonly diffMode: 'staged' | 'workingTree';
	readonly recentRepositoryCommits: readonly string[];
	readonly recentUserCommits: readonly string[];
}

const promptTextByLanguage = {
	en: {
		defaultSystemPrompt: 'You are an expert software engineer who writes clear, specific, accurate git commit messages from diffs.',
		defaultSystemRules: [
			'Return only the git commit message text.',
			'Write the commit message in English.',
			'Do not wrap the answer in Markdown code fences.',
			'Do not add explanations, bullet points, or labels.',
			'Prefer a subject that states the primary change and affected area, not a vague summary.',
			"Avoid generic subjects like 'update code', 'fix issues', or 'bootstrap project' unless the diff truly contains nothing more specific.",
			'Follow the dominant recent commit style when it is clear. If there is no clear style, prefer a concise Conventional Commit style subject line.',
			'If the diff includes multiple meaningful changes, setup details, or important impact, add a blank line followed by 1 to 3 short body lines.',
		].join('\n'),
		repositoryHeading: '# Repository',
		repositoryLabel: 'Repository',
		branchLabel: 'Branch',
		detachedHeadLabel: '(detached HEAD)',
		modeLabel: 'Mode',
		stagedChangesLabel: 'staged changes',
		workingTreeChangesLabel: 'working tree changes',
		recentUserCommitsHeading: '# Recent user commits',
		recentRepositoryCommitsHeading: '# Recent repository commits',
		noCommitsLabel: '- None',
		diffHeading: '# Diff',
		taskHeading: '# Task',
		taskInstruction: 'Write the best commit message for the diff above. Capture the main intent, the affected area, and the most important outcome.',
		styleInstruction: 'Use the recent commits only as style reference. Do not copy their text, and do not let their language override the required output language.',
	},
	zh: {
		defaultSystemPrompt: '你是一名资深软件工程师，擅长根据 diff 撰写清晰、具体、准确的 git 提交信息。',
		defaultSystemRules: [
			'只返回 git commit message 文本。',
			'使用简体中文输出提交信息。',
			'不要使用 Markdown 代码块包裹答案。',
			'不要添加解释、项目符号或标签。',
			'主题行要写出本次最主要的变更和受影响的模块或功能，不要只写空泛概述。',
			'避免使用“更新代码”“修复问题”“初始化项目”这类过泛表述，除非 diff 的信息确实只能支持这种结论。',
			'如果最近提交已经形成明显风格，优先保持一致；如果没有明显风格，优先采用清晰简洁的 Conventional Commits 风格主题行。',
			'如果 diff 包含多项关键改动、初始化细节或重要影响，在主题行后空一行，再补 1 到 3 行简短正文。',
		].join('\n'),
		repositoryHeading: '# 仓库信息',
		repositoryLabel: '仓库',
		branchLabel: '分支',
		detachedHeadLabel: '（游离 HEAD）',
		modeLabel: '模式',
		stagedChangesLabel: '暂存区变更',
		workingTreeChangesLabel: '工作区变更',
		recentUserCommitsHeading: '# 最近的用户提交',
		recentRepositoryCommitsHeading: '# 最近的仓库提交',
		noCommitsLabel: '- 无',
		diffHeading: '# Diff',
		taskHeading: '# 任务',
		taskInstruction: '请基于上面的 diff 提炼出最重要的变更意图、影响范围和结果，编写最合适的提交信息。',
		styleInstruction: '最近的提交只能作为风格参考，不要直接复制其中的文本，也不要让历史提交的语言覆盖当前要求的输出语言。',
	},
} as const;

export function buildCommitMessagePromptMessages(
	context: CommitPromptContext,
	systemPrompt: string,
	language?: string,
): OpenAIMessage[] {
	const promptLanguage = resolveDisplayLanguage(language);
	const promptText = promptTextByLanguage[promptLanguage];
	const resolvedSystemPrompt = [
		systemPrompt || promptText.defaultSystemPrompt,
		promptText.defaultSystemRules,
	]
		.filter(Boolean)
		.join('\n\n');

	const userSections = [
		promptText.repositoryHeading,
		`${promptText.repositoryLabel}: ${context.repositoryName}`,
		`${promptText.branchLabel}: ${context.branchName || promptText.detachedHeadLabel}`,
		`${promptText.modeLabel}: ${context.diffMode === 'staged' ? promptText.stagedChangesLabel : promptText.workingTreeChangesLabel}`,
		'',
		promptText.recentUserCommitsHeading,
		context.recentUserCommits.length > 0 ? context.recentUserCommits.map((value) => `- ${value}`).join('\n') : promptText.noCommitsLabel,
		'',
		promptText.recentRepositoryCommitsHeading,
		context.recentRepositoryCommits.length > 0 ? context.recentRepositoryCommits.map((value) => `- ${value}`).join('\n') : promptText.noCommitsLabel,
		'',
		promptText.diffHeading,
		context.diffText,
		'',
		promptText.taskHeading,
		promptText.taskInstruction,
		promptText.styleInstruction,
	].join('\n');

	return [
		{ role: 'system', content: resolvedSystemPrompt },
		{ role: 'user', content: userSections },
	];
}

export function normalizeCommitMessage(raw: string): string {
	let value = raw.trim();

	const fenced = value.match(/^```(?:\w+)?\s*([\s\S]*?)\s*```$/);
	if (fenced) {
		value = fenced[1].trim();
	}

	if (
		(value.startsWith('"') && value.endsWith('"'))
		|| (value.startsWith('\'') && value.endsWith('\''))
	) {
		value = value.slice(1, -1).trim();
	}

	return value;
}
