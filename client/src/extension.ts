import * as path from 'path';
import * as vscode from 'vscode';
import * as lc from 'vscode-languageclient/node';
import * as ls from 'vscode-languageserver-protocol';

import registerCommands from './common/commands';

import CompositeDisposable from './common/compositeDisposable';

let client: lc.LanguageClient;
let disposables = new CompositeDisposable();

interface ConfigurationSettings {
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
	lint?: Object;
	keywords: Object[],
	workspaceFolder?: lc.WorkspaceFolder | undefined;
	callFunctions?: string[];
	fileEncoding?: string;
}

interface CodeLensReferenceArgument { 
	position: ls.Position, 
	locations: ls.Location[]
}

export function activate(context: vscode.ExtensionContext) {

	// The server is implemented in node
	let serverModule = context.asAbsolutePath(
		path.join('server', 'out', 'server.js')
	);

	let debugOptions = { execArgv: ['--nolazy', '--inspect=6011'], cwd: process.cwd() };
	let serverOptions: lc.ServerOptions = {
		run: { module: serverModule, transport: lc.TransportKind.ipc, options: { cwd: process.cwd() } },
		debug: {
			module: serverModule,
			transport: lc.TransportKind.ipc,
			options: debugOptions
		}
	};

	let clientOptions: lc.LanguageClientOptions = {
		documentSelector: [{ language: 'macro', scheme: 'file' }],
		initializationOptions: vscode.workspace.getConfiguration('macro'),
		synchronize: {
			fileEvents: vscode.workspace.createFileSystemWatcher('**/*.{[sS][rR][cC],[dD][eE][fF],[lL][nN][kK]}')
		},		
		diagnosticCollectionName: 'macro',
		progressOnInitialization: true,
		revealOutputChannelOn: lc.RevealOutputChannelOn.Never,	
		middleware: {
			
			executeCommand: async (command:string, args:any[], next:lc.ExecuteCommandSignature) => {
				if (command === 'macro.codelens.references') {
					const arg:CodeLensReferenceArgument = args[0];


					const position = client.protocol2CodeConverter.asPosition(arg.position);
					const locations:vscode.Location[] = [];
					for (const location of arg.locations){
						locations.push(client.protocol2CodeConverter.asLocation(location));
					}

					if (vscode.window.activeTextEditor) {
						vscode.commands.executeCommand('editor.action.showReferences', vscode.window.activeTextEditor.document.uri, position, locations);
					}
				}
				else if (command === 'macro.action.refactorsequeces' || command === 'macro.action.addsequeces') {
					function validate(input:string): string | null {
						return Number.isInteger(Number(input)) ? null : 'Integer expected';
					}

					const config = vscode.workspace.getConfiguration('macro');
					let start = undefined;
					if (command === 'macro.action.refactorsequeces') {
						start = await vscode.window.showInputBox({
							prompt: 'Start sequence number',
							value: config.sequence.base,
							validateInput: validate
						});
					}
		
					const increment = await vscode.window.showInputBox({
						prompt: 'Sequence number increment',
						value: config.sequence.increment,
						validateInput: validate
					});

					if (vscode.window.activeTextEditor) {
						if (command === 'macro.action.addsequeces' && increment) {
							return next(command, [vscode.window.activeTextEditor.document.uri.toString(), vscode.window.activeTextEditor.selection.start, increment]);
						} 
						else if (command === 'macro.action.refactorsequeces' && start && increment) {
							return next(command, [vscode.window.activeTextEditor.document.uri.toString(), vscode.window.activeTextEditor.selection.start, start, increment]);
						}
					}
				}
				else if (command === 'macro.action.validate') {
					const workspaceUri = args[0];
					if (workspaceUri) {
						return next(command, [workspaceUri]);	
					}
					else {
						pickFolder(workspace => {
							return next(command, [workspace.uri.toString()]);	
						});	
					}
				}
			},
			workspace : {
				configuration: async (params, _token, _next): Promise<any[]> => {
					if (params.items === undefined) {
						return [];
					}
					const result: (ConfigurationSettings | null)[] = [];
					for (const item of params.items) {
						if (item.section || !item.scopeUri) {
							result.push(null);
							continue;
						}
						const resource = client.protocol2CodeConverter.asUri(item.scopeUri);
						const workspaceFolder = vscode.workspace.getWorkspaceFolder(resource);
						const config = vscode.workspace.getConfiguration('macro', workspaceFolder);
						const settings: ConfigurationSettings = {
							codelens: config.get('codelens'),
							lint:config.get('lint', {}),
							sequence: config.get('sequence'),
							validate: config.get('validate'),
							keywords: config.get('keywords'),
							callFunctions: config.get('callFunctions'),
							fileEncoding: config.get('fileEncoding'),
						};
		
						if (workspaceFolder !== undefined) {
							settings.workspaceFolder = {
								name: workspaceFolder.name,
								uri: client.code2ProtocolConverter.asUri(workspaceFolder.uri),
							};
						}
						result.push(settings);
					}
					return result;
				}
			}
		} as any
	};

	// Create the language client and start the client.
	client = new lc.LanguageClient(
		'macroLanguageServer',
		'Macro Language Server',
		serverOptions,
		clientOptions
	);

	disposables.add(registerCommands());
	context.subscriptions.push(disposables);
	context.subscriptions.push(client.start());
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}

export function pickFolder(cb:(workspace: vscode.WorkspaceFolder) => void) {
	const folders = vscode.workspace.workspaceFolders;
	if (!folders) {
		return;
	}
	
	if (folders.length === 1) {
		cb(folders[0]);
		return;
	}
	vscode.window.showWorkspaceFolderPick({placeHolder:'', ignoreFocusOut:true}).then(selected => {
		if (selected) {
			cb(selected);
		}
	});
	if (folders.length === 1) {
		cb(folders[0]);
		return;
	}
}
