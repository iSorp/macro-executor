import * as path from 'path';
import { workspace as Workspace, ExtensionContext, workspace, commands, window as Window,
	Location,
} from 'vscode';

import {
	LanguageClient, LanguageClientOptions,
	ServerOptions, TransportKind, RevealOutputChannelOn,
	ExecuteCommandSignature, WorkspaceFolder
} from 'vscode-languageclient/node';


import * as ls from 'vscode-languageserver-protocol';

import registerCommands from './common/commands';

import CompositeDisposable from './common/compositeDisposable';

let client: LanguageClient;
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
	workspaceFolder?: WorkspaceFolder | undefined;
	callFunctions?: string[];
}

interface CodeLensReferenceArgument {
	position: ls.Position,
	locations: ls.Location[]
}

export function activate(context: ExtensionContext) {

	// The server is implemented in node
	let serverModule = context.asAbsolutePath(
		path.join('server', 'out', 'server.js')
	);

	let debugOptions = { execArgv: ['--nolazy', '--inspect=6011'], cwd: process.cwd() };
	let serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc, options: { cwd: process.cwd() } },
		debug: {
			module: serverModule,
			transport: TransportKind.ipc,
			options: debugOptions
		}
	};

	let clientOptions: LanguageClientOptions = {
		documentSelector: [{ language: 'macro', scheme: 'file' }],
		initializationOptions: workspace.getConfiguration('macro'),
		synchronize: {
			fileEvents: workspace.createFileSystemWatcher('**/*.{[sS][rR][cC],[dD][eE][fF],[lL][nN][kK]}')
		},
		diagnosticCollectionName: 'macro',
		progressOnInitialization: true,
		revealOutputChannelOn: RevealOutputChannelOn.Never,
		middleware: {

			executeCommand: async (command:string, args:any[], next:ExecuteCommandSignature) => {
				if (command === 'macro.codelens.references') {
					const arg:CodeLensReferenceArgument = args[0];


					const position = client.protocol2CodeConverter.asPosition(arg.position);
					const locations:Location[] = [];
					for (const location of arg.locations){
						locations.push(client.protocol2CodeConverter.asLocation(location));
					}

					if (Window.activeTextEditor) {
						commands.executeCommand('editor.action.showReferences', Window.activeTextEditor.document.uri, position, locations);
					}
				}
				else if (command === 'macro.action.refactorsequeces' || command === 'macro.action.addsequeces') {
					function validate(input:string): string | null {
						return Number.isInteger(Number(input)) ? null : 'Integer expected';
					}

					const config = workspace.getConfiguration('macro');
					let start = undefined;
					if (command === 'macro.action.refactorsequeces') {
						start = await Window.showInputBox({
							prompt: 'Start sequence number',
							value: config.sequence.base,
							validateInput: validate
						});
					}

					const increment = await Window.showInputBox({
						prompt: 'Sequence number increment',
						value: config.sequence.increment,
						validateInput: validate
					});

					if (Window.activeTextEditor) {
						if (command === 'macro.action.addsequeces' && increment) {
							return next(command, [Window.activeTextEditor.document.uri.toString(), Window.activeTextEditor.selection.start, increment]);
						}
						else if (command === 'macro.action.refactorsequeces' && start && increment) {
							return next(command, [Window.activeTextEditor.document.uri.toString(), Window.activeTextEditor.selection.start, start, increment]);
						}
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
						const workspaceFolder = Workspace.getWorkspaceFolder(resource);
						const config = workspace.getConfiguration('macro', workspaceFolder);
						const settings: ConfigurationSettings = {
							codelens: config.get('codelens'),
							lint:config.get('lint', {}),
							sequence: config.get('sequence'),
							validate: config.get('validate'),
							keywords: config.get('keywords'),
							callFunctions: config.get('callFunctions'),
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
	client = new LanguageClient(
		'macroLanguageServer',
		'Macro Language Server',
		serverOptions,
		clientOptions
	);

	disposables.add(registerCommands());
	context.subscriptions.push(disposables);
	client.start();
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}
