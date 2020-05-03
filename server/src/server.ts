/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as path from 'path';
import { readFileSync} from 'fs';

import { LanguageSettings, MacroFileProvider, FindDocumentLinks, Range } from './macroLanguageService/macroLanguageTypes';
import { Parser } from './macroLanguageService/parser/macroParser';
import * as glob  from 'glob';  

import {
	createConnection,
	TextDocuments,
	Diagnostic,
	ProposedFeatures,
	InitializeParams,
	TextDocumentPositionParams,
	DefinitionParams,
	TextDocumentSyncKind,
	InitializeResult,
	DidChangeConfigurationNotification,
	Files,
	ReferenceParams,
	DocumentSymbolParams,
	DocumentLinkParams,
	DidChangeConfigurationParams,
	ImplementationParams,
	FileChangeType,
	DidChangeWatchedFilesParams,
	CodeLensParams, 
} from 'vscode-languageserver';

import {
	TextDocument,
} from 'vscode-languageserver-textdocument';

import { getMacroLanguageService, 
	Macrofile, MacroFileType, 
	MacroCodeLensType, MacroCodeLensCommand 
} from './macroLanguageService/macroLanguageService';
import { URI } from 'vscode-uri';
import { rejects } from 'assert';


const maxNumberOfProblems = 1000;

let connection = createConnection(ProposedFeatures.all);
let workspaceFolder: string | null;
let documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
let parsedDocuments: Map<string, MacroFileType> = new Map<string, MacroFileType>();
let hasConfigurationCapability: boolean = false;
let hasWorkspaceFolderCapability: boolean = false;
let hasDiagnosticRelatedInformationCapability: boolean = false;
let settings:LanguageSettings;
const defaultSettings: LanguageSettings = { 
	validate : {
		enable:true,
		workspace:true
	},
	codelens: {
		enable:true
	}
};
let globalSettings: LanguageSettings = defaultSettings;

class FileProvider implements MacroFileProvider {

	private links = new Links();

	get(file: string): MacroFileType | undefined {
	
		if (!workspaceFolder){
			return undefined;
		}

		let uri = this.links.resolveReference(file);
		if (uri) {
			let doc = getParsedDocument(uri, new Parser(this).parseMacroFile);
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
						// add new parsed document to the repository
						// TODO handle unused files in repo
						parsedDocuments.set(uri, doc);
					}
					catch (err){
						connection.console.log(err);
					}
				}
				catch (err) {
					connection.console.log(err);
					return undefined;
				}
			}
			return doc;
		}
		return undefined;
	}
	
	getAll(): MacroFileType[] {

		let types:MacroFileType[] = [];
		try {
			if (workspaceFolder){
				let dir = Files.uriToFilePath(workspaceFolder);
				let files = glob.sync(dir+'/**/*.{[sS][rR][cC],[dD][eE][fF]}');
				for (const file of files) {
					let type = this.get(file);
					if (type){
						types.push(type);
					}
				}
			}
		}catch (err){
			connection.console.log(err);
		}

		return types;
	}

	getLink(ref:string) : string |undefined {
		return this.links.resolveReference(ref);
	}
}

class Links implements FindDocumentLinks {
	public resolveReference(ref: string, base?: string): string | undefined {
		if (!workspaceFolder){
			return '';
		}
		
		let file:string | undefined = '';
		if (!path.isAbsolute(ref)) {
			file = Files.uriToFilePath(workspaceFolder + '/' + ref);

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

		file = path.normalize(file.toLocaleLowerCase());

		// Workaround to get the case-sensitive path of a non case-sensitive path
		// TODO find correct solution
		let files = glob.sync(Files.uriToFilePath(workspaceFolder)+'/**/*.{[sS][rR][cC],[dD][eE][fF]}');
		let filter = files.filter(a => {
			let b = path.normalize(a.toLocaleLowerCase());
			if (b === file){
				return true;
			}
			else {
				return false;
			}
		});

		if (filter && filter.length > 0) {
			return URI.file(filter[0]).toString();
		}
		else {return '';}
	}
}

const macroLanguageService = getMacroLanguageService({
	fileProvider: new FileProvider(),
});

connection.onInitialize((params: InitializeParams) => {

	let capabilities = params.capabilities;
	workspaceFolder = params.rootUri;

	hasConfigurationCapability = !!(
		capabilities.workspace && !!capabilities.workspace.configuration
	);
	hasWorkspaceFolderCapability = !!(
		capabilities.workspace && !!capabilities.workspace.workspaceFolders
	);
	hasDiagnosticRelatedInformationCapability = !!(
		capabilities.textDocument &&
		capabilities.textDocument.publishDiagnostics &&
		capabilities.textDocument.publishDiagnostics.relatedInformation
	);

	const result: InitializeResult = {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Full,
			definitionProvider: true,
			documentSymbolProvider: true,
			workspaceSymbolProvider: true,
			hoverProvider: true,
			codeLensProvider: {
				resolveProvider:true
			},
			//renameProvider: true,
			referencesProvider: true,
			implementationProvider:true,
			documentLinkProvider: {
				resolveProvider:true
			},
			executeCommandProvider: {
				commands: ['macro.codelens.references']
			}
		}
	};
	return result;
});

connection.onInitialized(async () => {
	if (hasConfigurationCapability) {
		// Register for all configuration changes.
		connection.client.register(DidChangeConfigurationNotification.type, undefined);
	}
	settings = await getSettings();
	validateWorkspace();
});

