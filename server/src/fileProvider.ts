/*---------------------------------------------------------------------------------------------
* Copyright (c) 2020 Simon Waelti
* Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
'use strict';

import * as path from 'path';
import { readFileSync } from 'fs';
import { TextDecoder } from 'util';
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

type FileEncoding = 'auto' | 'utf8' | 'utf16le' | 'utf16be' | 'big5' | 'cp950';

const utf8Decoder = new TextDecoder('utf-8');
const utf8FatalDecoder = new TextDecoder('utf-8', { fatal: true });
const utf16leDecoder = new TextDecoder('utf-16le');
const utf16beDecoder = new TextDecoder('utf-16be');
const big5Decoder = new TextDecoder('big5');

function normalizeEncoding(value?: string): FileEncoding {
	const encoding = (value || '').trim().toLowerCase();
	switch (encoding) {
		case 'auto':
			return 'auto';
		case 'utf8':
		case 'utf-8':
			return 'utf8';
		case 'utf16le':
		case 'utf-16le':
			return 'utf16le';
		case 'utf16be':
		case 'utf-16be':
			return 'utf16be';
		case 'big5':
		case 'big5-hkscs':
			return 'big5';
		case 'cp950':
			return 'cp950';
		default:
			return 'utf8';
	}
}

function decodeWithBom(buffer: Buffer): string | undefined {
	if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
		return utf8Decoder.decode(buffer.subarray(3));
	}
	if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
		return utf16leDecoder.decode(buffer.subarray(2));
	}
	if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
		return utf16beDecoder.decode(buffer.subarray(2));
	}
	return undefined;
}

function decodeBuffer(buffer: Buffer, encoding: FileEncoding): string {
	const bomDecoded = decodeWithBom(buffer);
	if (bomDecoded !== undefined) {
		return bomDecoded;
	}
	switch (encoding) {
		case 'utf16le':
			return utf16leDecoder.decode(buffer);
		case 'utf16be':
			return utf16beDecoder.decode(buffer);
		case 'big5':
		case 'cp950':
			// TextDecoder lacks cp950, so use Big5 decoding.
			return big5Decoder.decode(buffer);
		case 'auto':
			try {
				return utf8FatalDecoder.decode(buffer);
			} catch {
				return big5Decoder.decode(buffer);
			}
		case 'utf8':
		default:
			return utf8Decoder.decode(buffer);
	}
}

export class FileProvider implements MacroFileProvider {

	private encoding: FileEncoding;

	constructor(private workspaceFolder:string, private documents: TextDocuments<TextDocument>, private connection?:any, encoding?: string) {
		this.encoding = normalizeEncoding(encoding);
	}

	public setEncoding(encoding?: string): void {
		this.encoding = normalizeEncoding(encoding);
	}

	public get(file: string): MacroFileInfo | undefined {
	
		const uri = this.resolveReference(file);
		if (uri) {
			
			let doc = getParsedDocument(this.documents, uri, (document => {
				const parser = new Parser(this);
				return parser.parseMacroFile(document);
			}));
			if (!doc) {		
				try {
					const file = readFileSync(URI.parse(uri).fsPath);
					const document = TextDocument.create(uri!, 'macro', 1, decodeBuffer(file, this.encoding));
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
