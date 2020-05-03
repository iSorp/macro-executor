import * as path from 'path';
import { ExtensionContext, workspace, commands, window, Selection } from 'vscode';
import { 
	LanguageClient, LanguageClientOptions, 
	ServerOptions, TransportKind, RevealOutputChannelOn, Position,
} from 'vscode-languageclient';
import registerCommands from './common/commands';


import CompositeDisposable from './common/CompositeDisposable';
import { downloadAndUnzipVSCode } from 'vscode-test';

let client: LanguageClient;
let disposables = new CompositeDisposable();

export function activate(context: ExtensionContext) {

	// The server is implemented in node
	let serverModule = context.asAbsolutePath(
		path.join('server', 'out', 'server.js')
	);
	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used

	// The debug options for the server
	// --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
	let debugOptions = { execArgv: ['--nolazy', '--inspect=6011'], cwd: process.cwd() };

	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	let serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc, options: { cwd: process.cwd() } },
		debug: {
			module: serverModule,
			transport: TransportKind.ipc,
			options: debugOptions
		}
	};
	const selector = { language: 'macro', scheme: 'file' };

	// Options to control the language client
	let clientOptions: LanguageClientOptions = {
		// Register the server for plain text documents
		documentSelector: [selector],

		synchronize: {
			// Notify the server about file changes 
			fileEvents: workspace.createFileSystemWatcher('**/*.{src,def}')
		},		
		diagnosticCollectionName: 'macro',
		progressOnInitialization: true,
		revealOutputChannelOn: RevealOutputChannelOn.Never,
		middleware: {
			executeCommand: async (command, args, next) => {
				if (command === 'macro.codelens.references') {
					let line = Number(args[0]);
					let char = Number(args[1]);
					let selection = new Selection(line, char, line,char);
					window.activeTextEditor.selection = selection;
					commands.executeCommand('references-view.find');
				}
			}
		}
	};
	// Create the language client and start the client.
	client = new LanguageClient(
		'macroLanguageServer',
		'Macro Language Server',
		serverOptions,
		clientOptions
	);


	client.registerProposedFeatures();
	disposables.add(registerCommands());
	context.subscriptions.push(disposables);
	
	// Start the client. This will also launch the server
	client.start();
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}
