import * as vscode from 'vscode';
import {
	CustomModelAuthMode,
	CustomModelConfig,
	DEFAULT_API_KEY_HEADER_NAME,
	DEFAULT_MAX_INPUT_TOKENS,
	DEFAULT_MAX_OUTPUT_TOKENS,
} from './modelTypes';

export const EXTENSION_NAMESPACE = 'customModels';
const MODELS_SETTING = 'models';
const TIMEOUT_SETTING = 'requestTimeoutSeconds';
const GIT_COMMIT_SYSTEM_PROMPT_SETTING = 'gitCommitMessage.systemPrompt';
const SECRET_PREFIX = 'customModels.apiKey.';

export class ModelConfigurationService {
	constructor(private readonly context: vscode.ExtensionContext) { }

	public observeConfiguration(listener: () => void): vscode.Disposable {
		return vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration(`${EXTENSION_NAMESPACE}.${MODELS_SETTING}`)) {
				listener();
			}
		});
	}

	public getModels(): CustomModelConfig[] {
		const value = vscode.workspace.getConfiguration(EXTENSION_NAMESPACE).get<unknown[]>(MODELS_SETTING, []);
		if (!Array.isArray(value)) {
			return [];
		}

		const seen = new Set<string>();
		const models: CustomModelConfig[] = [];
		for (const candidate of value) {
			const normalized = normalizeModelConfig(candidate);
			if (!normalized || seen.has(normalized.id)) {
				continue;
			}

			seen.add(normalized.id);
			models.push(normalized);
		}

		return enforceSingleGitCommitMessageModel(models);
	}

	public getModel(id: string): CustomModelConfig | undefined {
		return this.getModels().find((model) => model.id === id);
	}

	public getGitCommitMessageModel(): CustomModelConfig | undefined {
		return this.getModels().find((model) => model.useForGitCommitMessage);
	}

	public async addModel(model: CustomModelConfig): Promise<void> {
		const models = this.getModels();
		const existingIndex = models.findIndex((item) => item.id === model.id);
		if (existingIndex >= 0) {
			models[existingIndex] = model;
		} else {
			models.push(model);
		}
		await this.saveModels(
			enforceSingleGitCommitMessageModel(models, model.useForGitCommitMessage ? model.id : undefined),
		);
	}

	public async removeModel(id: string): Promise<void> {
		const models = this.getModels().filter((item) => item.id !== id);
		await this.saveModels(models);
		await this.deleteApiKey(id);
	}

	public async saveApiKey(id: string, apiKey: string): Promise<void> {
		await this.context.secrets.store(this.getSecretKey(id), apiKey);
	}

	public async getApiKey(id: string): Promise<string | undefined> {
		return this.context.secrets.get(this.getSecretKey(id));
	}

	public async deleteApiKey(id: string): Promise<void> {
		await this.context.secrets.delete(this.getSecretKey(id));
	}

	public getRequestTimeoutMs(): number {
		const seconds = vscode.workspace.getConfiguration(EXTENSION_NAMESPACE).get<number>(TIMEOUT_SETTING, 300);
		if (!Number.isFinite(seconds) || seconds <= 0) {
			return 300_000;
		}

		return Math.max(5, seconds) * 1000;
	}

	public getGitCommitMessageSystemPrompt(): string {
		return vscode.workspace
			.getConfiguration(EXTENSION_NAMESPACE)
			.get<string>(GIT_COMMIT_SYSTEM_PROMPT_SETTING, '')
			.trim();
	}

	private async saveModels(models: CustomModelConfig[]): Promise<void> {
		await vscode.workspace
			.getConfiguration(EXTENSION_NAMESPACE)
			.update(MODELS_SETTING, enforceSingleGitCommitMessageModel(models), vscode.ConfigurationTarget.Global);
	}

	private getSecretKey(id: string): string {
		return `${SECRET_PREFIX}${id}`;
	}
}

export function normalizeModelConfig(value: unknown): CustomModelConfig | undefined {
	if (!value || typeof value !== 'object') {
		return undefined;
	}

	const candidate = value as Record<string, unknown>;
	const id = asTrimmedString(candidate.id);
	const name = asTrimmedString(candidate.name);
	const model = asTrimmedString(candidate.model);
	const baseUrl = asTrimmedString(candidate.baseUrl);
	if (!id || !name || !model || !baseUrl) {
		return undefined;
	}

	return {
		id,
		name,
		model,
		providerLabel: asTrimmedString(candidate.providerLabel),
		baseUrl,
		apiPath: asTrimmedString(candidate.apiPath),
		authMode: toAuthMode(candidate.authMode),
		apiKeyHeaderName: asTrimmedString(candidate.apiKeyHeaderName) ?? DEFAULT_API_KEY_HEADER_NAME,
		toolCalling: asBoolean(candidate.toolCalling, true),
		vision: asBoolean(candidate.vision, false),
		useForGitCommitMessage: asBoolean(candidate.useForGitCommitMessage, false),
		maxInputTokens: asPositiveNumber(candidate.maxInputTokens, DEFAULT_MAX_INPUT_TOKENS),
		maxOutputTokens: asPositiveNumber(candidate.maxOutputTokens, DEFAULT_MAX_OUTPUT_TOKENS),
		requestHeaders: sanitizeHeaders(candidate.requestHeaders),
		showInModelPicker: asBoolean(candidate.showInModelPicker, true),
	};
}

function enforceSingleGitCommitMessageModel(
	models: CustomModelConfig[],
	preferredId?: string,
): CustomModelConfig[] {
	const selectedId = preferredId && models.some((model) => model.id === preferredId)
		? preferredId
		: models.find((model) => model.useForGitCommitMessage)?.id;

	if (!selectedId) {
		return models.map((model) => ({ ...model, useForGitCommitMessage: false }));
	}

	return models.map((model) => ({
		...model,
		useForGitCommitMessage: model.id === selectedId,
	}));
}

function sanitizeHeaders(value: unknown): Record<string, string> | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}

	const headers: Record<string, string> = {};
	for (const [key, rawValue] of Object.entries(value as Record<string, unknown>)) {
		const trimmedKey = key.trim();
		const trimmedValue = typeof rawValue === 'string' ? rawValue.trim() : undefined;
		if (!trimmedKey || !trimmedValue) {
			continue;
		}

		headers[trimmedKey] = trimmedValue;
	}

	return Object.keys(headers).length > 0 ? headers : undefined;
}

function toAuthMode(value: unknown): CustomModelAuthMode {
	switch (value) {
		case 'header':
			return 'header';
		case 'none':
			return 'none';
		default:
			return 'bearer';
	}
}

function asTrimmedString(value: unknown): string | undefined {
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === 'boolean' ? value : fallback;
}

function asPositiveNumber(value: unknown, fallback: number): number {
	if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
		return fallback;
	}

	return Math.floor(value);
}
