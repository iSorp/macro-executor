/*---------------------------------------------------------------------------------------------
* Copyright (c) 2020 Simon Waelti
* Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
'use strict';

import { Macrofile } from './macroLanguageService';
import  { MarkupKind, TextDocument } from 'vscode-languageserver-types';
import { type } from 'os';
export { TextDocument } from 'vscode-languageserver-textdocument';

export * from 'vscode-languageserver-types';


export interface LanguageSettings {
	validate? : {
		enable?: boolean;
		workspace?:boolean;
	};
	codelens?: {
		enable?:boolean;
	}
}

export interface DocumentContext {
	resolveReference(ref: string, base?: string): string | undefined;
}

export interface FindDocumentLinks {
	resolveReference(ref: string, base?: string): string | undefined;
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
	getLink(ref:string) : string |undefined;
}

export interface MacroCodeLensType {
	title: string;
	uri:string;
	line:number;
	character:number;
	type:MacroCodeLensCommand;
}	

export enum MacroCodeLensCommand {
	References
}

