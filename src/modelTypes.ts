export type CustomModelAuthMode = 'bearer' | 'header' | 'none';

export const DEFAULT_API_KEY_HEADER_NAME = 'x-api-key';
export const DEFAULT_MAX_INPUT_TOKENS = 128000;
export const DEFAULT_MAX_OUTPUT_TOKENS = 8192;

export interface CustomModelConfig {
	id: string;
	name: string;
	model: string;
	providerLabel?: string;
	baseUrl: string;
	apiPath?: string;
	authMode?: CustomModelAuthMode;
	apiKeyHeaderName?: string;
	toolCalling: boolean;
	vision: boolean;
	useForGitCommitMessage: boolean;
	maxInputTokens: number;
	maxOutputTokens: number;
	requestHeaders?: Record<string, string>;
	showInModelPicker?: boolean;
}

export interface ManagedCustomModelConfig extends CustomModelConfig {
	hasApiKey: boolean;
	apiKey?: string;
}

export function createEmptyModelConfig(id = ''): CustomModelConfig {
	return {
		id,
		name: '',
		model: '',
		baseUrl: '',
		authMode: 'bearer',
		apiKeyHeaderName: DEFAULT_API_KEY_HEADER_NAME,
		toolCalling: true,
		vision: false,
		useForGitCommitMessage: false,
		maxInputTokens: DEFAULT_MAX_INPUT_TOKENS,
		maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
		showInModelPicker: true,
	};
}
