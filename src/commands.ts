import * as vscode from 'vscode';
import { ModelConfigurationService } from './configuration';
import { registerGitCommitMessageCommand } from './gitCommitMessage';
import { ModelManagementPanel } from './modelManagementPanel';
import { CustomModelProvider } from './provider';

export function registerCommands(
	context: vscode.ExtensionContext,
	configurationService: ModelConfigurationService,
	provider: CustomModelProvider
): void {
	const manageCommand = 'customModels.manage';

	context.subscriptions.push(vscode.commands.registerCommand(manageCommand, async () => {
		ModelManagementPanel.createOrShow(context.extensionUri, configurationService, provider);
	}));

	registerGitCommitMessageCommand(context, configurationService);

	const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.name = 'Custom Models';
	statusBarItem.text = '$(settings-gear) Models';
	statusBarItem.tooltip = 'Open Custom Models Manager';
	statusBarItem.command = manageCommand;
	statusBarItem.show();

	context.subscriptions.push(statusBarItem);
}
