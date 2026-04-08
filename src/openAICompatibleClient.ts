import * as vscode from 'vscode';
import { CustomModelConfig } from './modelTypes';

export interface OpenAIImageContentPart {
	type: 'image_url';
	image_url: {
		url: string;
	};
}

export interface OpenAITextContentPart {
	type: 'text';
	text: string;
}

export type OpenAIMessageContent = string | Array<OpenAITextContentPart | OpenAIImageContentPart>;

export interface OpenAIToolCall {
	id: string;
	type: 'function';
	function: {
		name: string;
		arguments: string;
	};
}

export interface OpenAIMessage {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content?: OpenAIMessageContent;
	name?: string;
	tool_call_id?: string;
	tool_calls?: OpenAIToolCall[];
}

export interface ParsedToolCall {
	id: string;
	name: string;
	input: object;
}

export interface OpenAICompatibleInvocation {
	config: CustomModelConfig;
	apiKey?: string;
	messages: OpenAIMessage[];
	tools?: readonly any[];
	toolMode?: unknown;
	modelOptions?: Record<string, unknown>;
	timeoutMs: number;
	token: vscode.CancellationToken;
	onText(text: string): void;
	onToolCall(toolCall: ParsedToolCall): void;
}

interface AggregatedToolCall {
	id: string;
	name: string;
	arguments: string;
}

