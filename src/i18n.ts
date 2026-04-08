import * as vscode from 'vscode';

export type DisplayLanguage = 'en' | 'zh';

interface LocalizedString {
	readonly en: string;
	readonly zh: string;
}

export function resolveDisplayLanguage(language: string | undefined = vscode.env.language): DisplayLanguage {
	return language?.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function pickLocalizedString(values: LocalizedString, language?: string): string {
	return values[resolveDisplayLanguage(language)];
}
