import * as vscode from 'vscode';
import { ModelConfigurationService, normalizeModelConfig } from './configuration';
import {
	ModelManagementNotice,
	ModelManagementRequest,
	ModelManagementResponse,
	ModelManagementState,
} from './modelManagementProtocol';
import { ManagedCustomModelConfig } from './modelTypes';
import { CustomModelProvider } from './provider';

export class ModelManagementPanel {
	private static currentPanel: ModelManagementPanel | undefined;

	public static createOrShow(
		extensionUri: vscode.Uri,
		configurationService: ModelConfigurationService,
		provider: CustomModelProvider,
	): void {
		if (ModelManagementPanel.currentPanel) {
			ModelManagementPanel.currentPanel.panel.reveal(vscode.ViewColumn.One);
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			'customModels.manage',
			'Custom Models',
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')],
			},
		);

		ModelManagementPanel.currentPanel = new ModelManagementPanel(panel, extensionUri, configurationService, provider);
	}

	private readonly disposables: vscode.Disposable[] = [];

	private constructor(
		private readonly panel: vscode.WebviewPanel,
		private readonly extensionUri: vscode.Uri,
		private readonly configurationService: ModelConfigurationService,
		private readonly provider: CustomModelProvider,
	) {
		this.panel.webview.html = this.getHtml(this.panel.webview);
		this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
		this.panel.webview.onDidReceiveMessage((message) => {
			void this.handleMessage(message as ModelManagementRequest);
		}, null, this.disposables);
	}

	private dispose(): void {
		ModelManagementPanel.currentPanel = undefined;
		while (this.disposables.length > 0) {
			this.disposables.pop()?.dispose();
		}
	}

	private async handleMessage(message: ModelManagementRequest): Promise<void> {
		switch (message.type) {
			case 'ready':
				await this.postState();
				return;
			case 'save-model':
				await this.saveModel(message.model, message.apiKey);
				return;
			case 'delete-model':
				await this.deleteModel(message.id);
				return;
			case 'set-model-visibility':
				await this.setModelVisibility(message.id, message.showInModelPicker);
				return;
			case 'open-settings-json':
				await vscode.commands.executeCommand('workbench.action.openSettingsJson');
				return;
		}
	}

	private async saveModel(rawModel: unknown, apiKey: string): Promise<void> {
		const existingName = typeof rawModel === 'object' && rawModel && 'id' in rawModel
			? this.configurationService.getModel(String((rawModel as { id?: unknown }).id ?? ''))?.name
			: undefined;

		try {
			const model = normalizeModelConfig(rawModel);
			if (!model) {
				throw new Error('模型配置格式无效，请检查必填字段。');
			}

			await this.configurationService.addModel(model);
			if ((model.authMode ?? 'bearer') === 'none') {
				await this.configurationService.deleteApiKey(model.id);
			} else {
				const trimmedKey = apiKey.trim();
				if (trimmedKey) {
					await this.configurationService.saveApiKey(model.id, trimmedKey);
				} else {
					await this.configurationService.deleteApiKey(model.id);
				}
			}
			this.provider.refresh();

			await this.postState(model.id, {
				kind: 'success',
				message: existingName
					? `已更新 "${model.name}"。`
					: `已保存 "${model.name}"。`,
			});
		} catch (error) {
			await this.postNotice({
				kind: 'error',
				message: toErrorMessage(error),
			});
		}
	}

	private async deleteModel(id: string): Promise<void> {
		try {
			const model = this.configurationService.getModel(id);
			if (!model) {
				throw new Error('找不到要删除的模型。');
			}

			await this.configurationService.removeModel(id);
			this.provider.refresh();

			await this.postState(undefined, {
				kind: 'success',
				message: `已删除 "${model.name}"。`,
			});
		} catch (error) {
			await this.postNotice({
				kind: 'error',
				message: toErrorMessage(error),
			});
		}
	}

	private async setModelVisibility(id: string, showInModelPicker: boolean): Promise<void> {
		try {
			const model = this.configurationService.getModel(id);
			if (!model) {
				throw new Error('找不到要更新的模型。');
			}

			await this.configurationService.addModel({
				...model,
				showInModelPicker,
			});
			this.provider.refresh();

			await this.postMessage({
				type: 'update-model-visibility',
				id,
				showInModelPicker,
			});
		} catch (error) {
			await this.postNotice({
				kind: 'error',
				message: toErrorMessage(error),
			});
		}
	}

	private async postState(selectedId?: string, notice?: ModelManagementNotice): Promise<void> {
		const state: ModelManagementState = {
			models: await this.getManagedModels(),
		};

		await this.postMessage({
			type: 'hydrate',
			state,
			selectedId,
			notice,
		});
	}

	private async postNotice(notice: ModelManagementNotice): Promise<void> {
		await this.postMessage({
			type: 'notice',
			notice,
		});
	}

	private async postMessage(message: ModelManagementResponse): Promise<void> {
		await this.panel.webview.postMessage(message);
	}

	private async getManagedModels(): Promise<ManagedCustomModelConfig[]> {
		const models = this.configurationService.getModels();
		return Promise.all(models.map(async (model) => {
			const apiKey = await this.configurationService.getApiKey(model.id);
			return {
				...model,
				hasApiKey: !!apiKey,
				apiKey,
			};
		}));
	}

	private getHtml(webview: vscode.Webview): string {
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'modelManagementApp.js'));
		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'modelManagementApp.css'));
		const nonce = createNonce();

		return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta
		http-equiv="Content-Security-Policy"
		content="default-src 'none'; img-src ${webview.cspSource} data:; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource};"
	/>
	<link rel="stylesheet" href="${styleUri}" />
	<title>Custom Models</title>
</head>
<body>
	<div id="root"></div>
	<script nonce="${nonce}">
		window.__CUSTOM_MODELS_NONCE__ = ${JSON.stringify(nonce)};
	</script>
	<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
	}
}

function createNonce(): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let result = '';
	for (let index = 0; index < 32; index += 1) {
		result += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return result;
}

function toErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message.trim()) {
		return error.message;
	}

	return String(error);
}
