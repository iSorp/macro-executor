/*---------------------------------------------------------------------------------------------
* Copyright (c) 2020 Simon Waelti
* Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
'use strict';

import { Macrofile } from './macroLanguageService';
import  { Location } from 'vscode-languageserver-types';
import { TextDocument } from 'vscode-languageserver-textdocument';

export { TextDocument } from 'vscode-languageserver-textdocument';
export { SemanticTokensBuilder } from 'vscode-languageserver/lib/common/semanticTokens';
export { NodeType } from './parser/macroNodes';
export * from './languageFacts/builtinData';
export { 
	SemanticTokenModifiers,
	SemanticTokenTypes,
	SemanticTokensParams,
	SemanticTokensLegend,
	SemanticTokens,
	SemanticTokensClientCapabilities
} from 'vscode-languageserver-protocol/lib/common/protocol.semanticTokens';

export * from 'vscode-languageserver-types';

export const ALL_FILES:string = '/**/*.{[sS][rR][cC],[dD][eE][fF]}';
export const SRC_FILES:string = '/**/*.[sS][rR][cC]';

export interface LanguageSettings {
	validate? : {
		enable: boolean;
		workspace:boolean;
	};
	codelens?: {
		enable:boolean;
	};
	sequence?: {
		base:number;
		increment:number;
	}
	lint?: LintSettings;
	keywords?: CustomKeywords[];
	callFunctions?: string[];
}
export type LintSettings = { 
	rules : {
		[key: string]: any 	// e.g rule.duplicateInclude: 'ignore' | 'warning' | 'error'
	}
};

export type CustomKeywords = { 
	symbol: string;
	scope:string;
	description:any;
	nodeType:string
};

export interface DocumentContext {
	resolveReference(ref: string, base?: string): string | undefined;
}

export interface LanguageServiceOptions {

	fileProvider: MacroFileProvider;
}

export interface MacroFileType {

	macrofile: Macrofile;

	document: TextDocument;

	version: number;
}


export interface FileProviderParams {
	uris?:string[],
	glob?:string
}

export interface MacroFileProvider {
	get(string, workspaceFolder?: string) : MacroFileType | undefined;
	getAll(param?: FileProviderParams, base?: string, workspaceFolder?: string) : MacroFileType[]
	resolveReference(ref: string, workspaceFolder?: string): string | undefined
}

export interface MacroCodeLensType {
	title: string;
	locations? : Location[] | undefined;
	type?: MacroCodeLensCommand;
}	

export enum MacroCodeLensCommand {
	References
}

export enum TokenTypes {
	number 			= 1,
	macrovar 		= 2,
	constant		= 3,
	language		= 4,
	label			= 5,
	code 			= 6,
	parameter 		= 7,
	address 		= 8,
	custom_1 		= 9,
	custom_2 		= 10,
	custom_3 		= 11,
	custom_4 		= 12,
	custom_5 		= 13,
	_				= 14,
}


export enum TokenModifiers {
	_ 				= 0
}

export type FunctionSignatureParam = {
	_bracket? : string;
	_escape?: string;
	_param?: {[name:string]:any}[];
}

export type FunctionSignature = {
	description?:string,
	delimiter?:string, 
	param:FunctionSignatureParam[]
}