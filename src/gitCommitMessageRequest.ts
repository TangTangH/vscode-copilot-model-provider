import * as vscode from 'vscode';
import {
	buildOpenAICompatibleHeaders,
	OpenAIMessage,
	resolveChatCompletionsUrl,
} from './openAICompatibleClient';
import { pickLocalizedString } from './i18n';
import { CustomModelConfig } from './modelTypes';

interface GitCommitMessageRequest {
	config: CustomModelConfig;
	apiKey?: string;
	messages: OpenAIMessage[];
	timeoutMs: number;
	token?: vscode.CancellationToken;
}

export async function requestGitCommitMessage(request: GitCommitMessageRequest): Promise<string> {
	const controller = new AbortController();
	const timeoutHandle = setTimeout(() => controller.abort(new Error(`Request timed out after ${request.timeoutMs}ms.`)), request.timeoutMs);
	const cancellation = request.token?.onCancellationRequested(() => controller.abort(new Error('Request was cancelled.')));

	try {
		const response = await fetch(resolveChatCompletionsUrl(request.config), {
			method: 'POST',
			headers: buildOpenAICompatibleHeaders(request.config, request.apiKey),
			body: JSON.stringify({
				model: request.config.model,
				messages: request.messages,
			}),
			signal: controller.signal,
		});

		const responseText = await response.text();
		if (!response.ok) {
			throw new Error(formatRequestError(response.status, responseText));
		}

		let payload: unknown;
		try {
			payload = JSON.parse(responseText) as unknown;
		} catch {
			throw new Error(
				pickLocalizedString({
					en: `The endpoint returned a successful response, but the body was not valid JSON: ${summarizeResponseBody(responseText)}`,
					zh: `接口已成功返回响应，但响应体不是合法的 JSON：${summarizeResponseBody(responseText)}`,
				}),
			);
		}

		const content = extractCommitMessageText(payload);
		if (!content) {
			throw new Error(
				pickLocalizedString({
					en: `The endpoint returned a successful response, but no text content was found: ${summarizeResponseBody(responseText)}`,
					zh: `接口已成功返回响应，但没有找到文本内容：${summarizeResponseBody(responseText)}`,
				}),
			);
		}

		return content;
	} catch (error) {
		if (request.token?.isCancellationRequested) {
			throw new vscode.CancellationError();
		}

		if (error instanceof Error) {
			throw error;
		}

		throw new Error(String(error));
	} finally {
		clearTimeout(timeoutHandle);
		cancellation?.dispose();
	}
}

function extractCommitMessageText(payload: unknown): string | undefined {
	if (!payload || typeof payload !== 'object') {
		return undefined;
	}

	const record = payload as Record<string, unknown>;
	const choices = Array.isArray(record.choices) ? record.choices : [];
	if (choices.length === 0 || !choices[0] || typeof choices[0] !== 'object') {
		return undefined;
	}

	const choice = choices[0] as Record<string, unknown>;
	const message = choice.message;
	if (message && typeof message === 'object') {
		const content = flattenContentText((message as Record<string, unknown>).content);
		if (content) {
			return content;
		}
	}

	return flattenContentText(choice.text);
}

function flattenContentText(content: unknown): string {
	if (typeof content === 'string') {
		return content.trim();
	}

	if (!Array.isArray(content)) {
		return '';
	}

	return content
		.map((part) => {
			if (typeof part === 'string') {
				return part;
			}
			if (part && typeof part === 'object') {
				const text = (part as { text?: unknown }).text;
				return typeof text === 'string' ? text : '';
			}
			return '';
		})
		.join('')
		.trim();
}

function formatRequestError(status: number, body: string): string {
	return pickLocalizedString({
		en: `Request failed (${status}): ${formatErrorBody(body)}`,
		zh: `请求失败（${status}）：${formatErrorBody(body)}`,
	});
}

function formatErrorBody(body: string): string {
	const trimmed = body.trim();
	if (!trimmed) {
		return pickLocalizedString({
			en: 'Request failed with an empty response body.',
			zh: '请求失败，且响应体为空。',
		});
	}

	try {
		const parsed = JSON.parse(trimmed) as Record<string, unknown>;
		const error = parsed.error as Record<string, unknown> | undefined;
		if (typeof error?.message === 'string' && error.message.trim()) {
			return error.message;
		}

		if (typeof parsed.message === 'string' && parsed.message.trim()) {
			return parsed.message;
		}
	} catch {
		// Fall through to the raw body.
	}

	return trimmed;
}

function summarizeResponseBody(body: string): string {
	const trimmed = body.trim();
	if (!trimmed) {
		return pickLocalizedString({
			en: '(empty response body)',
			zh: '（响应体为空）',
		});
	}

	const singleLine = trimmed.replace(/\s+/g, ' ');
	return singleLine.length > 240 ? `${singleLine.slice(0, 240)}...` : singleLine;
}
