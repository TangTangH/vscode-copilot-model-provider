import * as vscode from 'vscode';
import { ModelConfigurationService } from './configuration';
import { CustomModelConfig } from './modelTypes';
import {
	estimateTokenCount,
	invokeOpenAICompatibleChat,
	OpenAIImageContentPart,
	OpenAIMessage,
	OpenAIMessageContent,
	OpenAITextContentPart,
	OpenAIToolCall
} from './openAICompatibleClient';

export class CustomModelProvider implements vscode.LanguageModelChatProvider {
	private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();

	public readonly onDidChangeLanguageModelChatInformation = this.onDidChangeEmitter.event;

	constructor(private readonly configurationService: ModelConfigurationService) { }

	public refresh(): void {
		this.onDidChangeEmitter.fire();
	}

	public async provideLanguageModelChatInformation(_options: { silent: boolean }, _token: vscode.CancellationToken): Promise<vscode.LanguageModelChatInformation[]> {
		return this.configurationService
			.getModels()
			.map((model) => ({
				id: model.id,
				name: model.name,
				family: model.model,
				version: '1.0.0',
				maxInputTokens: model.maxInputTokens,
				maxOutputTokens: model.maxOutputTokens,
				detail: model.providerLabel ?? 'Custom Models',
				tooltip: `${model.name} is served by ${model.providerLabel ?? 'a custom OpenAI-compatible endpoint'}.`,
				isUserSelectable: model.showInModelPicker !== false,
				capabilities: {
					toolCalling: model.toolCalling,
					imageInput: model.vision,
				},
			}));
	}

	public async provideLanguageModelChatResponse(
		model: vscode.LanguageModelChatInformation,
		messages: readonly any[],
		options: vscode.ProvideLanguageModelChatResponseOptions,
		progress: vscode.Progress<any>,
		token: vscode.CancellationToken
	): Promise<void> {
		const config = this.configurationService.getModel(model.id);
		if (!config) {
			throw new Error(`Model "${model.id}" is no longer configured.`);
		}

		const apiKey = config.authMode === 'none'
			? undefined
			: await this.configurationService.getApiKey(config.id);

		if ((config.authMode ?? 'bearer') !== 'none' && !apiKey) {
			throw new Error(`Model "${config.name}" requires an API key. Run "Custom Models: Manage Models" to store one.`);
		}

		await invokeOpenAICompatibleChat({
			config,
			apiKey,
			messages: toOpenAIMessages(messages),
			tools: config.toolCalling ? options.tools : undefined,
			toolMode: options.toolMode,
			modelOptions: options.modelOptions ?? {},
			timeoutMs: this.configurationService.getRequestTimeoutMs(),
			token,
			onText: (text) => {
				if (text) {
					progress.report(new vscode.LanguageModelTextPart(text));
				}
			},
			onToolCall: (toolCall) => {
				progress.report(new vscode.LanguageModelToolCallPart(toolCall.id, toolCall.name, toolCall.input));
			},
		});
	}

	public async provideTokenCount(
		model: vscode.LanguageModelChatInformation,
		input: string | any,
		_token: vscode.CancellationToken
	): Promise<number> {
		const config = this.configurationService.getModel(model.id);
		if (!config) {
			return estimateTokenCount(input);
		}

		return Math.min(config.maxInputTokens, estimateTokenCount(input));
	}
}

function toOpenAIMessages(messages: readonly any[]): OpenAIMessage[] {
	const result: OpenAIMessage[] = [];

	for (const message of messages) {
		const role = normalizeRole(message?.role);
		const parsed = parseMessageContent(message);

		if (role === 'assistant') {
			const assistantMessage: OpenAIMessage = {
				role: 'assistant',
			};
			if (parsed.assistantToolCalls.length > 0) {
				assistantMessage.tool_calls = parsed.assistantToolCalls;
			}
			if (parsed.textParts.length > 0) {
				assistantMessage.content = parsed.textParts.join('');
			}
			result.push(assistantMessage);
			continue;
		}

		if (parsed.openAIContent !== undefined) {
			result.push({
				role,
				content: parsed.openAIContent,
			});
		}

		if (role === 'user') {
			for (const toolResult of parsed.toolResults) {
				result.push({
					role: 'tool',
					tool_call_id: toolResult.callId,
					content: toolResult.content,
				});
			}
		}
	}

	return result;
}

