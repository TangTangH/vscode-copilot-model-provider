import * as vscode from 'vscode';
import { ModelConfigurationService } from './configuration';
import { collectRepositoryContext, getGitApi, resolveRepository } from './gitRepository';
import { buildCommitMessagePromptMessages, normalizeCommitMessage } from './gitCommitMessagePrompt';
import { requestGitCommitMessage } from './gitCommitMessageRequest';
import { pickLocalizedString } from './i18n';

export const generateGitCommitMessageCommandId = 'customModels.generateGitCommitMessage';

const commandTitle = pickLocalizedString({
	en: 'Generate Commit Message',
	zh: '生成提交信息',
});

export function registerGitCommitMessageCommand(
	context: vscode.ExtensionContext,
	configurationService: ModelConfigurationService,
): void {
	context.subscriptions.push(vscode.commands.registerCommand(generateGitCommitMessageCommandId, async (...args: unknown[]) => {
		const [rootUri, _contexts, token] = args as [
			vscode.Uri | undefined,
			unknown,
			vscode.CancellationToken | undefined,
		];

		try {
			await generateCommitMessage(configurationService, rootUri, token);
		} catch (error) {
			if (error instanceof vscode.CancellationError) {
				return;
			}

			const message = error instanceof Error ? error.message : String(error);
			vscode.window.showErrorMessage(`${commandTitle}: ${message}`);
		}
	}));
}

async function generateCommitMessage(
	configurationService: ModelConfigurationService,
	rootUri?: vscode.Uri,
	token?: vscode.CancellationToken,
): Promise<void> {
	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.SourceControl,
			title: pickLocalizedString({
				en: 'Generating commit message',
				zh: '正在生成提交信息',
			}),
		},
		async () => {
			const model = configurationService.getGitCommitMessageModel();
			if (!model) {
				throw new Error(
					pickLocalizedString({
						en: 'No custom model is marked for Git commit message generation. Open "Custom Models: Manage Models" and enable the switch on one model.',
						zh: '当前还没有配置用于 Git 提交信息生成的自定义模型。请先打开“Custom Models: Manage Models”，并在某个模型上开启对应开关。',
					}),
				);
			}

			const apiKey = model.authMode === 'none'
				? undefined
				: await configurationService.getApiKey(model.id);

			if ((model.authMode ?? 'bearer') !== 'none' && !apiKey) {
				throw new Error(
					pickLocalizedString({
						en: `Model "${model.name}" is selected for Git commit message generation, but no API key is stored for it.`,
						zh: `模型 "${model.name}" 已被设为 Git 提交信息生成模型，但还没有保存 API Key。`,
					}),
				);
			}

			const gitApi = await getGitApi();
			const repository = await resolveRepository(gitApi, rootUri);

			if (!repository) {
				throw new Error(
					pickLocalizedString({
						en: 'No Git repository is available for the current context.',
						zh: '当前上下文中没有可用的 Git 仓库。',
					}),
				);
			}

			const repositoryContext = await collectRepositoryContext(repository, token);
			if (!repositoryContext) {
				vscode.window.showInformationMessage(
					pickLocalizedString({
						en: `No Git changes were found in ${repository.rootUri.fsPath}. This command uses the selected SCM repository or active editor repository, not the terminal's current working directory.`,
						zh: `在 ${repository.rootUri.fsPath} 中未发现 Git 变更。此命令使用当前选中的 SCM 仓库或活动编辑器所属仓库，而不是终端当前工作目录。`,
					}),
				);
				return;
			}

			const messages = buildCommitMessagePromptMessages(
				repositoryContext,
				configurationService.getGitCommitMessageSystemPrompt(),
				vscode.env.language,
			);
			const rawCommitMessage = await requestGitCommitMessage({
				config: model,
				apiKey,
				messages,
				timeoutMs: configurationService.getRequestTimeoutMs(),
				token,
			});
			const commitMessage = normalizeCommitMessage(rawCommitMessage);

			if (!commitMessage) {
				throw new Error(
					pickLocalizedString({
						en: 'The model returned an empty commit message.',
						zh: '模型返回了空的提交信息。',
					}),
				);
			}

			repository.inputBox.value = commitMessage;
		},
	);
}
