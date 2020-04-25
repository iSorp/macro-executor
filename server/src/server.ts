/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as path from 'path';
import { readFileSync, readdirSync, statSync, promises } from 'fs';

import { LanguageSettings, MacroFileProvider, FindDocumentLinks } from './macroLanguageService/macroLanguageTypes';
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
	WorkspaceSymbolParams,
	TextDocumentSyncKind,
	InitializeResult,
	DidChangeConfigurationNotification,
	Files,
	ReferenceParams,
	DocumentSymbolParams,
	DocumentLinkParams,
	RenameParams,
	DidChangeConfigurationParams,
} from 'vscode-languageserver';

import {
	TextDocument,
} from 'vscode-languageserver-textdocument';

import { getMacroLanguageService, Macrofile, LanguageService, MacroFileType } from './macroLanguageService/macroLanguageService';
import { FileSystem } from 'vscode-languageserver/lib/files';
import { URI } from 'vscode-uri';

let connection = createConnection(ProposedFeatures.all);
let workspaceFolder: string | null;
let documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
let parsedDocuments: Map<string, MacroFileType> = new Map<string, MacroFileType>();
let languageSettings:LanguageSettings;
let hasConfigurationCapability: boolean = false;
let hasWorkspaceFolderCapability: boolean = false;
let hasDiagnosticRelatedInformationCapability: boolean = false;

const defaultSettings: ServerSettings = { lint: true };
let globalSettings: ServerSettings = defaultSettings;
let documentSettings: Map<string, Thenable<ServerSettings>> = new Map();


interface ServerSettings {
	lint: boolean;
}

class FileProvider implements MacroFileProvider {

	get(file: string): MacroFileType | undefined {
	
		if (!workspaceFolder){
			return undefined;
		}

		let uri = '';
		if (path.isAbsolute(file)){
			uri = URI.file(file).toString();
		}
		else {
			uri = workspaceFolder + '/' + file;
			let filePath = Files.uriToFilePath(file);
			if (filePath && path.isAbsolute(filePath)) {
				uri = file;
			}
		}

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
				}
				catch (e){
					console.log();
				}
				
				// add new parsed document to the repository
				// parsedDocuments.set(uri, doc);
			}
			catch (err) {
				return undefined;
			}
		}
		return doc;
	}

	getAll(): MacroFileType[] {

		let types:MacroFileType[] = [];
		try {


			if (workspaceFolder){
				let dir = Files.uriToFilePath(workspaceFolder);
				let files = glob.sync(dir+'/**/*.{src,def}');
				for (const file of files) {
					let type = this.get(file);
					if (type){
						types.push(type);
					}
				}
			}
		}catch (e){
			console.log();
		}

		return types;
	}
}

class Links implements FindDocumentLinks {
	public resolveReference(ref: string, base?: string): string {
		let uri = workspaceFolder + '/' + ref;
		if (uri) {return uri;}
		else {return '';}
	}
}

function createMacroLanguageService() : LanguageService {
	return getMacroLanguageService({
		fileProvider: new FileProvider()
	});
}


const macroLanguageService = createMacroLanguageService();


connection.onInitialize((params: InitializeParams) => {

	let capabilities = params.capabilities;
	workspaceFolder = params.rootUri;

	// Does the client support the `workspace/configuration` request?
	// If not, we will fall back using global settings
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
			//renameProvider: true,
			referencesProvider: true,
			documentLinkProvider: {
				resolveProvider:true
			},
		}

	};
	if (hasWorkspaceFolderCapability) {
		result.capabilities.workspace = {
			workspaceFolders: {
				supported: true
			}
		};
	}

	/*(async function(){
		if (workspaceFolder) {	
			for await (const f of getFiles(Files.uriToFilePath(workspaceFolder)!, /\.(def)|(src)/i)) {
				const file = readFileSync(f, 'utf-8');
				let textDocument = TextDocument.create(f, 'macro', 1, file.toString());
				validateTextDocument(textDocument);
			}
		}
	})();
*/
	return result;
});

/*async function readDeclarations() {
	declarations.clear();
	if (workspaceFolder) {	
		for await (const f of getFiles(Files.uriToFilePath(workspaceFolder)!, /\.(def)/i)) {
			const file = readFileSync(f, 'utf-8');
			let textDocument = TextDocument.create(f, 'macro', 1, file.toString());
			const macroFile = macroLanguageService.parseMacroFile(textDocument!);
			declarations.set(f, macroFile);
		}
	}
}*/

