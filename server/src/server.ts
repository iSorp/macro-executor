/*---------------------------------------------------------------------------------------------
* Copyright (c) 2020 Simon Waelti
* Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vscode-nls';
const localize = nls.config({ messageFormat: nls.MessageFormat.file })();

import * as path from 'path';
import { readFileSync } from 'fs';

import { 
	getMacroLanguageService, 
	Macrofile,
	LanguageService, 
} from './macroLanguageService/macroLanguageService';

import { 
	MacroFileType, 
	MacroCodeLensType, 
	MacroCodeLensCommand ,
	LanguageSettings, 
	MacroFileProvider, 
	FileProviderParams,
	TokenTypes,
	TokenModifiers
} from './macroLanguageService/macroLanguageTypes';
import { Parser } from './macroLanguageService/parser/macroParser';
import * as glob  from 'glob';  

import {
	createConnection,
	TextDocuments,
	Diagnostic,
	ProposedFeatures,
	InitializeParams,
	TextDocumentSyncKind,
	InitializeResult,
	DidChangeConfigurationNotification,
	Files,
	FileChangeType,
	Proposed,
	WorkspaceFolder
} from 'vscode-languageserver/node';

import {
	TextDocument,
} from 'vscode-languageserver-textdocument';

import { URI } from 'vscode-uri';


const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
const documentSettings: Map<string, Promise<TextDocumentSettings>> = new Map<string, Promise<TextDocumentSettings>>();
const parsedDocuments: Map<string, MacroFileType> = new Map<string, MacroFileType>();
const languageServices: Map<string, LanguageService> = new Map<string, LanguageService>();

let hasConfigurationCapability: boolean = false;
let hasWorkspaceFolderCapability: boolean = false;
let workspaceValidation = false;

interface TextDocumentSettings extends LanguageSettings {
	workspaceFolder: WorkspaceFolder | undefined;
}

class FileProvider implements MacroFileProvider {

	constructor(private workspaceFolder:string) {}

	public get(file: string): MacroFileType | undefined {
	
		let uri = this.resolveReference(file);
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
				files = glob.sync(dir+'/**/*.{[sS][rR][cC],[dD][eE][fF],[lL][nN][kK]}');
			}

			for (const file of files) {
				let type = this.get(file);
				if (type){
					types.push(type);
				}
			}
		}catch (err){
			connection.console.log(err);
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

connection.onInitialize((params: InitializeParams) => {
	
	params.workspaceFolders.forEach(workspace => {
		languageServices.set(workspace.uri, getMacroLanguageService({fileProvider: new FileProvider(workspace.uri)}));
	});

	let capabilities = params.capabilities;

	hasConfigurationCapability = !!(
		capabilities.workspace && !!capabilities.workspace.configuration
	);
	hasWorkspaceFolderCapability = !!(
		capabilities.workspace && !!capabilities.workspace.workspaceFolders
	);
	
	const result: InitializeResult & { capabilities: Proposed.SemanticTokensServerCapabilities } = {
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
			signatureHelpProvider: {
				triggerCharacters: ['(', '[', ','],
				retriggerCharacters : [',']
			},
			renameProvider: true,
			referencesProvider: true,
			implementationProvider:true,
			documentLinkProvider: {
				resolveProvider:true
			},
			executeCommandProvider: {
				commands: [
					'macro.codelens.references',
					'macro.action.refactorsequeces',
					'macro.action.addsequeces'
				]
			},
			semanticTokensProvider: {
				legend: computeLegend(),
				rangeProvider: false
			}
		}
	};
	if (hasWorkspaceFolderCapability) {
		result.capabilities.workspace = {
			workspaceFolders: {
				supported: true
			}
		};
	}
	return result;
});

connection.onInitialized(async () => {
	if (hasConfigurationCapability) {
		// Register for all configuration changes.
		connection.client.register(DidChangeConfigurationNotification.type, undefined);
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(_event => {
			for (const added of _event.added) {
				languageServices.set(added.uri, getMacroLanguageService({fileProvider: new FileProvider(added.uri)}));
				validateWorkspace(added.uri, true);
			}
			for (const removed of _event.removed) {
				documentSettings.clear();
				parsedDocuments.clear();
				languageServices.delete(removed.uri);
			}
		});
	}
	const workspaces = await connection.workspace.getWorkspaceFolders();
	if (workspaces && workspaces.length > 0) {
		await getSettings(workspaces[0].uri);
		validate();
	}
});

