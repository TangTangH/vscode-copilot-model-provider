import type { CustomModelConfig, ManagedCustomModelConfig } from './modelTypes';

export interface ModelManagementState {
	models: ManagedCustomModelConfig[];
}

export interface ModelManagementNotice {
	kind: 'success' | 'error';
	message: string;
}

export type ModelManagementRequest =
	| { type: 'ready' }
	| { type: 'save-model'; model: CustomModelConfig; apiKey: string }
	| { type: 'delete-model'; id: string }
	| { type: 'set-model-visibility'; id: string; showInModelPicker: boolean }
	| { type: 'open-settings-json' };

export interface ModelManagementHydrateMessage {
	type: 'hydrate';
	state: ModelManagementState;
	selectedId?: string;
	notice?: ModelManagementNotice;
}

export interface ModelManagementNoticeMessage {
	type: 'notice';
	notice: ModelManagementNotice;
}

export interface ModelManagementVisibilityUpdatedMessage {
	type: 'update-model-visibility';
	id: string;
	showInModelPicker: boolean;
}

export type ModelManagementResponse =
	| ModelManagementHydrateMessage
	| ModelManagementNoticeMessage
	| ModelManagementVisibilityUpdatedMessage;