connection.onInitialized(() => {
	if (hasConfigurationCapability) {
		// Register for all configuration changes.
		connection.client.register(DidChangeConfigurationNotification.type, undefined);
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(_event => {
			connection.console.log('Workspace folder change event received.');
		});
	}


	// Scann all definitions
	/*let filePath = workspaceFolder+'/def/Macro.def';
	let p = Files.uriToFilePath(filePath);
	const file = readFileSync(p!, 'utf-8');
	let t = TextDocument.create('def/Macro.def', 'macro', 1, file.toString());
	
	let macroFile:MacroFile = macroLanguageService.parseMacroFile(t!);
	definitions.set(t.uri, macroFile);

	const latestTextDocument = documents.get(t.uri);

	

	let a = hasWorkspaceFolderCapability;*/

});

connection.onDidChangeWatchedFiles(_change => {});
connection.onDidChangeConfiguration(configuration);
connection.onDefinition(definition);
connection.onReferences(references);
connection.onDocumentSymbol(documentSymbol);
connection.onDocumentLinks(documentLinks);
//connection.onRenameRequest(renameRequest);
connection.onHover(hower);

documents.onDidChangeContent(change => {
	validateTextDocument(getParsedDocument(change.document.uri, macroLanguageService.parseMacroFile));
});
documents.listen(connection);
connection.listen();

function configuration(params: DidChangeConfigurationParams) {
	if (hasConfigurationCapability) {
		// Reset all cached document settings
		documentSettings.clear();
	} else {
		globalSettings = <ServerSettings>(
			(params.settings.macroLanguageServer || defaultSettings)
		);
	}
	Promise.resolve(async () => {
		for (const document of documents.all()){
			await getDocumentSettings(document.uri);
			validateTextDocument(getParsedDocument(document.uri, macroLanguageService.parseMacroFile));
		}
	});
}

function getDocumentSettings(resource: string): Thenable<ServerSettings> {
	if (!hasConfigurationCapability) {
		return Promise.resolve(globalSettings);
	}
	let result = documentSettings.get(resource);
	if (!result) {
		result = connection.workspace.getConfiguration({
			scopeUri: resource,
			section: 'macroLanguageServer'
		});
		documentSettings.set(resource, result);
	}
	return result;
}

function hower(params: TextDocumentPositionParams) {
	let repo = getParsedDocument(params.textDocument.uri, macroLanguageService.parseMacroFile);
	if (!repo) {return null;}
	return macroLanguageService.doHover(repo.document, params.position, repo.macrofile);

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

function documentSymbol(params: DocumentSymbolParams) {
	let repo = getParsedDocument(params.textDocument.uri, macroLanguageService.parseMacroFile);
	if (!repo) {return null;}
	return macroLanguageService.findDocumentSymbols(repo.document, repo.macrofile);
}

function documentLinks(params: DocumentLinkParams) {
	let repo = getParsedDocument(params.textDocument.uri, macroLanguageService.parseMacroFile);
	if (!repo) {return null;}
	return macroLanguageService.findDocumentLinks(repo.document, repo.macrofile, new Links());
}

function renameRequest(params: RenameParams) {
	let repo = getParsedDocument(params.textDocument.uri, macroLanguageService.parseMacroFile);
	if (!repo) {return null;}
	return macroLanguageService.doRename(repo.document, params.position, params.newName,repo.macrofile);
}

function validateTextDocument(doc: MacroFileType | undefined) {

	if (!doc) {return;}

	try {
		
		const version = doc.document.version;
		const diagnostics: Diagnostic[] = [];
		if (doc.document.languageId === 'macro') {

			if (doc.document && doc.document.version === version) {
				if (macroLanguageService.doValidation && doc.macrofile) {
					macroLanguageService.doValidation(doc.document, doc.macrofile, languageSettings).forEach(d => {
						diagnostics.push(d);
					});
					connection.sendDiagnostics({ uri: doc.document.uri, diagnostics });
				}
			}
		}
	} catch (e) {
		connection.console.error(`Error while validating ${doc.document.uri}`);
		connection.console.error(e);
	}
}

function getParsedDocument(uri: string, cb:((document:TextDocument) => Macrofile)) : MacroFileType | undefined {
	let document = documents.get(uri);
	if (document) {
		let doc = parsedDocuments.get(document.uri);
		if (doc){
			if (document.version !== doc.version){
				parsedDocuments.set(document.uri , {
					macrofile: cb(document),
					document: document,
					version: document.version
				});
			}
		}
		else {
			parsedDocuments.set(document.uri, {
				macrofile: cb(document),
				document: document,
				version: document.version
			});
		}	
		return parsedDocuments.get(document.uri); 
	}
	return undefined;
}
