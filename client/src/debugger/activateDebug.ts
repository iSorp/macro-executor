/*---------------------------------------------------------------------------------------------
* Copyright (c) 2020 Simon Waelti
* Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

'use strict';
import * as vscode from 'vscode';
import {
	WorkspaceFolder,
	DebugConfiguration,
	ProviderResult,
	CancellationToken
} from 'vscode';
import MacroDebugSession from './debugAdapter';
import { LanguageClient } from 'vscode-languageclient/node';

export function activateMacroDebug(languageClient: LanguageClient, context: vscode.ExtensionContext, factory?: vscode.DebugAdapterDescriptorFactory) {

	context.subscriptions.push(vscode.commands.registerCommand('extension.macro.getGrpcServer', async config => {
		const input = await vscode.window.showInputBox({
			placeHolder: 'Please enter the grpc server endpoint which communicates with the cnc',
			value: 'localhost:9000'
		});

		return input || 'localhost:9000';
	}));

	const provider = new MacroConfigurationProvider();
	context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('macro', provider));

	if (!factory) {
		factory = new InlineDebugAdapterFactory(languageClient);
	}
	const disposable = vscode.debug.registerDebugAdapterDescriptorFactory('macro', factory);

	if ('dispose' in factory) {
		context.subscriptions.push(disposable); 
	}
}

class MacroConfigurationProvider implements vscode.DebugConfigurationProvider {

	resolveDebugConfiguration(folder: WorkspaceFolder | undefined, config: DebugConfiguration, token?: CancellationToken): ProviderResult<DebugConfiguration> {

		// if launch.json is missing or empty
		if (!config.type && !config.request && !config.name) {
			const editor = vscode.window.activeTextEditor;
			if (editor && editor.document.languageId === 'macro') {
				config.type = 'macro';
				config.name = 'Start Grpc debug server';
				config.request = 'launch';
				config.grpcServer = '${command:AskForGrpcServer}';
			}
		}

		const cncPaths = Array.from<number>(config.cncPaths);
		if (cncPaths) {
			if (new Set(cncPaths).size !== cncPaths.length){
				return vscode.window.showErrorMessage('Configuration cncPaths contains duplicates').then(_ => {
					return undefined;
				});
			}

			if (Math.min(...cncPaths) < 1 || Math.max(...cncPaths) > 15) {
				vscode.window.showErrorMessage('Configuration cncPaths contains a invalid path number').then(_ => {
					return undefined;
				});
			}
		}

		if (!config.grpcServer) {
			return vscode.window.showInformationMessage('A valid grpc endpoint is required').then(_ => {
				return undefined;
			});
		}

		return config;
	}
}

class InlineDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {

	constructor(private languageClient: LanguageClient) {}

	createDebugAdapterDescriptor(_session: vscode.DebugSession): ProviderResult<vscode.DebugAdapterDescriptor> {
		return new vscode.DebugAdapterInlineImplementation(new MacroDebugSession(this.languageClient));
	}

	dispose() : void {}
}