import * as path from 'path';
import { ExtensionContext, workspace, commands, window as Window, 
	Selection, languages, TextDocument, CancellationToken 
} from 'vscode';


import { 
	LanguageClient, LanguageClientOptions, 
	ServerOptions, TransportKind, RevealOutputChannelOn,
	ExecuteCommandSignature
} from 'vscode-languageclient';

import { SemanticTokensFeature, DocumentSemanticsTokensSignature } from 'vscode-languageclient/lib/semanticTokens.proposed';
import registerCommands from './common/commands';

import CompositeDisposable from './common/CompositeDisposable';
import { downloadAndUnzipVSCode } from 'vscode-test';

import * as nls from 'vscode-nls';

// The example uses the file message format.
const localize = nls.config({ messageFormat: nls.MessageFormat.file })();

let client: LanguageClient;
let disposables = new CompositeDisposable();

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
			// Workaround for https://github.com/microsoft/vscode-languageserver-node/issues/576
			async provideDocumentSemanticTokens(document: TextDocument, token: CancellationToken, next: DocumentSemanticsTokensSignature) {
				const res = await next(document, token);
				if (res === undefined) {throw new Error('busy');}
				return res;
			},
			executeCommand: async (command:string, args:any[], next:ExecuteCommandSignature) => {
				if (command === 'macro.codelens.references') {
					let line = Number(args[0]);
					let char = Number(args[1]);
					let selection = new Selection(line, char, line,char);
					if (Window.activeTextEditor) {
						Window.activeTextEditor.selection = selection;
						commands.executeCommand('references-view.find');
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

	client.registerFeature(new SemanticTokensFeature(client));

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
