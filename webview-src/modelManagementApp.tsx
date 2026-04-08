import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import {
	App as AntApp,
	Button,
	Card,
	ConfigProvider,
	Empty,
	Form,
	Input,
	InputNumber,
	Layout,
	Select,
	Switch,
	theme as antdTheme,
} from 'antd';
import type { ModelManagementResponse } from '../src/modelManagementProtocol';
import {
	createEmptyModelConfig,
	CustomModelAuthMode,
	type CustomModelConfig,
	type ManagedCustomModelConfig,
	DEFAULT_API_KEY_HEADER_NAME,
	DEFAULT_MAX_INPUT_TOKENS,
	DEFAULT_MAX_OUTPUT_TOKENS,
} from '../src/modelTypes';
import './modelManagementApp.css';

declare global {
	interface Window {
		__CUSTOM_MODELS_NONCE__?: string;
		acquireVsCodeApi?: () => VsCodeApi;
	}
}

interface VsCodeApi {
	postMessage(message: unknown): void;
	getState(): unknown;
	setState(state: unknown): void;
}

// ─── i18n ────────────────────────────────────────────────────────────────────

type Lang = 'zh' | 'en';

interface T {
	sectionKicker: string;
	pageTitle: string;
	pageSubtitle: string;
	newModel: string;
	savedModelsCount(n: number): string;
	openSettingsJson: string;
	unsavedNewModel: string;
	appearAfterSave: string;
	fillBasicInfoFirst: string;
	noSavedModels: string;
	unnamedModel: string;
	upstreamModelNotFilled: string;
	modelPrefix: string;
	newModelTitle: string;
	modelDetails: string;
	unsaved: string;
	dirtyChanges: string;
	saved: string;
	newModelDesc: string;
	editModelDesc: string;
	deleteModel: string;
	saveConfig: string;
	basicInfo: string;
	apiConfig: string;
	capabilitiesQuota: string;
	advancedHeaders: string;
	modelId: string;
	modelIdHelp: string;
	modelIdPlaceholder: string;
	displayName: string;
	displayNamePlaceholder: string;
	upstreamModel: string;
	upstreamModelHelp: string;
	upstreamModelPlaceholder: string;
	sourceLabel: string;
	sourceLabelHelp: string;
	sourceLabelPlaceholder: string;
	baseUrl: string;
	baseUrlHelp: string;
	baseUrlPlaceholder: string;
	apiPath: string;
	apiPathHelp: string;
	apiPathPlaceholder: string;
	authMode: string;
	apiKeyHeader: string;
	apiKeyHeaderHelp: string;
	apiKeyHeaderDisabledHelp: string;
	maxInputTokens: string;
	maxOutputTokens: string;
	showInModelPicker: string;
	showInModelPickerDesc: string;
	toolCalling: string;
	toolCallingDesc: string;
	vision: string;
	visionDesc: string;
	gitCommitMessageModel: string;
	gitCommitMessageModelDesc: string;
	apiKey: string;
	disabledLabel: string;
	apiKeySaved: string;
	apiKeyNotSet: string;
	noAuthNote: string;
	apiKeySaveHelp: string;
	apiKeyInputPlaceholder: string;
	apiKeyOverwritePlaceholder: string;
	requestHeaders: string;
	requestHeadersHelp: string;
	toolCallingBadge: string;
	textOnlyBadge: string;
	visionBadge: string;
	noVisionBadge: string;
	visibleBadge: string;
	hiddenBadge: string;
	hasKeyBadge: string;
	noKeyBadge: string;
	noKeyNeededBadge: string;
	gitCommitBadge: string;
	dirtyBadge: string;
	discardTitle: string;
	discardContent: string;
	discardOk: string;
	discardCancel: string;
	deleteModelTitle: string;
	deleteModelContent: string;
	deleteOk: string;
	deleteCancel: string;
		fillRequired: string;
		modelIdRequired: string;
	modelIdDuplicate: string;
	nameRequired: string;
	upstreamModelRequired: string;
	baseUrlRequired: string;
	baseUrlInvalid: string;
	apiKeyHeaderRequired: string;
	tokenPositive: string;
	headersNotObject: string;
	headersStringValues: string;
	headersInvalidJson: string;
	authBearer: string;
	authHeader: string;
	authNone: string;
	optionalLabel: string;
	langToggle: string;
}

