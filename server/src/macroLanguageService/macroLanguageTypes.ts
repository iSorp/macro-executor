/*---------------------------------------------------------------------------------------------
 *	Copyright (c) 2020 Simon Waelti
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Macrofile } from './macroLanguageService';
import  { MarkupKind, TextDocument } from 'vscode-languageserver-types';
export { TextDocument } from 'vscode-languageserver-textdocument';

export * from 'vscode-languageserver-types';


export interface LanguageSettings {
	validate?: boolean;
	validateWorkspace?: boolean;
}

export interface DocumentContext {
	resolveReference(ref: string, base?: string): string;
}

export interface FindDocumentLinks {
	resolveReference(ref: string, base?: string): string;
}

export interface LanguageServiceOptions {

	fileProvider?: MacroFileProvider;
}

export interface MacroFileType {

	macrofile: Macrofile;

	document: TextDocument;

	version: number;
}

export interface MacroFileProvider {
	get(uri: string) : MacroFileType | undefined;
	getAll() : MacroFileType[]
}