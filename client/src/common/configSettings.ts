/*---------------------------------------------------------------------------------------------
 *	Copyright (c) 2020 Simon Waelti
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
const vscode = require('vscode');
const events = require('events');

export class MacroSettings extends events.EventEmitter {
	constructor() {
		super();
		this.disposables = [];
		if (MacroSettings.macroSettings) {
			throw new Error('Singleton class, Use getInstance method');
		}
		this.disposables.push(vscode.workspace.onDidChangeConfiguration(() => {
			this.initializeSettings();
		}));
		this.initializeSettings();
	}
	static getInstance() {
		return MacroSettings.macroSettings;
	}
	initializeSettings() {
		let macroSettings = vscode.workspace.getConfiguration('macro');
		this.macroCompiler = macroSettings.build.compiler;
		this.macroControlType = macroSettings.build.controlType;
		this.macroCompilerParams = macroSettings.build.compilerParams;
		this.macroMakeFile = macroSettings.build.makeFile;
		this.macroExportPath = macroSettings.project.exportPath;
		this.macroSourcePath = macroSettings.project.sourcePath;
		this.macroBuildPath = macroSettings.project.buildPath;
		this.macroLinkPath = macroSettings.project.linkPath;
		this.sequenceStart = macroSettings.sequence.start;
		this.sequenceInc = macroSettings.sequence.inc;
	}
}
MacroSettings.macroSettings = new MacroSettings();
exports.MacroSettings = MacroSettings;