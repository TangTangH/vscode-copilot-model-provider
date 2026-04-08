import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { ModelConfigurationService } from './configuration';
import { CustomModelProvider } from './provider';

export function activate(context: vscode.ExtensionContext): void {
	const configurationService = new ModelConfigurationService(context);
	const provider = new CustomModelProvider(configurationService);

	context.subscriptions.push(
		configurationService.observeConfiguration(() => provider.refresh()),
		vscode.lm.registerLanguageModelChatProvider('custom-models', provider),
	);

	registerCommands(context, configurationService, provider);
}

export function deactivate(): void {
	// Nothing to clean up beyond extension subscriptions.
}