const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.0-9A-Z^_`a-z|~]+$/;
const RESERVED_HEADERS = new Set([
	'authorization',
	'content-type',
	'content-length',
	'host',
]);

export async function invokeOpenAICompatibleChat(request: OpenAICompatibleInvocation): Promise<void> {
	const url = resolveChatCompletionsUrl(request.config);
	const controller = new AbortController();
	const timeoutHandle = setTimeout(() => controller.abort(new Error(`Request timed out after ${request.timeoutMs}ms.`)), request.timeoutMs);
	const cancellation = request.token.onCancellationRequested(() => controller.abort(new Error('Request was cancelled.')));

	try {
		const response = await fetch(url, {
			method: 'POST',
			headers: buildOpenAICompatibleHeaders(request.config, request.apiKey),
			body: JSON.stringify(buildRequestBody(request)),
			signal: controller.signal,
		});

		if (!response.ok) {
			throw new Error(await readResponseError(response));
		}

		const contentType = response.headers.get('content-type') ?? '';
		if (contentType.includes('text/event-stream')) {
			await consumeEventStream(response, request);
			return;
		}

		await consumeJsonResponse(response, request);
	} catch (error) {
		if (request.token.isCancellationRequested) {
			throw new Error('Custom model request was cancelled.');
		}

		if (error instanceof Error) {
			throw error;
		}

		throw new Error(String(error));
	} finally {
		clearTimeout(timeoutHandle);
		cancellation.dispose();
	}
}

export function estimateTokenCount(value: unknown): number {
	let text: string;
	if (typeof value === 'string') {
		text = value;
	} else {
		text = JSON.stringify(value) ?? '';
	}

	return Math.max(1, Math.ceil(text.length / 4));
}

function buildRequestBody(request: OpenAICompatibleInvocation): Record<string, unknown> {
	const body: Record<string, unknown> = {
		model: request.config.model,
		messages: request.messages,
		stream: true,
	};

	if (request.config.toolCalling && request.tools && request.tools.length > 0) {
		body.tools = request.tools.map((tool) => ({
			type: 'function',
			function: {
				name: tool.name,
				description: tool.description,
				parameters: hasSchema(tool.inputSchema)
					? tool.inputSchema
					: { type: 'object', properties: {} },
			},
		}));
	}

	const requiredToolMode = (vscode.LanguageModelChatToolMode as unknown as { Required?: unknown }).Required;
	if (body.tools && request.tools?.length === 1 && (request.toolMode === requiredToolMode || request.toolMode === 'required')) {
		body.tool_choice = {
			type: 'function',
			function: {
				name: request.tools[0].name,
			},
		};
	}

	const modelOptions = request.modelOptions ?? {};
	for (const key of ['temperature', 'top_p', 'max_tokens', 'frequency_penalty', 'presence_penalty', 'stop']) {
		const value = modelOptions[key];
		if (value !== undefined && value !== null) {
			body[key] = value;
		}
	}

	return body;
}

export function buildOpenAICompatibleHeaders(config: CustomModelConfig, apiKey?: string): Headers {
	const headers = new Headers();
	headers.set('Content-Type', 'application/json');

	for (const [key, value] of Object.entries(config.requestHeaders ?? {})) {
		if (!HEADER_NAME_PATTERN.test(key) || RESERVED_HEADERS.has(key.toLowerCase())) {
			continue;
		}
		headers.set(key, value);
	}

	const authMode = config.authMode ?? 'bearer';
	if (authMode === 'none' || !apiKey) {
		return headers;
	}

	if (authMode === 'header') {
		const headerName = config.apiKeyHeaderName?.trim() || 'x-api-key';
		if (!RESERVED_HEADERS.has(headerName.toLowerCase())) {
			headers.set(headerName, apiKey);
		}
		return headers;
	}

	headers.set('Authorization', `Bearer ${apiKey}`);
	return headers;
}

export function resolveChatCompletionsUrl(config: CustomModelConfig): string {
	const apiPath = config.apiPath?.trim();
	if (apiPath?.includes('/responses')) {
		throw new Error(`Model "${config.name}" is configured with a Responses API path. This extension currently targets Chat Completions compatible endpoints.`);
	}

	if (apiPath) {
		if (/^https?:\/\//i.test(apiPath)) {
			return apiPath;
		}
		return joinUrl(config.baseUrl, apiPath);
	}

	if (config.baseUrl.includes('/chat/completions')) {
		return config.baseUrl;
	}

	const baseUrl = config.baseUrl.endsWith('/') ? config.baseUrl.slice(0, -1) : config.baseUrl;
	if (baseUrl.endsWith('/v1')) {
		return `${baseUrl}/chat/completions`;
	}

	return `${baseUrl}/v1/chat/completions`;
}

async function consumeEventStream(response: Response, request: OpenAICompatibleInvocation): Promise<void> {
	const reader = response.body?.getReader();
	if (!reader) {
		throw new Error('Server returned an empty streaming response.');
	}

	const decoder = new TextDecoder();
	const aggregatedToolCalls = new Map<number, AggregatedToolCall>();
	let buffer = '';

	while (true) {
		const { done, value } = await reader.read();
		if (done) {
			break;
		}

		buffer += decoder.decode(value, { stream: true });
		const frames = buffer.split(/\r?\n\r?\n/);
		buffer = frames.pop() ?? '';

		for (const frame of frames) {
			const payload = extractSsePayload(frame);
			if (!payload || payload === '[DONE]') {
				continue;
			}

			const event = parseJson(payload);
			if (!event) {
				continue;
			}

			handleCompletionEvent(event, aggregatedToolCalls, request);
		}
	}

	if (buffer.trim()) {
		const payload = extractSsePayload(buffer);
		if (payload && payload !== '[DONE]') {
			const event = parseJson(payload);
			if (event) {
				handleCompletionEvent(event, aggregatedToolCalls, request);
			}
		}
	}

	flushToolCalls(aggregatedToolCalls, request);
}

async function consumeJsonResponse(response: Response, request: OpenAICompatibleInvocation): Promise<void> {
	const payload = await response.json() as Record<string, any>;
	const message = payload.choices?.[0]?.message;
	if (!message) {
		throw new Error('The provider returned a response that does not match the OpenAI chat completions format.');
	}

	const text = flattenContentText(message.content);
	if (text) {
		request.onText(text);
	}

	const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
	for (const toolCall of toolCalls) {
		const parsed = parseToolCall(toolCall.id, toolCall.function?.name, toolCall.function?.arguments);
		if (parsed) {
			request.onToolCall(parsed);
		}
	}
}

function handleCompletionEvent(
	event: Record<string, any>,
	aggregatedToolCalls: Map<number, AggregatedToolCall>,
	request: OpenAICompatibleInvocation
): void {
	const choice = event.choices?.[0];
	if (!choice) {
		return;
	}

	const delta = choice.delta ?? {};
	const content = flattenContentText(delta.content);
	if (content) {
		request.onText(content);
	}

	if (Array.isArray(delta.tool_calls)) {
		for (const toolCallDelta of delta.tool_calls) {
			const index = typeof toolCallDelta.index === 'number' ? toolCallDelta.index : 0;
			const current = aggregatedToolCalls.get(index) ?? {
				id: '',
				name: '',
				arguments: '',
			};

			if (typeof toolCallDelta.id === 'string') {
				current.id = toolCallDelta.id;
			}
			if (typeof toolCallDelta.function?.name === 'string') {
				current.name = toolCallDelta.function.name;
			}
			if (typeof toolCallDelta.function?.arguments === 'string') {
				current.arguments += toolCallDelta.function.arguments;
			}

			aggregatedToolCalls.set(index, current);
		}
	}

	if (choice.finish_reason === 'tool_calls') {
		flushToolCalls(aggregatedToolCalls, request);
	}
}

function flushToolCalls(aggregatedToolCalls: Map<number, AggregatedToolCall>, request: OpenAICompatibleInvocation): void {
	for (const [index, toolCall] of aggregatedToolCalls) {
		const parsed = parseToolCall(toolCall.id, toolCall.name, toolCall.arguments);
		if (parsed) {
			request.onToolCall(parsed);
		}
		aggregatedToolCalls.delete(index);
	}
}

function parseToolCall(id: unknown, name: unknown, rawArguments: unknown): ParsedToolCall | undefined {
	if (typeof id !== 'string' || typeof name !== 'string') {
		return undefined;
	}

	const source = typeof rawArguments === 'string' && rawArguments.trim().length > 0 ? rawArguments : '{}';
	try {
		const parsed = JSON.parse(source);
		return {
			id,
			name,
			input: typeof parsed === 'object' && parsed !== null ? parsed : {},
		};
	} catch {
		return {
			id,
			name,
			input: {},
		};
	}
}

function flattenContentText(content: unknown): string {
	if (typeof content === 'string') {
		return content;
	}

	if (!Array.isArray(content)) {
		return '';
	}

	return content
		.map((part) => {
			if (typeof part === 'string') {
				return part;
			}
			if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') {
				return (part as { text: string }).text;
			}
			return '';
		})
		.join('');
}

function extractSsePayload(frame: string): string | undefined {
	const lines = frame.split(/\r?\n/);
	const dataLines = lines
		.filter((line) => line.startsWith('data:'))
		.map((line) => line.slice(5).trim());

	if (dataLines.length === 0) {
		return undefined;
	}

	return dataLines.join('\n');
}

function parseJson(value: string): Record<string, any> | undefined {
	try {
		return JSON.parse(value) as Record<string, any>;
	} catch {
		return undefined;
	}
}

function joinUrl(baseUrl: string, path: string): string {
	const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
	const normalizedPath = path.startsWith('/') ? path : `/${path}`;
	return `${normalizedBase}${normalizedPath}`;
}

async function readResponseError(response: Response): Promise<string> {
	const bodyText = await response.text();
	if (!bodyText.trim()) {
		return `Request failed with HTTP ${response.status} ${response.statusText}.`;
	}

	try {
		const payload = JSON.parse(bodyText) as Record<string, any>;
		const message = payload.error?.message ?? payload.message;
		if (typeof message === 'string' && message.trim()) {
			return message;
		}
	} catch {
		// Ignore parse failures and fall back to raw text.
	}

	return bodyText;
}

function hasSchema(value: unknown): boolean {
	return !!value && typeof value === 'object' && Object.keys(value as Record<string, unknown>).length > 0;
}