connection.onCodeLens(params => {
	return execute(params.textDocument.uri, (service, repo, settings) => 
		service.findCodeLenses(repo.document, repo.macrofile));
});

connection.onCodeLensResolve(params => {
	let data:MacroCodeLensType = <MacroCodeLensType>params.data;
	let command:string = ''; 
	if (data.type === MacroCodeLensCommand.References){
		command = 'macro.codelens.references';
	}
	return {
		range: params.range,
		command: {
			command: command,
			title:data.title,
			arguments: [
				{ 
					position: params.range.start, 
					locations: data.locations 
				}
			]
		}
	};
});

connection.onDidChangeWatchedFiles(handler => {
	for (const file of handler.changes) {
		if (file.type === FileChangeType.Deleted) {
			parsedDocuments.clear();
			documentSettings.clear();
			getSettings(file.uri).then(settings => {
				validateWorkspace(file.uri, true);
			});
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
			documentSettings.clear();
			getSettings(file.uri).then(settings => {
				validateWorkspace(file.uri, true);
			});
		} 
	}
});

connection.onDidChangeConfiguration(params => {
	documentSettings.clear();
	for (const document of documents.all()) {
		execute(document.uri, (service, repo, settings) => {
			validateTextDocument(repo);
		});
	}
});

connection.onDefinition(params => {
	return execute(params.textDocument.uri, (service, repo, settings) => 
		service.findDefinition(repo.document, params.position, repo.macrofile));
});

connection.onReferences(params => {
	return execute(params.textDocument.uri, (service, repo, settings) => 
		service.findReferences(repo.document, params.position, repo.macrofile));
});

connection.onRenameRequest(params => {
	return execute(params.textDocument.uri, (service, repo, settings) => 
		service.doRename(repo.document, params.position, params.newName, repo.macrofile));
});

connection.onImplementation(params => {
	return execute(params.textDocument.uri, (service, repo, settings) => 
		service.findImplementations(repo.document, params.position, repo.macrofile));
});

connection.onDocumentSymbol(params => {
	return execute(params.textDocument.uri, (service, repo, settings) => 
		service.findDocumentSymbols(repo.document, repo.macrofile));
});

connection.onDocumentLinks(params => {
	return execute(params.textDocument.uri, (service, repo, settings) => 
		service.findDocumentLinks(repo.document, repo.macrofile));
});

connection.onHover(params => {
	return execute(params.textDocument.uri, (service, repo, settings) => 
		service.doHover(repo.document, params.position, repo.macrofile, settings));
});

connection.onCompletion(params => {
	return execute(params.textDocument.uri, (service, repo, settings) => 
		service.doComplete(repo.document, params.position, repo.macrofile, settings));
});

connection.onExecuteCommand(params => {
	if (!params.arguments) { 
		return;
	}

	const textDocument 	= documents.get(params.arguments[0]);
	const position 		= params.arguments[1];
	const start 		= params.arguments[2];
	const inc 			= params.arguments[3];

	return execute(textDocument.uri, (service, repo, settings) => {
		if (params.command === 'macro.action.refactorsequeces' || params.command === 'macro.action.addsequeces') {
		
			let localsettings:LanguageSettings = {}; 
			Object.assign(localsettings, settings);

			if (textDocument && position) {
				if (!repo) {
					return null;
				}

				if (params.command === 'macro.action.refactorsequeces') {
					if (localsettings.sequence){
						localsettings.sequence.base  = start;
						localsettings.sequence.increment  = inc;
					}
					const edit = service.doRefactorSequences(repo.document, position, repo.macrofile, localsettings);
					if (edit) {
						connection.workspace.applyEdit({
							documentChanges: [edit]
						});
						connection.window.showInformationMessage(localize('message.refactorsequeces.success', 'Refactoring sequences successful'));
					}
				}
				else if (params.command === 'macro.action.addsequeces'){
					if (localsettings.sequence){
						localsettings.sequence.increment  = inc;
					}
					const edit = service.doCreateSequences(repo.document, position, repo.macrofile, localsettings);
					if (edit) {
						connection.workspace.applyEdit({
							documentChanges: [edit]
						});
						connection.window.showInformationMessage(localize('message.addsequeces.success', 'Adding sequences successful'));
					}
				}
			}
			
		}
	});
});

