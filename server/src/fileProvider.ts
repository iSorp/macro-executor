/*---------------------------------------------------------------------------------------------
* Copyright (c) 2020 Simon Waelti
* Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
'use strict';

import * as path from 'path';
import { readFileSync } from 'fs';
import { 
	MacroFileInfo, 
	MacroFileProvider, 
	FileProviderParams,
	ALL_FILES,
	MacroFileType,
	Macrofile
} from './macroLanguageService/macroLanguageTypes';
import { Parser } from './macroLanguageService/parser/macroParser';
import * as glob  from 'glob';  

import {
	TextDocuments,
} from 'vscode-languageserver/node';

import {
	TextDocument,
} from 'vscode-languageserver-textdocument';

import { URI, Utils } from 'vscode-uri';

export const parsedDocuments: Map<string, MacroFileInfo> = new Map<string, MacroFileInfo>();

export class FileProvider implements MacroFileProvider {

	constructor(private workspaceFolder:string, private documents: TextDocuments<TextDocument>, private connection?:any) {}

	public get(file: string): MacroFileInfo | undefined {
	
		const uri = this.resolveReference(file);
		if (uri) {
			
			let doc = getParsedDocument(this.documents, uri, (document => {
				const parser = new Parser(this);
				return parser.parseMacroFile(document);
			}));
			if (!doc) {		
				try {
					const file = readFileSync(URI.parse(uri).fsPath, 'utf-8');
					const document = TextDocument.create(uri!, 'macro', 1, file.toString());
					try {
						const macrofile = new Parser(this).parseMacroFile(document);
						doc = {
							macrofile: macrofile,
							document: document,
							version: 1,
							type: getMacroFileType(document.uri)
						};
						parsedDocuments.set(uri, doc);
					}
					catch (err){
						this.connection?.console.log(err);
					}
				}
				catch (err) {
					this.connection?.console.log(err);
					return undefined;
				}
			}
			return doc;
		}
		return undefined;
	}
	
	public getAll(param?:FileProviderParams) {
		let types:MacroFileInfo[] = [];
	
		try {
			const dir = URI.parse(this.workspaceFolder).fsPath;
			let files:string[] = [];
			if (param?.uris){
				files = param.uris;
			}
			else if (param?.glob) {
				files = glob.sync(dir + param.glob);
			}
			else {
				files = glob.sync(dir + ALL_FILES);
			}

			for (const file of files) {
				let type = this.get(file);
				if (type){
					types.push(type);
				}
			}
		} catch (err){
			this.connection.console.log(err);
		}
		return types;
	}

	public resolveReference(ref: string): string | undefined {

		if (ref.startsWith('file:///')) {
			return ref;
		}
		let absolutPath = ref;
		if (!path.isAbsolute(ref)) {
			absolutPath = Utils.resolvePath(URI.parse(this.workspaceFolder), ref).fsPath;
		}
		absolutPath = this.resolvePathCaseSensitive(absolutPath);
		return absolutPath ? URI.file(absolutPath).toString() :undefined;
	}

	private resolvePathCaseSensitive(file:string) {
		let norm = path.normalize(file);
		let root = path.parse(norm).root;
		let p = norm.slice(Math.max(root.length - 1, 0));
		return glob.sync(p, { nocase: true, cwd: root })[0];
	}
}

export function getMacroFileType(uri: string) : MacroFileType {
	var fileExt = uri.split('.').pop().toLocaleLowerCase();
	switch(fileExt) {
		case 'def':
			return MacroFileType.DEF;
		case 'lnk':
			return MacroFileType.LNK;
		default:
			return MacroFileType.SRC;
	}
} 

export function getParsedDocument(documents: TextDocuments<TextDocument>, uri: string, parser:((document:TextDocument) => Macrofile), parse:boolean=false) : MacroFileInfo | undefined {
	let document = documents.get(uri);
	if (document) {
		let parsed = parsedDocuments.get(uri);
		if (parsed) {
			if (document.version !== parsed.version || parse) {
				parsedDocuments.set(uri , {
					macrofile: parser(document),
					document: document,
					version: document.version,
					type: getMacroFileType(document.uri)
				});
			}
		}
		else {
			parsedDocuments.set(uri, {
				macrofile: parser(document),
				document: document,
				version: document.version,
				type: getMacroFileType(document.uri)
			});
		}	
	}
	return parsedDocuments.get(uri);
}