connection.onCodeLens(codelens);
connection.onCodeLensResolve(handler => {
	let data:MacroCodeLensType = <MacroCodeLensType>handler.data;
	let command:string = ''; 
	if (data.type === MacroCodeLensCommand.References){
		command = 'macro.codelens.references';
	} 

	return {
		range: handler.range,
		command: {
			command: command,
			title:data.title,
			arguments: [data.line, data.character]
		}
	};
});

connection.onDidChangeWatchedFiles(watchedFiles);
connection.onDidChangeConfiguration(configuration);
connection.onDefinition(definition);
connection.onReferences(references);
connection.onImplementation(implementations);
connection.onDocumentSymbol(documentSymbol);
connection.onDocumentLinks(documentLinks);
connection.onHover(hower);

documents.onDidChangeContent(change => {
	validateTextDocument(getParsedDocument(change.document.uri, macroLanguageService.parseMacroFile));

	if (change.document.uri.split('.').pop()?.toLocaleLowerCase() === 'def') {
		Promise.resolve(validateOpenDocuments());	
	}
});

documents.listen(connection);
connection.listen();


async function configuration(params: DidChangeConfigurationParams) {
	if (!hasConfigurationCapability) {
		globalSettings = <LanguageSettings>((params.settings.macroLanguageServer || defaultSettings));
	}

	settings = await getSettings();

	for (const document of documents.all()){
		validateTextDocument(getParsedDocument(document.uri, macroLanguageService.parseMacroFile));
	}
}

function getSettings(): Thenable<LanguageSettings> {
	if (!hasConfigurationCapability) {
		return Promise.resolve(globalSettings);
	}
	let result = connection.workspace.getConfiguration({
		section: 'macro'
	});
	return result;
}

function hower(params: TextDocumentPositionParams) {
	let repo = getParsedDocument(params.textDocument.uri, macroLanguageService.parseMacroFile);
	if (!repo) {return null;}
	return macroLanguageService.doHover(repo.document, params.position, repo.macrofile);

}

function codelens(params: CodeLensParams) {
	if (settings && settings?.codelens?.enable){
		let repo = getParsedDocument(params.textDocument.uri, macroLanguageService.parseMacroFile);
		if (!repo) {
			return null;
		}
		return macroLanguageService.findCodeLenses(repo.document, repo.macrofile);
	}
}

function definition(params: DefinitionParams) {
	let repo = getParsedDocument(params.textDocument.uri, macroLanguageService.parseMacroFile);
	if (!repo) {return null;}
	return macroLanguageService.findDefinition(repo.document, params.position, repo.macrofile);
}

function references(params: ReferenceParams) {
	let repo = getParsedDocument(params.textDocument.uri, macroLanguageService.parseMacroFile);
	if (!repo) {return null;}
	return macroLanguageService.findReferences(repo.document, params.position, repo.macrofile);
}

function implementations(params: ImplementationParams) {
	let repo = getParsedDocument(params.textDocument.uri, macroLanguageService.parseMacroFile);
	if (!repo) {return null;}
	return macroLanguageService.findImplementations(repo.document, params.position, repo.macrofile);
	return null;
}

function documentSymbol(params: DocumentSymbolParams) {
	let repo = getParsedDocument(params.textDocument.uri, macroLanguageService.parseMacroFile);
	if (!repo) {return null;}
	return macroLanguageService.findDocumentSymbols(repo.document, repo.macrofile);
	return null;
}

function documentLinks(params: DocumentLinkParams) {
	let repo = getParsedDocument(params.textDocument.uri, macroLanguageService.parseMacroFile);
	if (!repo) {return null;}
	return macroLanguageService.findDocumentLinks(repo.document, repo.macrofile, new Links());
}

async function validateTextDocument(doc: MacroFileType | undefined) {

	if (!doc) {return;}

	try {

		let settings = await getSettings();
		const diagnostics: Diagnostic[] = [];
		if (doc.document.languageId === 'macro') {

			if (doc.document) {
				if (macroLanguageService.doValidation && doc.macrofile) {
					let entries = macroLanguageService.doValidation(doc.document, doc.macrofile, settings);
					let index = 0;
					for (const entry of entries) {
						if (maxNumberOfProblems <= index){
							break;
						}
						diagnostics.push(entry);
						++index;
					}
					connection.sendDiagnostics({ uri: doc.document.uri, diagnostics });
				}
			}
		}
	} catch (e) {
		connection.console.error(`Error while validating ${doc.document.uri}`);
		connection.console.error(e);
	}
}

async function validateWorkspace() {
	if (settings && settings?.validate?.workspace){
		let fp = new FileProvider();
		let types = fp.getAll();
		for (const element of types){
			validateTextDocument(element);
		}
	}
}

async function validateOpenDocuments() {
	for (const document of documents.all()){
		validateTextDocument(getParsedDocument(document.uri, macroLanguageService.parseMacroFile));
	}
}

function watchedFiles(handler:DidChangeWatchedFilesParams){
	for (const file of handler.changes) {
		if (file.type === FileChangeType.Deleted){
			parsedDocuments.delete(file.uri);
			validateWorkspace();
		} 
		else if (file.type === FileChangeType.Changed) {
			// if the file is not opened it was changed extern. 
			// n the parsedDocuments repo it is not up-to-date anymore.
			if (!documents.get(file.uri)){
				parsedDocuments.delete(file.uri);
			}
		} 
		else if (file.type === FileChangeType.Created) {
			validateWorkspace();
		} 
	}
}

function getParsedDocument(uri: string, parser:((document:TextDocument) => Macrofile)) : MacroFileType | undefined {
	let document = documents.get(uri);
	if (document) {
		let parsed = parsedDocuments.get(uri);
		if (parsed) {
			if (document.version !== parsed.version){
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
