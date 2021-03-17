/*---------------------------------------------------------------------------------------------
* Copyright (c) 2020 Simon Waelti
* Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vscode-nls';

import * as path from 'path';
import { readFileSync } from 'fs';

import { 
	Macrofile
} from './macroLanguageService/macroLanguageService';

import { 
	MacroFileType, 
	MacroFileProvider, 
	FileProviderParams,
} from './macroLanguageService/macroLanguageTypes';
import { Parser } from './macroLanguageService/parser/macroParser';
import * as glob  from 'glob';  

import {
	TextDocuments,
	Files,
} from 'vscode-languageserver/node';

import {
	TextDocument,
} from 'vscode-languageserver-textdocument';

import { URI } from 'vscode-uri';

const ALL_FILES:string = '/**/*.{[sS][rR][cC],[dD][eE][fF]}';

export const parsedDocuments: Map<string, MacroFileType> = new Map<string, MacroFileType>();


export class FileProvider implements MacroFileProvider {

	constructor(private workspaceFolder:string, private documents: TextDocuments<TextDocument>, private connection?:any) {}

	public get(file: string): MacroFileType | undefined {
	
		let uri = this.resolveReference(file);
		if (uri) {
			
			let doc = getParsedDocument(this.documents, uri, (document => {
				let parser = new Parser(this);
				return parser.parseMacroFile(document);
			}));
			if (!doc) {		
				try {
					const file = readFileSync(Files.uriToFilePath(uri)!, 'utf-8');
					let document = TextDocument.create(uri!, 'macro', 1, file.toString());
					try {
						
						let macrofile = new Parser(this).parseMacroFile(document);
						doc = {
							macrofile: macrofile,
							document: document,
							version: 1
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
		let types:MacroFileType[] = [];
	
		try {
			const dir = Files.uriToFilePath(this.workspaceFolder);
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

	/**
	 * Returns a given path as uri
	 * @param ref 
	 * @param base 
	 */
	public resolveReference(ref: string, base?: string): string | undefined {

		let file:string | undefined = '';
		if (!path.isAbsolute(ref)) {
			file = Files.uriToFilePath(this.workspaceFolder + '/' + ref);

			// convert already existing URI
			let filePath = Files.uriToFilePath(ref);
			if (filePath && path.isAbsolute(filePath)) {
				file = filePath;
			}
		}
		else{
			file = ref;
		}

		if (!file){
			return undefined;
		}

		file = this.resolvePathCaseSensitive(file);

		if (file) {
			return URI.file(file).toString();
		}
		else {return '';}
	}

	private resolvePathCaseSensitive(file:string) {
		let norm = path.normalize(file);
		let root = path.parse(norm).root;
		let p = norm.slice(Math.max(root.length - 1, 0));
		return glob.sync(p, { nocase: true, cwd: root })[0];
	}
}

export function getParsedDocument(documents: TextDocuments<TextDocument>, uri: string, parser:((document:TextDocument) => Macrofile), parse:boolean=false) : MacroFileType | undefined {
	let document = documents.get(uri);
	if (document) {
		let parsed = parsedDocuments.get(uri);
		if (parsed) {
			if (document.version !== parsed.version || parse) {
				parsedDocuments.set(uri , {
					macrofile: parser(document),
					document: document,
					version: document.version
				});
			}
		}
		else {
			parsedDocuments.set(uri, {
				macrofile: parser(document),
				document: document,
				version: document.version
			});
		}	
	}
	return parsedDocuments.get(uri);
}