connection.onSignatureHelp(params => {
	return execute(params.textDocument.uri, (service, repo, settings) => 
		service.doSignature(repo.document, params.position, repo.macrofile, settings));
});

connection.languages.semanticTokens.on(event => {
	return execute(event.textDocument.uri, (service, repo, settings) => 
		service.doSemanticHighlighting(repo.document, repo.macrofile, settings));
});

connection.languages.semanticTokens.onRange(event => {
	return execute(event.textDocument.uri, (service, repo, settings) =>
		service.doSemanticHighlighting(repo.document, repo.macrofile, settings, event.range));
});

documents.onDidChangeContent(event => {
	return execute(event.document.uri, (service, repo, settings) => {
		validateTextDocument(getParsedDocument(event.document.uri, service.parseMacroFile));

		// TODO validate only related files
		if (event.document.uri.split('.').pop()?.toLocaleLowerCase() === 'def') {
			validateWorkspace(settings.workspaceFolder.uri, false);	
		}
	});
});

documents.listen(connection);
connection.listen();

async function execute<T>(uri:string, runService:(service:LanguageService, repo:MacroFileType, settings:TextDocumentSettings) => T) : Promise<T> {
	return getSettings(uri).then(settings => {
		const service = languageServices.get(settings.workspaceFolder.uri);
		const repo = getParsedDocument(uri, service.parseMacroFile);
		if (!repo || !service) {
			return null;
		}
		return runService(service, repo, settings);
	}).catch(error => {
		connection.console.error(error);
		return null;
	});
}

function getSettings(uri: string): Promise<TextDocumentSettings> {
	let resultPromise = documentSettings.get(uri);
	if (resultPromise) {
		return resultPromise;
	}
	resultPromise = connection.workspace.getConfiguration({ scopeUri: uri, section: '' }).then(configuration => {
		const settings: TextDocumentSettings = Object.assign({},configuration);
		workspaceValidation = settings.validate.workspace;
		return settings;
	});
	documentSettings.set(uri, resultPromise);
	return resultPromise;
}

function getParsedDocument(uri: string, parser:((document:TextDocument) => Macrofile), parse:boolean=false) : MacroFileType | undefined {
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

function validateTextDocument(doc: MacroFileType | undefined) {
	execute(doc.document.uri, (service, repo, settings) => {
		try {
			const entries = service.doValidation(doc.document, doc.macrofile, settings);
			entries.splice(1000);
			const diagnostics: Diagnostic[] = entries;
			connection.sendDiagnostics({ uri: doc.document.uri, diagnostics });
		} catch (e) {
			connection.console.error(`Error while validating ${doc.document.uri}`);
			connection.console.error(e);
		}
	});
}

function validateWorkspace(uri:string, allFiles:boolean) {
	if (allFiles && workspaceValidation) {
		const fp = new FileProvider(uri);
		for (const element of fp.getAll()){
			validateTextDocument(element);
		}
	} 
	else {
		for (const document of documents.all()) {
			const service = languageServices.get(uri);
			validateTextDocument(getParsedDocument(document.uri, service.parseMacroFile));
		}
	}
}

function validate() {
	connection.workspace.getWorkspaceFolders().then(workspaces => {
		for (const ws of workspaces) {
			validateWorkspace(ws.uri, true);
		}
	});
}

function computeLegend(): Proposed.SemanticTokensLegend {

	const tokenTypes: string[] = [];
	for (let i = 0; i < TokenTypes._; i++) {
		const str = TokenTypes[i];
		tokenTypes.push(str);
	}

	const tokenModifiers: string[] = [];
	for (let i = 0; i < TokenModifiers._; i++) {
		tokenModifiers.push(TokenModifiers[i]);
	}

	return { tokenTypes, tokenModifiers };
}