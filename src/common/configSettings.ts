'use strict';
const vscode = require('vscode');
const events = require('events');
const IS_TEST_EXECUTION = false;


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
        const workspaceRoot = (IS_TEST_EXECUTION || typeof vscode.workspace.rootPath !== 'string') ? __dirname : vscode.workspace.rootPath;
   
        let macroSettings = vscode.workspace.getConfiguration('macro');
        this.macroCompilerPath = macroSettings.build.compiler;
        this.macroControlType = macroSettings.build.controlType;
        this.macroMakeFile = macroSettings.build.makeFile;
        this.macroExportPath = macroSettings.project.exportPath;
        this.macroSourcePath = macroSettings.project.sourcePath;
        this.macroBuildPath = macroSettings.project.buildPath;
        this.macroLinkPath = macroSettings.project.linkPath;
    }
}
MacroSettings.macroSettings = new MacroSettings();
exports.MacroSettings = MacroSettings;