/*---------------------------------------------------------------------------------------------
* Copyright (c) 2020 Simon Waelti
* Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
'use strict';

import * as path from 'path';
import { readFileSync, existsSync } from 'fs';

import { LanguageSettings, MacroFileProvider, FindDocumentLinks, Range, FileProviderParams } from './macroLanguageService/macroLanguageTypes';
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
	CompletionParams,
	ReferenceParams,
	DocumentSymbolParams,
	DocumentLinkParams,
	DidChangeConfigurationParams,
	ImplementationParams,
	FileChangeType,
	DidChangeWatchedFilesParams,
	CodeLensParams, 
	CodeLens,
	TextDocumentChangeEvent,
	CompletionContext
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

	private resolver = new Links();

	get(file: string): MacroFileType | undefined {
	
		if (!workspaceFolder){
			return undefined;
		}

		let uri = this.resolver.resolveReference(file);
		if (uri) {
			
			let doc = getParsedDocument(uri, (document => {
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
	
	getAll(param?:FileProviderParams) {
		let types:MacroFileType[] = [];
	
		try {
			if (workspaceFolder) {
				const dir = Files.uriToFilePath(workspaceFolder);
				let files:string[] = [];
				if (param?.uris){
					files = param.uris;
				}
				else if (param?.glob) {
					files = glob.sync(dir + param.glob);
				}
				else {
					files = glob.sync(dir+'/**/*.{[sS][rR][cC],[dD][eE][fF],[lL][nN][kK]}');
				}

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
		return this.resolver.resolveReference(ref);
	}
}

class Links implements FindDocumentLinks {

	/**
	 * Returns a given path as uri
	 * @param ref 
	 * @param base 
	 */
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

		file = this.resolvePathCaseSensitive(file);

		if (file) {
			return URI.file(file).toString();
		}
		else {return '';}
	}

	private resolvePathCaseSensitive(file:string) {
		let norm = path.normalize(file)
		let root = path.parse(norm).root
		let p = norm.slice(Math.max(root.length - 1, 0))
		return glob.sync(p, { nocase: true, cwd: root })[0]
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
			completionProvider: {
				triggerCharacters: ['#'],
			},
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
	Promise.resolve(revalidate(true));
});

connection.onCodeLens(codelens);
connection.onCodeLensResolve(codeLensResolve);
connection.onDidChangeWatchedFiles(watchedFiles);
connection.onDidChangeConfiguration(configuration);
connection.onDefinition(definition);
connection.onReferences(references);
connection.onImplementation(implementations);
connection.onDocumentSymbol(documentSymbol);
connection.onDocumentLinks(documentLinks);
connection.onHover(hower);
connection.onCompletion(completion);

documents.onDidChangeContent(content);
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

function content(change:TextDocumentChangeEvent<TextDocument>) {
	validateTextDocument(getParsedDocument(change.document.uri, macroLanguageService.parseMacroFile));

	// TODO validate files only which include this def file
	if (change.document.uri.split('.').pop()?.toLocaleLowerCase() === 'def') {
		Promise.resolve(revalidate(false));	
	}
}

function hower(params: TextDocumentPositionParams) {
	let repo = getParsedDocument(params.textDocument.uri, macroLanguageService.parseMacroFile);
	if (!repo) {return null;}
	return macroLanguageService.doHover(repo.document, params.position, repo.macrofile);
}


//onCompletion(handler: ServerRequestHandler<CompletionParams, CompletionItem[] | CompletionList | undefined | null, CompletionItem[], void>): void;

function completion(params: CompletionParams) {
	let repo = getParsedDocument(params.textDocument.uri, macroLanguageService.parseMacroFile);
	if (!repo) {return null;}
	return macroLanguageService.doComplete(repo.document, params.position, repo.macrofile);
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

function codeLensResolve(handler:CodeLens) {

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

function validateTextDocument(doc: MacroFileType | undefined) {

	if (!doc) {return;}

	try {

		if (doc.document) {
			if (macroLanguageService.doValidation && doc.macrofile) {
				const entries = macroLanguageService.doValidation(doc.document, doc.macrofile, settings);
				entries.splice(1000);
				const diagnostics: Diagnostic[] = entries;
				connection.sendDiagnostics({ uri: doc.document.uri, diagnostics });
			}
		}
	} catch (e) {
		connection.console.error(`Error while validating ${doc.document.uri}`);
		connection.console.error(e);
	}
}

function watchedFiles(handler:DidChangeWatchedFilesParams){
	for (const file of handler.changes) {
		if (file.type === FileChangeType.Deleted){
			parsedDocuments.clear();
			revalidate(true);
		} 
		else if (file.type === FileChangeType.Changed) {
			// if the file is not opened it was changed external 
			// so the parsedDocuments repo is not up-to-date anymore.
			if (!documents.get(file.uri)){
				parsedDocuments.delete(file.uri);
			}
		} 
		else if (file.type === FileChangeType.Created) {
			parsedDocuments.clear();
			revalidate(true);
		} 
	}
}

function revalidate(workspace:boolean) {
	if (workspace && settings && settings?.validate?.workspace){
		let fp = new FileProvider();
		let types = fp.getAll();
		for (const element of types){
			validateTextDocument(element);
		}
	} else{
		for (const document of documents.all()){
			validateTextDocument(getParsedDocument(document.uri, macroLanguageService.parseMacroFile,true));
		}
	}
}

/**
 * Returns the parsed version of a TextDocument. 
 * An open TextDocument will be reparsd if the Version is newer than the parsed version.
 * @param uri 
 * @param parser 
 * @param parse 
 */
function getParsedDocument(uri: string, parser:((document:TextDocument) => Macrofile), parse:boolean=false) : MacroFileType | undefined {
	let document = documents.get(uri);
	if (document) {
		let parsed = parsedDocuments.get(uri);
		if (parsed) {
			if (document.version !== parsed.version || parse){
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
