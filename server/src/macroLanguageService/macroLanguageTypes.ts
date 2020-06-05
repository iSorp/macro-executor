/*---------------------------------------------------------------------------------------------
* Copyright (c) 2020 Simon Waelti
* Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
'use strict';

import { Macrofile } from './macroLanguageService';
import  { TextDocument } from 'vscode-languageserver-types';
export { TextDocument } from 'vscode-languageserver-textdocument';
export  { Proposed } from 'vscode-languageserver';
export { SemanticTokensBuilder, SemanticTokensFeature } from 'vscode-languageserver/lib/semanticTokens.proposed';
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
}
export type LintSettings = { 
	rules : {
		[key: string]: any 	// e.g rule.duplicateInclude: 'ignore' | 'warning' | 'error'
	}

};

export interface DocumentContext {
	resolveReference(ref: string, base?: string): string | undefined;
}

export interface FindDocumentLinks {
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
	get(uri: string) : MacroFileType | undefined;
	getAll(param?: FileProviderParams) : MacroFileType[]
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

export enum TokenTypes {
	number 			= 1,
	variable 		= 2,
	constant		= 3,
	label			= 4,
	code 			= 5,
	parameter 		= 6,
	address 		= 7,
	_ 				= 8
}

export enum TokenModifiers {
	_ 				= 0
}