const translations: Record<Lang, T> = {
	zh: {
		sectionKicker: 'Custom Models',
		pageTitle: '模型管理',
		pageSubtitle: '把模型配置、能力开关和 API Key 放到一个页面里维护。',
		newModel: '新建模型',
		savedModelsCount: (n) => `${n} 个已保存模型`,
		openSettingsJson: '打开 settings.json',
		unsavedNewModel: '未保存的新模型',
		appearAfterSave: '保存后会出现在这里',
		fillBasicInfoFirst: '先填写基本信息，再保存',
		noSavedModels: '还没有已保存的模型',
		unnamedModel: '未命名模型',
		upstreamModelNotFilled: '尚未填写上游模型名',
		modelPrefix: '模型：',
		newModelTitle: '新建模型',
		modelDetails: '模型详情',
		unsaved: '未保存',
		dirtyChanges: '有未保存修改',
		saved: '已保存',
		newModelDesc: '先完成基础配置并保存，随后可以在这里单独录入 API Key。',
		editModelDesc: '改动不会自动写入设置，确认后再点击保存。',
		deleteModel: '删除模型',
		saveConfig: '保存配置',
		basicInfo: '基本信息',
		apiConfig: '接口配置',
		capabilitiesQuota: '能力与配额',
		advancedHeaders: '高级请求头',
		modelId: '模型 ID',
		modelIdHelp: '本地唯一标识。保存后不建议再改。',
		modelIdPlaceholder: '例如 deepseek-siliconflow',
		displayName: '显示名称',
		displayNamePlaceholder: '例如 DeepSeek Chat',
		upstreamModel: '上游模型名',
		upstreamModelHelp: '会原样写入请求体的 model 字段。',
		upstreamModelPlaceholder: '例如 deepseek-ai/DeepSeek-V3',
		sourceLabel: '来源标签',
		sourceLabelHelp: '可选，只用于界面展示。',
		sourceLabelPlaceholder: '例如 SiliconFlow',
		baseUrl: 'Base URL',
		baseUrlHelp: '支持填写服务根地址或完整 /chat/completions 接口地址。',
		baseUrlPlaceholder: 'https://api.example.com',
		apiPath: 'API Path',
		apiPathHelp: '可选。留空时自动补全为 /v1/chat/completions。',
		apiPathPlaceholder: '/v1/chat/completions',
		authMode: '鉴权方式',
		apiKeyHeader: 'API Key Header',
		apiKeyHeaderHelp: '仅在"自定义 Header"模式下生效。',
		apiKeyHeaderDisabledHelp: '当前鉴权方式不会用到这个字段。',
		maxInputTokens: '最大输入 Token',
		maxOutputTokens: '最大输出 Token',
		showInModelPicker: '显示在模型选择器',
		showInModelPickerDesc: '关闭后不会出现在 VS Code 的模型列表中。',
		toolCalling: '工具调用',
		toolCallingDesc: '允许向上游发送 tools / tool_choice。',
		vision: '视觉输入',
		visionDesc: '允许把图片作为 image_url 内容发送给上游。',
		gitCommitMessageModel: '作为 Git 提交信息模型',
		gitCommitMessageModelDesc: '开启后，这个模型会用于生成 Git 提交信息；保存时会自动关闭其他模型上的同类开关。',
		apiKey: 'API Key',
		disabledLabel: '已停用',
		apiKeySaved: '已保存',
		apiKeyNotSet: '未设置',
		noAuthNote: '当前模型未启用 API Key 鉴权，扩展不会发送密钥。',
		apiKeySaveHelp: '与顶部保存按钮一起保存。留空并保存会清除已保存密钥。',
		apiKeyInputPlaceholder: '输入 API Key',
		apiKeyOverwritePlaceholder: '输入新密钥会覆盖现有值',
		requestHeaders: 'Request Headers',
		requestHeadersHelp: '可选，填写 JSON 对象，例如 {"HTTP-Referer":"https://example.com"}。',
		toolCallingBadge: '工具调用',
		textOnlyBadge: '纯文本',
		visionBadge: '视觉',
		noVisionBadge: '无视觉',
		visibleBadge: '可见',
		hiddenBadge: '隐藏',
		hasKeyBadge: '已存密钥',
		noKeyBadge: '未存密钥',
		noKeyNeededBadge: '免密钥',
		gitCommitBadge: 'Git 生成',
		dirtyBadge: '未保存',
		discardTitle: '放弃当前未保存内容？',
		discardContent: '当前表单或 API Key 输入框里还有未保存的修改，切换后会丢失这些内容。',
		discardOk: '放弃修改',
		discardCancel: '继续编辑',
		deleteModelTitle: '删除当前模型？',
		deleteModelContent: '模型配置和已保存的 API Key 都会被删除。',
		deleteOk: '删除',
		deleteCancel: '取消',
		fillRequired: '请先补全必填字段。',
		modelIdRequired: '请填写模型 ID。',
		modelIdDuplicate: '这个模型 ID 已存在。',
		nameRequired: '请填写显示名称。',
		upstreamModelRequired: '请填写上游模型名。',
		baseUrlRequired: '请填写 Base URL。',
		baseUrlInvalid: 'Base URL 必须是有效的 http(s) 地址。',
		apiKeyHeaderRequired: '自定义 Header 模式下必须填写请求头名称。',
		tokenPositive: '请输入大于 0 的整数。',
		headersNotObject: 'Request Headers 需要是 JSON 对象。',
		headersStringValues: 'Request Headers 的 key 和 value 都必须是非空字符串。',
		headersInvalidJson: 'Request Headers 不是合法的 JSON。',
		authBearer: 'Bearer Token',
		authHeader: '自定义 Header',
		authNone: '不使用 API Key',
		optionalLabel: '可选',
		langToggle: 'EN',
	},
	en: {
		sectionKicker: 'Custom Models',
		pageTitle: 'Model Management',
		pageSubtitle: 'Manage model configs, capability switches, and API keys in one place.',
		newModel: 'New Model',
		savedModelsCount: (n) => `${n} saved model${n !== 1 ? 's' : ''}`,
		openSettingsJson: 'Open settings.json',
		unsavedNewModel: 'Unsaved New Model',
		appearAfterSave: 'Will appear here after saving',
		fillBasicInfoFirst: 'Fill in basic info, then save',
		noSavedModels: 'No saved models yet',
		unnamedModel: 'Unnamed Model',
		upstreamModelNotFilled: 'Upstream model name not set',
		modelPrefix: 'Model: ',
		newModelTitle: 'New Model',
		modelDetails: 'Model Details',
		unsaved: 'Unsaved',
		dirtyChanges: 'Unsaved Changes',
		saved: 'Saved',
		newModelDesc: 'Complete basic config and save first, then enter the API key here.',
		editModelDesc: 'Changes are not saved automatically — confirm and click Save.',
		deleteModel: 'Delete Model',
		saveConfig: 'Save Config',
		basicInfo: 'Basic Info',
		apiConfig: 'API Config',
		capabilitiesQuota: 'Capabilities & Quota',
		advancedHeaders: 'Advanced Headers',
		modelId: 'Model ID',
		modelIdHelp: 'Locally unique identifier. Avoid changing after saving.',
		modelIdPlaceholder: 'e.g. deepseek-siliconflow',
		displayName: 'Display Name',
		displayNamePlaceholder: 'e.g. DeepSeek Chat',
		upstreamModel: 'Upstream Model',
		upstreamModelHelp: "Written as-is into the request body's model field.",
		upstreamModelPlaceholder: 'e.g. deepseek-ai/DeepSeek-V3',
		sourceLabel: 'Source Label',
		sourceLabelHelp: 'Optional, used for display only.',
		sourceLabelPlaceholder: 'e.g. SiliconFlow',
		baseUrl: 'Base URL',
		baseUrlHelp: 'Can be the service root URL or full /chat/completions endpoint.',
		baseUrlPlaceholder: 'https://api.example.com',
		apiPath: 'API Path',
		apiPathHelp: 'Optional. Defaults to /v1/chat/completions if left empty.',
		apiPathPlaceholder: '/v1/chat/completions',
		authMode: 'Auth Mode',
		apiKeyHeader: 'API Key Header',
		apiKeyHeaderHelp: 'Only effective in "Custom Header" mode.',
		apiKeyHeaderDisabledHelp: 'Not used by the current auth mode.',
		maxInputTokens: 'Max Input Tokens',
		maxOutputTokens: 'Max Output Tokens',
		showInModelPicker: 'Show in Model Picker',
		showInModelPickerDesc: "When off, won't appear in VS Code's model list.",
		toolCalling: 'Tool Calling',
		toolCallingDesc: 'Allows sending tools / tool_choice to upstream.',
		vision: 'Vision Input',
		visionDesc: 'Allows sending images as image_url content to upstream.',
		gitCommitMessageModel: 'Use for Git commits',
		gitCommitMessageModelDesc: 'When enabled, this model will generate Git commit messages, and saving it will turn the switch off on every other model.',
		apiKey: 'API Key',
		disabledLabel: 'Disabled',
		apiKeySaved: 'Saved',
		apiKeyNotSet: 'Not Set',
		noAuthNote: 'API key auth is not enabled — no key will be sent.',
		apiKeySaveHelp: 'Saved together with the main Save button. Leave empty and save to clear the stored key.',
		apiKeyInputPlaceholder: 'Enter API Key',
		apiKeyOverwritePlaceholder: 'Enter new key to overwrite existing',
		requestHeaders: 'Request Headers',
		requestHeadersHelp: 'Optional. JSON object, e.g. {"HTTP-Referer":"https://example.com"}.',
		toolCallingBadge: 'Tools',
		textOnlyBadge: 'Text Only',
		visionBadge: 'Vision',
		noVisionBadge: 'No Vision',
		visibleBadge: 'Visible',
		hiddenBadge: 'Hidden',
		hasKeyBadge: 'Key Stored',
		noKeyBadge: 'No Key',
		noKeyNeededBadge: 'No Auth',
		gitCommitBadge: 'Git Commit',
		dirtyBadge: 'Unsaved',
		discardTitle: 'Discard unsaved changes?',
		discardContent: "The form or API key input has unsaved changes. They'll be lost if you switch.",
		discardOk: 'Discard',
		discardCancel: 'Keep Editing',
		deleteModelTitle: 'Delete this model?',
		deleteModelContent: 'The model config and saved API key will both be deleted.',
		deleteOk: 'Delete',
		deleteCancel: 'Cancel',
		fillRequired: 'Please fill in all required fields.',
		modelIdRequired: 'Please enter a model ID.',
		modelIdDuplicate: 'This model ID already exists.',
		nameRequired: 'Please enter a display name.',
		upstreamModelRequired: 'Please enter the upstream model name.',
		baseUrlRequired: 'Please enter a Base URL.',
		baseUrlInvalid: 'Base URL must be a valid http(s) address.',
		apiKeyHeaderRequired: 'Header name is required in Custom Header mode.',
		tokenPositive: 'Please enter a positive integer.',
		headersNotObject: 'Request Headers must be a JSON object.',
		headersStringValues: 'Request Headers keys and values must be non-empty strings.',
		headersInvalidJson: 'Request Headers is not valid JSON.',
		authBearer: 'Bearer Token',
		authHeader: 'Custom Header',
		authNone: 'No API Key',
		optionalLabel: 'optional',
		langToggle: '中文',
	},
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface DraftModel {
	id: string;
	name: string;
	model: string;
	providerLabel: string;
	baseUrl: string;
	apiPath: string;
	authMode: CustomModelAuthMode;
	apiKeyHeaderName: string;
	toolCalling: boolean;
	vision: boolean;
	useForGitCommitMessage: boolean;
	maxInputTokens: number | null;
	maxOutputTokens: number | null;
	requestHeadersText: string;
	showInModelPicker: boolean;
}

interface EditorSession {
	mode: 'new' | 'existing';
	savedId?: string;
	draft: DraftModel;
	baseline: DraftModel;
	hasApiKey: boolean;
	savedApiKey: string;
}

type DraftErrors = Partial<Record<keyof DraftModel, string>>;

type HeadersParseError = 'not-object' | 'invalid-values' | 'invalid-json';

// ─── VSCode API ───────────────────────────────────────────────────────────────

const vscode = window.acquireVsCodeApi?.() ?? {
	postMessage: () => undefined,
	getState: () => undefined,
	setState: () => undefined,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isDarkTheme(): boolean {
	return document.body.classList.contains('vscode-dark') || document.body.classList.contains('vscode-high-contrast');
}

function buildAntTheme(dark: boolean) {
	const s = getComputedStyle(document.body);
	const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;

	const primary = v('--vscode-button-background', dark ? '#0078d4' : '#0078d4');
	const bgBase = v('--vscode-editor-background', dark ? '#1e1e1e' : '#ffffff');
	const textBase = v('--vscode-foreground', dark ? '#cccccc' : '#333333');
	const border = v('--vscode-widget-border', dark ? '#454545' : '#e0e0e0');
	const fontFamily = v('--vscode-font-family', '"Segoe UI", system-ui, sans-serif');

	return {
		algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
		token: {
			fontFamily,
			colorPrimary: primary,
			colorBgBase: bgBase,
			colorTextBase: textBase,
			colorBorder: border,
			borderRadius: 8,
		},
		components: {
			Button: { controlHeight: 34 },
			Card: { headerBg: 'transparent' },
			Input: { activeBorderColor: primary },
			Select: { activeBorderColor: primary },
			InputNumber: { activeBorderColor: primary },
		},
	};
}

const Sider = Layout.Sider;
const Content = Layout.Content;

// ─── Main component ───────────────────────────────────────────────────────────

function ModelManagementApp() {
	const [lang, setLang] = useState<Lang>(() => {
		try {
			const stored = localStorage.getItem('model-mgmt-lang');
			return stored === 'en' ? 'en' : 'zh';
		} catch {
			return 'zh';
		}
	});
	const t = translations[lang];

	const [models, setModels] = useState<ManagedCustomModelConfig[]>([]);
	const [editor, setEditorState] = useState<EditorSession>(() => createNewEditorSession());
	const [apiKeyInput, setApiKeyInput] = useState('');
	const [errors, setErrors] = useState<DraftErrors>({});
	const [savingModel, setSavingModel] = useState(false);
	const [deletingModel, setDeletingModel] = useState(false);
	const editorRef = useRef(editor);
	const apiKeyInputRef = useRef(apiKeyInput);
	const { message, modal } = AntApp.useApp();

	function toggleLang(): void {
		const next: Lang = lang === 'zh' ? 'en' : 'zh';
		setLang(next);
		try { localStorage.setItem('model-mgmt-lang', next); } catch { /* ignore */ }
	}

	function updateEditor(nextEditor: EditorSession): void {
		editorRef.current = nextEditor;
		setEditorState(nextEditor);
	}

	function resetTransientState(): void {
		setSavingModel(false);
		setDeletingModel(false);
		setErrors({});
	}

	function applyHydratedState(nextModels: ManagedCustomModelConfig[], preferredId?: string): void {
		const nextEditor = createEditorSessionFromState(nextModels, preferredId, editorRef.current);
		setModels(nextModels);
		updateEditor(nextEditor);
		setApiKeyInput(nextEditor.savedApiKey);
		apiKeyInputRef.current = nextEditor.savedApiKey;
		resetTransientState();
	}

	function showNotice(kind: 'success' | 'error', content: string): void {
		if (kind === 'success') {
			void message.success(content);
			return;
		}
		void message.error(content);
	}

	function applyVisibilityUpdate(id: string, showInModelPicker: boolean): void {
		setModels((currentModels) => currentModels.map((model) => (
			model.id === id
				? { ...model, showInModelPicker }
				: model
		)));

		if (editorRef.current.mode === 'existing' && editorRef.current.savedId === id) {
			const nextEditor: EditorSession = {
				...editorRef.current,
				draft: {
					...editorRef.current.draft,
					showInModelPicker,
				},
				baseline: {
					...editorRef.current.baseline,
					showInModelPicker,
				},
			};
			updateEditor(nextEditor);
		}
	}

	useEffect(() => {
		const handleMessage = (event: MessageEvent<ModelManagementResponse>) => {
			const payload = event.data;
			if (!payload) return;

			if (payload.type === 'notice') {
				setSavingModel(false);
				setDeletingModel(false);
				showNotice(payload.notice.kind, payload.notice.message);
				return;
			}

			if (payload.type === 'update-model-visibility') {
				applyVisibilityUpdate(payload.id, payload.showInModelPicker);
				return;
			}

			applyHydratedState(payload.state.models, payload.selectedId);
			if (payload.notice) {
				showNotice(payload.notice.kind, payload.notice.message);
			}
		};

		window.addEventListener('message', handleMessage);
		vscode.postMessage({ type: 'ready' });
		return () => { window.removeEventListener('message', handleMessage); };
	}, []);

	async function confirmDiscardIfNeeded(): Promise<boolean> {
		if (!isEditorDirty(editorRef.current, apiKeyInputRef.current)) return true;

		return new Promise((resolve) => {
			let resolved = false;
			const finish = (value: boolean) => { if (!resolved) { resolved = true; resolve(value); } };

			modal.confirm({
				title: t.discardTitle,
				content: t.discardContent,
				okText: t.discardOk,
				cancelText: t.discardCancel,
				onOk: () => finish(true),
				onCancel: () => finish(false),
			});
		});
	}

	async function handleSelectExisting(modelId: string): Promise<void> {
		if (!(await confirmDiscardIfNeeded())) return;

		const nextModel = models.find((candidate) => candidate.id === modelId);
		if (!nextModel) return;

		const nextEditor = createExistingEditorSession(nextModel);
		updateEditor(nextEditor);
		setApiKeyInput(nextEditor.savedApiKey);
		apiKeyInputRef.current = nextEditor.savedApiKey;
		setErrors({});
	}

	async function handleCreateModel(): Promise<void> {
		if (!(await confirmDiscardIfNeeded())) return;

		const nextEditor = createNewEditorSession();
		updateEditor(nextEditor);
		setApiKeyInput(nextEditor.savedApiKey);
		apiKeyInputRef.current = nextEditor.savedApiKey;
		setErrors({});
	}

	async function handleDeleteModel(): Promise<void> {
		if (editor.mode !== 'existing' || !editor.savedId) return;

		const confirmed = await new Promise<boolean>((resolve) => {
			let resolved = false;
			const finish = (value: boolean) => { if (!resolved) { resolved = true; resolve(value); } };

			modal.confirm({
				title: t.deleteModelTitle,
				content: t.deleteModelContent,
				okText: t.deleteOk,
				cancelText: t.deleteCancel,
				okButtonProps: { danger: true },
				onOk: () => finish(true),
				onCancel: () => finish(false),
			});
		});

		if (!confirmed) return;

		setDeletingModel(true);
		vscode.postMessage({ type: 'delete-model', id: editor.savedId });
	}

	function handleDraftChange<K extends keyof DraftModel>(key: K, value: DraftModel[K]): void {
		updateEditor({ ...editor, draft: { ...editor.draft, [key]: value } });
		if (errors[key]) {
			setErrors({ ...errors, [key]: undefined });
		}
	}

	function handleVisibilityToggle(id: string, checked: boolean): void {
		if (editor.mode === 'new' && !editor.savedId) {
			handleDraftChange('showInModelPicker', checked);
			return;
		}

		applyVisibilityUpdate(id, checked);
		vscode.postMessage({
			type: 'set-model-visibility',
			id,
			showInModelPicker: checked,
		});
	}

	function handleSaveModel(): void {
		const validation = validateDraft(editor.draft, models, editor.mode === 'existing' ? editor.savedId : undefined, t);
		if (Object.keys(validation).length > 0) {
			setErrors(validation);
			void message.error(t.fillRequired);
			return;
		}

		setSavingModel(true);
		vscode.postMessage({
			type: 'save-model',
			model: toModelConfig(editor.draft),
			apiKey: apiKeyInput,
		});
	}

	const dirty = isEditorDirty(editor, apiKeyInput);
	const activePreview = toManagedModelPreview(editor);
	const effectiveGitCommitMessageModelId = resolveGitCommitMessageModelId(models, editor);
	const authModeOptions = [
		{ label: t.authBearer, value: 'bearer' as const },
		{ label: t.authHeader, value: 'header' as const },
		{ label: t.authNone, value: 'none' as const },
	];

	const statusLabel = editor.mode === 'new' ? t.unsaved : dirty ? t.dirtyChanges : t.saved;
	const statusClass = editor.mode === 'new' ? 'status-new' : dirty ? 'status-dirty' : 'status-saved';
	const headerTitle = formatModelListTitle(
		editor.draft,
		editor.mode === 'new' ? t.newModelTitle : t.modelDetails
	);
	const renderRequiredMark = (label: ReactNode, info: { required: boolean }) => (
		<span className="form-label-with-optional">
			<span>{label}</span>
			{info.required ? null : <span className="optional-mark">({t.optionalLabel})</span>}
		</span>
	);

	return (
		<div className="management-shell">
			<Layout className="management-layout">
				<Sider width={300} theme="light" className="management-sider">
					<div className="sider-header">
						<div className="sider-header-top">
							<div className="section-kicker">{t.sectionKicker}</div>
							<button type="button" className="lang-toggle" onClick={toggleLang}>
								{t.langToggle}
							</button>
						</div>
						<div>
							<h1 className="page-title">{t.pageTitle}</h1>
							<p className="page-subtitle">{t.pageSubtitle}</p>
						</div>
						<Button type="primary" onClick={() => void handleCreateModel()}>
							{t.newModel}
						</Button>
					</div>

					<div className="sider-meta">
						<span>{t.savedModelsCount(models.length)}</span>
						<button
							type="button"
							className="settings-link"
							onClick={() => vscode.postMessage({ type: 'open-settings-json' })}
						>
							{t.openSettingsJson}
						</button>
					</div>

					<div className="model-list">
						{editor.mode === 'new' ? (
							<ModelListItem
								active
								title={formatModelListTitle(activePreview, t.unsavedNewModel)}
								subtitle={formatModelListSubtitle(activePreview, t)}
								badges={buildBadges(activePreview, editor.hasApiKey, dirty, t)}
								visibilityControl={{
									checked: editor.draft.showInModelPicker,
									onChange: (checked) => handleVisibilityToggle(editor.savedId ?? editor.draft.id, checked),
								}}
								onClick={() => undefined}
							/>
						) : null}

						{models.length === 0 ? (
							<div className="list-empty">
								<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t.noSavedModels} />
							</div>
						) : (
							models.map((model) => {
								const isActive = editor.mode === 'existing' && editor.savedId === model.id;
								const preview = isActive
									? activePreview
									: {
										...model,
										useForGitCommitMessage: model.id === effectiveGitCommitMessageModelId,
									};

								return (
									<ModelListItem
										key={model.id}
										active={isActive}
										title={formatModelListTitle(preview, t.unnamedModel)}
										subtitle={formatModelListSubtitle(preview, t)}
										badges={(isActive
											? buildBadges(preview, editor.hasApiKey, dirty, t)
											: buildBadges(preview, model.hasApiKey, false, t))}
										visibilityControl={{
											checked: isActive ? editor.draft.showInModelPicker : (model.showInModelPicker ?? true),
											onChange: (checked) => handleVisibilityToggle(model.id, checked),
										}}
										onClick={() => void handleSelectExisting(model.id)}
									/>
								);
							})
						)}
					</div>
				</Sider>

				<Content className="management-content">
					<div className="content-scroll">
						<div className="content-header">
							<div>
								<div className="content-title-row">
									<h2 className="content-title">{headerTitle}</h2>
									<span className={`status-pill ${statusClass}`}>{statusLabel}</span>
								</div>
								<p className="content-description">
									{editor.mode === 'new' ? t.newModelDesc : t.editModelDesc}
								</p>
							</div>

							<div className="header-actions">
								{editor.mode === 'existing' ? (
									<Button danger onClick={() => void handleDeleteModel()} loading={deletingModel}>
										{t.deleteModel}
									</Button>
								) : null}
								<Button type="primary" onClick={handleSaveModel} loading={savingModel}>
									{t.saveConfig}
								</Button>
							</div>
						</div>

						<Form layout="vertical" requiredMark={renderRequiredMark} className="form-sections">
							<Card title={t.basicInfo} size="small">
								<div className="field-grid field-grid-two">
									<Form.Item
										label={t.modelId}
										validateStatus={errors.id ? 'error' : ''}
										help={errors.id ?? t.modelIdHelp}
									>
										<Input
											value={editor.draft.id}
											disabled={editor.mode === 'existing'}
											allowClear={editor.mode === 'new'}
											placeholder={t.modelIdPlaceholder}
											onChange={(e) => handleDraftChange('id', e.target.value)}
										/>
									</Form.Item>

									<Form.Item
										label={t.displayName}
										validateStatus={errors.name ? 'error' : ''}
										help={errors.name}
									>
										<Input
											value={editor.draft.name}
											allowClear
											placeholder={t.displayNamePlaceholder}
											onChange={(e) => handleDraftChange('name', e.target.value)}
										/>
									</Form.Item>

									<Form.Item
										label={t.upstreamModel}
										validateStatus={errors.model ? 'error' : ''}
										help={errors.model ?? t.upstreamModelHelp}
									>
										<Input
											value={editor.draft.model}
											allowClear
											placeholder={t.upstreamModelPlaceholder}
											onChange={(e) => handleDraftChange('model', e.target.value)}
										/>
									</Form.Item>

									<Form.Item label={t.sourceLabel} help={t.sourceLabelHelp}>
										<Input
											value={editor.draft.providerLabel}
											allowClear
											placeholder={t.sourceLabelPlaceholder}
											onChange={(e) => handleDraftChange('providerLabel', e.target.value)}
										/>
									</Form.Item>
								</div>
							</Card>

							<Card title={t.apiConfig} size="small">
								<div className="field-grid field-grid-two">
									<Form.Item
										label={t.baseUrl}
										validateStatus={errors.baseUrl ? 'error' : ''}
										help={errors.baseUrl ?? t.baseUrlHelp}
									>
										<Input
											value={editor.draft.baseUrl}
											allowClear
											placeholder={t.baseUrlPlaceholder}
											onChange={(e) => handleDraftChange('baseUrl', e.target.value)}
										/>
									</Form.Item>

									<Form.Item label={t.apiPath} help={t.apiPathHelp}>
										<Input
											value={editor.draft.apiPath}
											allowClear
											placeholder={t.apiPathPlaceholder}
											onChange={(e) => handleDraftChange('apiPath', e.target.value)}
										/>
									</Form.Item>

									<Form.Item label={t.authMode}>
										<Select
											value={editor.draft.authMode}
											options={authModeOptions}
											onChange={(value) => handleDraftChange('authMode', value)}
										/>
									</Form.Item>

									<Form.Item
										label={t.apiKeyHeader}
										validateStatus={errors.apiKeyHeaderName ? 'error' : ''}
										help={
											editor.draft.authMode === 'header'
												? errors.apiKeyHeaderName ?? t.apiKeyHeaderHelp
												: t.apiKeyHeaderDisabledHelp
										}
									>
										<Input
											value={editor.draft.apiKeyHeaderName}
											allowClear
											disabled={editor.draft.authMode !== 'header'}
											placeholder={DEFAULT_API_KEY_HEADER_NAME}
											onChange={(e) => handleDraftChange('apiKeyHeaderName', e.target.value)}
										/>
									</Form.Item>

									<div className="api-key-config">
										<div className="api-key-config-header">
											<div className="api-key-config-title-row">
												<span className="api-key-config-title">{t.apiKey}</span>
												<span className="optional-mark">({t.optionalLabel})</span>
											</div>
										</div>

										{editor.draft.authMode === 'none' ? (
											<p className="field-note">{t.noAuthNote}</p>
										) : (
											<div className="api-key-section">
												<Input.Password
													value={apiKeyInput}
													placeholder={editor.hasApiKey ? t.apiKeyOverwritePlaceholder : t.apiKeyInputPlaceholder}
													onChange={(e) => {
														setApiKeyInput(e.target.value);
														apiKeyInputRef.current = e.target.value;
													}}
												/>
											</div>
										)}
									</div>
								</div>
							</Card>

							<Card title={t.capabilitiesQuota} size="small">
								<div className="capability-grid">
									<Form.Item
										className="capability-field"
										label={t.maxInputTokens}
										validateStatus={errors.maxInputTokens ? 'error' : ''}
										help={errors.maxInputTokens}
									>
										<InputNumber
											value={editor.draft.maxInputTokens}
											min={1}
											changeOnBlur
											controls={false}
											style={{ width: '100%' }}
											onChange={(value) => handleDraftChange('maxInputTokens', typeof value === 'number' ? Math.floor(value) : null)}
										/>
									</Form.Item>

									<Form.Item
										className="capability-field"
										label={t.maxOutputTokens}
										validateStatus={errors.maxOutputTokens ? 'error' : ''}
										help={errors.maxOutputTokens}
									>
										<InputNumber
											value={editor.draft.maxOutputTokens}
											min={1}
											changeOnBlur
											controls={false}
											style={{ width: '100%' }}
											onChange={(value) => handleDraftChange('maxOutputTokens', typeof value === 'number' ? Math.floor(value) : null)}
										/>
									</Form.Item>

									<ToggleRow
										label={t.toolCalling}
										description={t.toolCallingDesc}
										checked={editor.draft.toolCalling}
										onChange={(checked) => handleDraftChange('toolCalling', checked)}
									/>
									<ToggleRow
										label={t.vision}
										description={t.visionDesc}
										checked={editor.draft.vision}
										onChange={(checked) => handleDraftChange('vision', checked)}
									/>
									<ToggleRow
										label={t.gitCommitMessageModel}
										description={t.gitCommitMessageModelDesc}
										checked={editor.draft.useForGitCommitMessage}
										onChange={(checked) => handleDraftChange('useForGitCommitMessage', checked)}
									/>
								</div>
							</Card>

							<Card title={t.advancedHeaders} size="small">
								<Form.Item
									label={t.requestHeaders}
									validateStatus={errors.requestHeadersText ? 'error' : ''}
									help={errors.requestHeadersText ?? t.requestHeadersHelp}
								>
									<Input.TextArea
										value={editor.draft.requestHeadersText}
										autoSize={{ minRows: 5, maxRows: 10 }}
										placeholder={'{\n  "x-trace-id": "my-app"\n}'}
										onChange={(e) => handleDraftChange('requestHeadersText', e.target.value)}
									/>
								</Form.Item>
							</Card>
						</Form>
					</div>
				</Content>
			</Layout>
		</div>
	);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ToggleRow(props: {
	label: string;
	description: string;
	checked: boolean;
	onChange(checked: boolean): void;
}) {
	return (
		<div className="capability-toggle">
			<div className="capability-toggle-header">
				<div className="capability-toggle-label">{props.label}</div>
				<Switch checked={props.checked} onChange={props.onChange} />
			</div>
			<div className="capability-toggle-description">{props.description}</div>
		</div>
	);
}

function ModelListItem(props: {
	active: boolean;
	title: string;
	subtitle: string;
	badges: string[];
	visibilityControl?: {
		checked: boolean;
		onChange(checked: boolean): void;
	};
	onClick(): void;
}) {
	return (
		<div className={`model-list-item ${props.active ? 'model-list-item-active' : ''}`}>
			{props.visibilityControl ? (
				<div className="model-list-switch">
					<Switch
						size="small"
						checked={props.visibilityControl.checked}
						onChange={props.visibilityControl.onChange}
					/>
				</div>
			) : null}
			<button type="button" className="model-list-main" onClick={props.onClick}>
				<div className="model-list-header">
					<div className="model-list-title">{props.title || '—'}</div>
				</div>
				<div className="model-list-subtitle">{props.subtitle}</div>
				<div className="badge-row">
					{props.badges.map((badge) => (
						<span key={badge} className="model-badge">{badge}</span>
					))}
				</div>
			</button>
		</div>
	);
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function createNewEditorSession(): EditorSession {
	const draft = toDraft(createEmptyModelConfig());
	return { mode: 'new', draft, baseline: draft, hasApiKey: false, savedApiKey: '' };
}

function createExistingEditorSession(model: ManagedCustomModelConfig): EditorSession {
	const draft = toDraft(model);
	return {
		mode: 'existing',
		savedId: model.id,
		draft,
		baseline: draft,
		hasApiKey: model.hasApiKey,
		savedApiKey: model.apiKey ?? '',
	};
}

function createEditorSessionFromState(
	models: ManagedCustomModelConfig[],
	preferredId: string | undefined,
	currentEditor: EditorSession
): EditorSession {
	if (preferredId) {
		const preferred = models.find((model) => model.id === preferredId);
		if (preferred) return createExistingEditorSession(preferred);
	}

	if (currentEditor.mode === 'existing' && currentEditor.savedId) {
		const current = models.find((model) => model.id === currentEditor.savedId);
		if (current) return createExistingEditorSession(current);
	}

	if (models.length > 0) return createExistingEditorSession(models[0]);

	return createNewEditorSession();
}

function toDraft(model: CustomModelConfig): DraftModel {
	return {
		id: model.id,
		name: model.name,
		model: model.model,
		providerLabel: model.providerLabel ?? '',
		baseUrl: model.baseUrl,
		apiPath: model.apiPath ?? '',
		authMode: model.authMode ?? 'bearer',
		apiKeyHeaderName: model.apiKeyHeaderName ?? DEFAULT_API_KEY_HEADER_NAME,
		toolCalling: model.toolCalling,
		vision: model.vision,
		useForGitCommitMessage: model.useForGitCommitMessage,
		maxInputTokens: model.maxInputTokens,
		maxOutputTokens: model.maxOutputTokens,
		requestHeadersText: model.requestHeaders ? JSON.stringify(model.requestHeaders, null, 2) : '',
		showInModelPicker: model.showInModelPicker !== false,
	};
}

function toModelConfig(draft: DraftModel): CustomModelConfig {
	return {
		id: draft.id.trim(),
		name: draft.name.trim(),
		model: draft.model.trim(),
		providerLabel: draft.providerLabel.trim() || undefined,
		baseUrl: draft.baseUrl.trim(),
		apiPath: draft.apiPath.trim() || undefined,
		authMode: draft.authMode,
		apiKeyHeaderName: draft.apiKeyHeaderName.trim() || DEFAULT_API_KEY_HEADER_NAME,
		toolCalling: draft.toolCalling,
		vision: draft.vision,
		useForGitCommitMessage: draft.useForGitCommitMessage,
		maxInputTokens: draft.maxInputTokens ?? DEFAULT_MAX_INPUT_TOKENS,
		maxOutputTokens: draft.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
		requestHeaders: parseHeadersText(draft.requestHeadersText).headers,
		showInModelPicker: draft.showInModelPicker,
	};
}

function validateDraft(
	draft: DraftModel,
	models: ManagedCustomModelConfig[],
	currentId: string | undefined,
	t: T
): DraftErrors {
	const nextErrors: DraftErrors = {};
	const trimmedId = draft.id.trim();
	const trimmedName = draft.name.trim();
	const trimmedModel = draft.model.trim();
	const trimmedBaseUrl = draft.baseUrl.trim();
	const trimmedHeaderName = draft.apiKeyHeaderName.trim();
	const duplicate = models.some((model) => model.id === trimmedId && model.id !== currentId);

	if (!trimmedId) {
		nextErrors.id = t.modelIdRequired;
	} else if (duplicate) {
		nextErrors.id = t.modelIdDuplicate;
	}

	if (!trimmedName) {
		nextErrors.name = t.nameRequired;
	}

	if (!trimmedModel) {
		nextErrors.model = t.upstreamModelRequired;
	}

	if (!trimmedBaseUrl) {
		nextErrors.baseUrl = t.baseUrlRequired;
	} else if (!isHttpUrl(trimmedBaseUrl)) {
		nextErrors.baseUrl = t.baseUrlInvalid;
	}

	if (draft.authMode === 'header' && !trimmedHeaderName) {
		nextErrors.apiKeyHeaderName = t.apiKeyHeaderRequired;
	}

	if (!draft.maxInputTokens || draft.maxInputTokens <= 0) {
		nextErrors.maxInputTokens = t.tokenPositive;
	}

	if (!draft.maxOutputTokens || draft.maxOutputTokens <= 0) {
		nextErrors.maxOutputTokens = t.tokenPositive;
	}

	const parsedHeaders = parseHeadersText(draft.requestHeadersText);
	if (parsedHeaders.error) {
		const errorMap: Record<HeadersParseError, string> = {
			'not-object': t.headersNotObject,
			'invalid-values': t.headersStringValues,
			'invalid-json': t.headersInvalidJson,
		};
		nextErrors.requestHeadersText = errorMap[parsedHeaders.error];
	}

	return nextErrors;
}

function parseHeadersText(source: string): { headers?: Record<string, string>; error?: HeadersParseError } {
	const trimmed = source.trim();
	if (!trimmed) return {};

	try {
		const parsed = JSON.parse(trimmed) as unknown;
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			return { error: 'not-object' };
		}

		const entries = Object.entries(parsed as Record<string, unknown>);
		const headers = entries.reduce<Record<string, string>>((acc, [key, value]) => {
			if (typeof value === 'string' && key.trim()) {
				acc[key.trim()] = value.trim();
			}
			return acc;
		}, {});

		if (Object.keys(headers).length !== entries.length) {
			return { error: 'invalid-values' };
		}

		return { headers };
	} catch {
		return { error: 'invalid-json' };
	}
}

function isEditorDirty(editor: EditorSession, apiKeyInput: string): boolean {
	return serializeDraft(editor.draft) !== serializeDraft(editor.baseline) || apiKeyInput !== editor.savedApiKey;
}

function serializeDraft(draft: DraftModel): string {
	const parsedHeaders = parseHeadersText(draft.requestHeadersText);
	return JSON.stringify({
		...draft,
		id: draft.id.trim(),
		name: draft.name.trim(),
		model: draft.model.trim(),
		providerLabel: draft.providerLabel.trim(),
		baseUrl: draft.baseUrl.trim(),
		apiPath: draft.apiPath.trim(),
		apiKeyHeaderName: draft.apiKeyHeaderName.trim(),
		requestHeaders: parsedHeaders.headers ?? draft.requestHeadersText.trim(),
	});
}

function buildBadges(model: CustomModelConfig, hasApiKey: boolean, dirty: boolean, t: T): string[] {
	const result = [
		model.toolCalling ? t.toolCallingBadge : t.textOnlyBadge,
		model.vision ? t.visionBadge : t.noVisionBadge,
	];

	if (model.useForGitCommitMessage) {
		result.unshift(t.gitCommitBadge);
	}

	if ((model.authMode ?? 'bearer') !== 'none') {
		result.push(hasApiKey ? t.hasKeyBadge : t.noKeyBadge);
	} else {
		result.push(t.noKeyNeededBadge);
	}

	if (dirty) result.push(t.dirtyBadge);

	return result;
}

function resolveGitCommitMessageModelId(models: ManagedCustomModelConfig[], editor: EditorSession): string | undefined {
	if (editor.draft.useForGitCommitMessage) {
		return editor.mode === 'existing'
			? editor.savedId
			: '__draft__';
	}

	const currentEditorId = editor.mode === 'existing' ? editor.savedId : undefined;
	return models.find((model) => model.id !== currentEditorId && model.useForGitCommitMessage)?.id;
}

function formatModelListTitle(model: Pick<CustomModelConfig, 'name' | 'providerLabel'>, fallback: string): string {
	const name = model.name?.trim();
	const providerLabel = model.providerLabel?.trim();

	if (providerLabel && name) {
		return `${providerLabel}/${name}`;
	}

	if (name) {
		return name;
	}

	if (providerLabel) {
		return providerLabel;
	}

	return fallback;
}

function formatModelListSubtitle(model: Pick<CustomModelConfig, 'model'>, t: T): string {
	const modelName = model.model?.trim();
	return modelName ? `${t.modelPrefix}${modelName}` : t.upstreamModelNotFilled;
}

function toManagedModelPreview(editor: EditorSession): ManagedCustomModelConfig {
	return { ...toModelConfig(editor.draft), hasApiKey: editor.hasApiKey };
}

function isHttpUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === 'http:' || url.protocol === 'https:';
	} catch {
		return false;
	}
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

const rootElement = document.getElementById('root');

if (rootElement) {
	const dark = isDarkTheme();
	const root = createRoot(rootElement);
	root.render(
		<ConfigProvider
			csp={window.__CUSTOM_MODELS_NONCE__ ? { nonce: window.__CUSTOM_MODELS_NONCE__ } : undefined}
			getPopupContainer={(triggerNode) => triggerNode?.parentElement ?? document.body}
			theme={buildAntTheme(dark)}
		>
			<AntApp message={{ top: 20 }}>
				<ModelManagementApp />
			</AntApp>
		</ConfigProvider>
	);
}
