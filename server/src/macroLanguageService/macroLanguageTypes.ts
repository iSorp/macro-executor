/*---------------------------------------------------------------------------------------------
* Copyright (c) 2020 Simon Waelti
* Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
'use strict';

import { Macrofile } from './macroLanguageService';
import  { TextDocument, Location } from 'vscode-languageserver-types';
export { TextDocument } from 'vscode-languageserver-textdocument';
export  { Proposed } from 'vscode-languageserver';
export { SemanticTokensBuilder, SemanticTokensFeature } from 'vscode-languageserver/lib/semanticTokens.proposed';
export * from './languageFacts/builtinData';
export { 
	SemanticTokenModifiers,
	SemanticTokenTypes,
	SemanticTokensParams,
	SemanticTokensLegend,
	SemanticTokensServerCapabilities,
	SemanticTokensClientCapabilities
} from 'vscode-languageserver-protocol/lib/protocol.semanticTokens.proposed';

export * from 'vscode-languageserver-types';

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
}
export type LintSettings = { 
	rules : {
		[key: string]: any 	// e.g rule.duplicateInclude: 'ignore' | 'warning' | 'error'
	}
};

export type CustomKeywords = { 
	symbol: string;
	scope:string;
	description:string;
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
	get(uri: string, base?: string, workspaceFolder?: string) : MacroFileType | undefined;
	getAll(param?: FileProviderParams, base?: string, workspaceFolder?: string) : MacroFileType[]
	resolveReference(ref: string, base?: string, workspaceFolder?: string): string | undefined
}

export interface MacroCodeLensType {
	title: string;
	locations : Location[] | undefined;
	type:MacroCodeLensCommand;
}	

export enum MacroCodeLensCommand {
	References
}

export enum TokenTypes {
	number 			= 1,
	variable 		= 2,
	symbol			= 3,
	constant		= 4,
	language		= 5,
	label			= 6,
	code 			= 7,
	parameter 		= 8,
	address 		= 9,
	custom_1 		= 10,
	custom_2 		= 11,
	custom_3 		= 12,
	custom_4 		= 13,
	custom_5 		= 14,
	_				= 15,
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