function parseMessageContent(message: any): {
	textParts: string[];
	openAIContent: OpenAIMessageContent | undefined;
	assistantToolCalls: OpenAIToolCall[];
	toolResults: Array<{ callId: string; content: string }>;
} {
	const parts = Array.isArray(message?.content)
		? message.content
		: typeof message?.content === 'string'
			? [new vscode.LanguageModelTextPart(message.content)]
			: [];

	const textParts: string[] = [];
	const contentParts: Array<OpenAITextContentPart | OpenAIImageContentPart> = [];
	const assistantToolCalls: OpenAIToolCall[] = [];
	const toolResults: Array<{ callId: string; content: string }> = [];

	for (const part of parts) {
		if (part instanceof vscode.LanguageModelTextPart) {
			textParts.push(part.value);
			contentParts.push({ type: 'text', text: part.value });
			continue;
		}

		if (part instanceof vscode.LanguageModelDataPart) {
			const imageUrl = toImageDataUrl(part);
			if (imageUrl) {
				contentParts.push({
					type: 'image_url',
					image_url: { url: imageUrl },
				});
			}
			continue;
		}

		if (part instanceof vscode.LanguageModelToolCallPart) {
			assistantToolCalls.push({
				id: part.callId,
				type: 'function',
				function: {
					name: part.name,
					arguments: JSON.stringify(part.input ?? {}),
				},
			});
			continue;
		}

		if (isToolResultPart(part)) {
			toolResults.push({
				callId: part.callId,
				content: serializeToolResult(part.content),
			});
		}
	}

	let openAIContent: OpenAIMessageContent | undefined;
	if (contentParts.length === 1 && contentParts[0].type === 'text') {
		openAIContent = contentParts[0].text;
	} else if (contentParts.length > 0) {
		openAIContent = contentParts;
	}

	return {
		textParts,
		openAIContent,
		assistantToolCalls,
		toolResults,
	};
}

function serializeToolResult(parts: unknown[]): string {
	const fragments: string[] = [];
	for (const part of parts) {
		if (part instanceof vscode.LanguageModelTextPart) {
			fragments.push(part.value);
			continue;
		}

		if (part instanceof vscode.LanguageModelDataPart) {
			fragments.push(`[${part.mimeType} data omitted]`);
			continue;
		}

		if (typeof part === 'string') {
			fragments.push(part);
			continue;
		}

		if (part && typeof part === 'object' && 'value' in part && typeof (part as { value?: unknown }).value === 'string') {
			fragments.push((part as { value: string }).value);
			continue;
		}

		fragments.push(JSON.stringify(part));
	}

	return fragments.join('').trim() || 'Tool completed successfully.';
}

function normalizeRole(value: unknown): 'system' | 'user' | 'assistant' {
	if (value === 3 || value === 'system') {
		return 'system';
	}
	if (value === vscode.LanguageModelChatMessageRole.Assistant || value === 'assistant') {
		return 'assistant';
	}
	return 'user';
}

function isToolResultPart(value: unknown): value is { callId: string; content: unknown[] } {
	return !!value
		&& typeof value === 'object'
		&& typeof (value as { callId?: unknown }).callId === 'string'
		&& Array.isArray((value as { content?: unknown[] }).content)
		&& !('name' in (value as Record<string, unknown>));
}

function toImageDataUrl(part: vscode.LanguageModelDataPart): string | undefined {
	if (!part.mimeType.startsWith('image/')) {
		return undefined;
	}

	return `data:${part.mimeType};base64,${Buffer.from(part.data).toString('base64')}`;
}
