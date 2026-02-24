/*---------------------------------------------------------------------------------------------
* Copyright (c) 2020 Simon Waelti
* Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vscode-nls';
const localize = nls.config({ messageFormat: nls.MessageFormat.file })();

import { 
	FileProvider,
	getParsedDocument,
	parsedDocuments
} from './fileProvider';


import { 
	getMacroLanguageService, 
	LanguageService, 
} from './macroLanguageService/macroLanguageService';

import { 
	MacroFileInfo, 
	MacroCodeLensType, 
	MacroCodeLensCommand ,
	LanguageSettings, 
	TokenTypes,
	TokenModifiers,
	SemanticTokensLegend,
	MacroFileInclude,
	MacroFileType
} from './macroLanguageService/macroLanguageTypes';

import {
	createConnection,
	TextDocuments,
	Diagnostic,
	ProposedFeatures,
	InitializeParams,
	TextDocumentSyncKind,
	InitializeResult,
	DidChangeConfigurationNotification,
	FileChangeType,
	WorkspaceFolder
} from 'vscode-languageserver/node';

import {
	TextDocument
} from 'vscode-languageserver-textdocument';


const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
const documentSettings: Map<string, Promise<TextDocumentSettings>> = new Map<string, Promise<TextDocumentSettings>>();
const languageServices: Map<string, LanguageService> = new Map<string, LanguageService>();
const fileProviders: Map<string, FileProvider> = new Map<string, FileProvider>();
const defaultLanguageService = getMacroLanguageService(null);

let hasConfigurationCapability: boolean = false;
let hasWorkspaceFolderCapability: boolean = false;
let workspaceValidation = false;

interface TextDocumentSettings extends LanguageSettings {
	workspaceFolder: WorkspaceFolder | undefined;
}

connection.onInitialize((params: InitializeParams) => {
	
	let capabilities = params.capabilities;

	hasConfigurationCapability = !!(
		capabilities.workspace && !!capabilities.workspace.configuration
	);
	hasWorkspaceFolderCapability = !!(
		capabilities.workspace && !!capabilities.workspace.workspaceFolders
	);
	
	const result: InitializeResult = {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Full,
			definitionProvider: true,
			documentSymbolProvider: true,
			workspaceSymbolProvider: true,
			hoverProvider: true,
			documentFormattingProvider: true,
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
			renameProvider: {
				prepareProvider: true
			},
			referencesProvider: true,
			implementationProvider:true,
			documentLinkProvider: {
				resolveProvider:true
			},
			executeCommandProvider: {
				commands: [
					'macro.codelens.references',
					'macro.action.refactorsequeces',
					'macro.action.addsequeces',
					'macro.action.validate',
				]
			},
			semanticTokensProvider: {
				documentSelector: [{ language: 'macro', scheme: 'file' }],
				legend: computeLegend(),
				range: true,
				full: {
					delta: false
				}
			},
			callHierarchyProvider: true,
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
				const fileProvider = getFileProvider(added.uri);
				languageServices.set(added.uri, getMacroLanguageService({fileProvider}));
				validateWorkspace(added.uri);
			}
			for (const removed of _event.removed) {
				documentSettings.clear();
				parsedDocuments.clear();
				languageServices.delete(removed.uri);
				fileProviders.delete(removed.uri);
			}
		});
	}
	
	const workspaces = await connection.workspace.getWorkspaceFolders();	
	if (workspaces && workspaces.length > 0) {
		
		workspaces.forEach(workspace => {
			const fileProvider = getFileProvider(workspace.uri);
			languageServices.set(workspace.uri, getMacroLanguageService({fileProvider}));
		});
		
		await Promise.all(workspaces.map(workspace => getSettings(workspace.uri)));
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
				validateWorkspace(file.uri);
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
				validateWorkspace(file.uri);
			});
		} 
	}
});

connection.onDidChangeConfiguration(params => {
	documentSettings.clear();
	connection.workspace.getWorkspaceFolders().then(workspaces => {
		workspaces?.forEach(workspace => {
			getSettings(workspace.uri);
		});
	});
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

connection.onPrepareRename(params => {
	return execute(params.textDocument.uri, (service, repo, settings) => 
		service.doPrepareRename(repo.document, params.position, repo.macrofile));
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

connection.onDocumentFormatting(params => {
	return execute(params.textDocument.uri, (service, repo, settings) => 
		service.doDocumentFormatting(repo.document, params.options, repo.macrofile));
});

connection.onCompletion(params => {
	return execute(params.textDocument.uri, (service, repo, settings) => 
		service.doComplete(repo.document, params.position, repo.macrofile, settings));
});

connection.onExecuteCommand(params => {
	if (!params.arguments) { 
		return;
	}
	
	if (params.command === 'macro.action.validate') { 
	
		const workspaceUri = params.arguments[0];
		
		getSettings(workspaceUri).then(settings => {
			
			if (!settings.validate?.enable) {
				connection.window.showInformationMessage(localize('message.validationdisabled', 'The validation is disabled'));
				return;
			}
			
			validateWorkspace(workspaceUri, true);
		});
		
		return;	
	}
	
	const textDocument 	= documents.get(params.arguments[0]);

	return execute(textDocument.uri, (service, repo, settings) => {		
		if (params.command === 'macro.action.refactorsequeces' || params.command === 'macro.action.addsequeces') {
		
			const position 		= params.arguments[1];
			const start 		= params.arguments[2];
			const inc 			= params.arguments[3];
			
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

connection.languages.callHierarchy.onPrepare((params) => {
	return execute(params.textDocument.uri, (service, repo, settings) =>
		service.doPrepareCallHierarchy(repo.document, params.position, repo.macrofile));
});

connection.languages.callHierarchy.onIncomingCalls((params) => {
	return execute(params.item.uri, (service, repo, settings) =>
		service.doIncomingCalls(repo.document, params.item, repo.macrofile, settings));
});

connection.languages.callHierarchy.onOutgoingCalls((params) => {
	return execute(params.item.uri, (service, repo, settings) =>
		service.doOutgoingCalls(repo.document, params.item, repo.macrofile, settings));
	return [];
});


documents.onDidChangeContent(event => {
	return execute(event.document.uri, (service, repo, settings) => {
		const macroFile = getParsedDocument(documents, event.document.uri, service.parseMacroFile);
		validateTextDocument(macroFile);

		if (workspaceValidation && macroFile.type === MacroFileType.DEF) {
			const fp = getFileProvider(settings.workspaceFolder.uri, settings);
			for (const element of fp.getAll()) {
				if (element.type === MacroFileType.SRC) {					
					if ((<MacroFileInclude>element.macrofile).getIncludes()?.some(a =>  fp.resolveReference(a) === event.document.uri)) {
						parsedDocuments.delete(element.document.uri);
						validateTextDocument(fp.get(element.document.uri));	
					}	
				}
			}	
		}
	});
});

documents.listen(connection);
connection.listen();

async function execute<T>(uri:string, runService:(service:LanguageService, repo:MacroFileInfo, settings:TextDocumentSettings) => T) : Promise<T> {
	return getSettings(uri).then(settings => {
		let service: LanguageService;
		if (settings.workspaceFolder) {
			service = languageServices.get(settings.workspaceFolder.uri);
		}
		else {
			service = defaultLanguageService;	
		}
		
		const repo = getParsedDocument(documents, uri, service.parseMacroFile);
		if (!repo || !service) {
			return null;
		}
		return runService(service, repo, settings);
	}).catch(error => {
		connection.console.error(error.message);
		connection.console.error(error.stack);
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
		if (settings.workspaceFolder?.uri) {
			getFileProvider(settings.workspaceFolder.uri, settings);
		}
		return settings;
	});
	documentSettings.set(uri, resultPromise);
	return resultPromise;
}

function validateTextDocument(doc: MacroFileInfo | undefined) {
	execute(doc.document.uri, (service, repo, settings) => {
		try {
			const entries = service.doValidation(doc.document, doc.macrofile, settings);
			entries.splice(1000);
			const diagnostics: Diagnostic[] = entries;
			connection.sendDiagnostics({ uri: doc.document.uri, diagnostics });
		} catch (e) {
			connection.console.error(`Error while validating ${doc.document.uri}`);
			connection.console.error(e.messate);
			connection.console.error(e.stack);
		}
	});
}

function validateWorkspace(uri:string, forceValidation: boolean = false) {
	if (workspaceValidation || forceValidation) {
		if (forceValidation) {
			parsedDocuments.clear();
		}
		const fp = getFileProvider(uri);
		for (const element of fp.getAll()){
			validateTextDocument(element);
		}
	} 
}

function validate() {
	connection.workspace.getWorkspaceFolders().then(workspaces => {
		for (const ws of workspaces) {
			validateWorkspace(ws.uri);
		}
	});
}

function computeLegend(): SemanticTokensLegend {

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

function getFileProvider(workspaceUri: string, settings?: TextDocumentSettings): FileProvider {
	let fileProvider = fileProviders.get(workspaceUri);
	if (!fileProvider) {
		fileProvider = new FileProvider(workspaceUri, documents, connection);
		fileProviders.set(workspaceUri, fileProvider);
	}
	if (settings?.fileEncoding !== undefined) {
		fileProvider.setEncoding(settings.fileEncoding);
	}
	return fileProvider;
}
