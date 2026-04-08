import 'vscode';

declare module 'vscode' {
	interface LanguageModelChatInformation {
		readonly isUserSelectable?: boolean;
	}
}
