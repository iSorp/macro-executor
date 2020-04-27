/*---------------------------------------------------------------------------------------------
 *	Copyright (c) 2020 Simon Waelti
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { ExtensionContext, workspace } from 'vscode';
import { 
	LanguageClient, LanguageClientOptions, 
	ServerOptions, TransportKind, RevealOutputChannelOn,
} from 'vscode-languageclient';
import registerCommands from './common/commands';


import CompositeDisposable from './common/CompositeDisposable';
import { downloadAndUnzipVSCode } from 'vscode-test';

let client: LanguageClient;


export function activate(context: ExtensionContext) {

	console.log('adsgsdg');

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
			// Notify the server about file changes to '.clientrc files contained in the workspace
			fileEvents: workspace.createFileSystemWatcher('**/*.{src,def}')
		},		
		diagnosticCollectionName: 'macro',
		progressOnInitialization: true,
		revealOutputChannelOn: RevealOutputChannelOn.Never,

	};


	// Create the language client and start the client.
	client = new LanguageClient(
		'macroLanguageServer',
		'Macro Language Server',
		serverOptions,
		clientOptions
	);


	client.registerProposedFeatures();

	let disposables = new CompositeDisposable();
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
