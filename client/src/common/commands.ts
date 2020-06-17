/*---------------------------------------------------------------------------------------------
 *	Copyright (c) 2020 Simon Waelti
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import * as settings from './configSettings';
import CompositeDisposable from './CompositeDisposable';
import { promises } from 'fs';


const MACRO = { language: 'macro', scheme: 'file' };
const COMPILER = ['MCOMPI', 'MCOMP0', 'MCOMP30I', 'MCOMP15', 'MCOMP15I'];

type Systems = { 
	[key: string]: {
		compiler:string; 
		linker: string; 
		card: string 
	}	
};

const BUILD_SYSTEMS:Systems = {
	'MCOMP30I': {compiler: 'MCOMP30I', linker: 'MLINK30I', card: 'MCARD30I' },
	'MCOMPI': {compiler: 'MCOMPI', linker: 'MLINKI', card: 'MMCARDI' },
	'MCOMP0': {compiler: 'MCOMP0', linker: 'MLINK', card: 'MMCARD' },
	'MCOMP15': {compiler: 'MCOMP15', linker: 'MLINK', card: 'MMCARD15' },
	'MCOMP15I': {compiler: 'MCOMP15I', linker: 'MLINK15I', card: 'MCARD15I' }
};

const CONTROL_TYPE = ['', '0', '30', 'PM', '0F'];
const build_ext_glob = ['ref','REL','PRG','ROM','MEM','MAP'];


export default function registerCommands() : CompositeDisposable {

	let disposables = new CompositeDisposable();
	disposables.add(vscode.commands.registerCommand('macro.setExportPath', setExportPath)); 
	disposables.add(vscode.commands.registerCommand('macro.setControlType', setControlType));
	disposables.add(vscode.commands.registerCommand('macro.setCompiler', setCompiler));

	const project = new ProjectService();
	disposables.add(vscode.commands.registerCommand('macro.compile', project.compile.bind(project)));
	disposables.add(vscode.commands.registerCommand('macro.build', project.build.bind(project)));
	disposables.add(vscode.commands.registerCommand('macro.clean', project.clean.bind(project)));
	
	return disposables;
}


// Set Compiler
function setCompiler() {
	let currentCompilerPath = settings.MacroSettings.getInstance().macroCompiler;
	const quickPickOptions = {
		matchOnDetail: true,
		matchOnDescription: false,
		placeHolder: `current: ${currentCompilerPath}`
	};

	vscode.window.showQuickPick(COMPILER, quickPickOptions).then(value => {
		if (value !== undefined) {
			const macroConfig = vscode.workspace.getConfiguration('macro');
			macroConfig.update('build.compiler', value).then(() => {
				//Done
			}, reason => {
				vscode.window.showErrorMessage(`Failed to set 'compilerPath'. Error: ${reason.message}`);
				console.error(reason);
			});
		}
	});
}

function setControlType ()
{	
	// Set Control type for Compiler
	let currentControlType = settings.MacroSettings.getInstance().macroControlType;
	const quickPickOptions = {
		matchOnDetail: true,
		matchOnDescription: false,
		placeHolder: `current: ${currentControlType}`
	};

	vscode.window.showQuickPick(CONTROL_TYPE, quickPickOptions).then(value => {
		if (value !== undefined) {
			const macroConfig = vscode.workspace.getConfiguration('macro');
			macroConfig.update('build.controlType', value).then(() => {
				//Done
			}, reason => {
				vscode.window.showErrorMessage(`Failed to set 'controlType'. Error: ${reason.message}`);
				console.error(reason);
			});
		}
	});
}

// Set Export Path
function setExportPath () {
	let currentExportPath = settings.MacroSettings.getInstance().macroExportPath;

	const OpenDialogOptions = {
		matchOnDetail: true,
		matchOnDescription: false,
		placeHolder: `current: ${currentExportPath}`,
		canSelectMany: false,
		canSelectFiles : false,
		canSelectFolders : true,
		openLabel: 'Select',
	};
	
	// Set Export Path
	vscode.window.showOpenDialog(OpenDialogOptions).then(value => {
		if (value !== undefined) {
			const macroConfig = vscode.workspace.getConfiguration('macro');
			macroConfig.update('project.exportPath', value[0].fsPath).then(() => {
				//Done
			}, reason => {
				vscode.window.showErrorMessage(`Failed to set 'expor path'. Error: ${reason.message}`);
				console.error(reason);
			});
		}
	});
}


class ProjectService {

	private workspacePath:string;
	constructor () {
		this.workspacePath = path.normalize(vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : '');
	}

	private getRelativePath(p:string) : string {
		const rel = path.normalize(vscode.workspace.asRelativePath(p));
		if (p === this.workspacePath) {
			return '';
		}
		return rel;
	}

	public async clean() {
		const command = await this.getCleanCommand(); 
		if (command){
			vscode.tasks.executeTask(new vscode.Task({type:'shell'}, vscode.TaskScope.Workspace, 'Clean','macro', new vscode.ShellExecution(command)));
		}
	}

	/**
	 * Compile current file 
	 */
	public async compile() {
		const command = this.getCompileCommand(); 
		if (command){
			vscode.tasks.executeTask(new vscode.Task({type:'shell'}, vscode.TaskScope.Workspace, 'Compile','macro', new vscode.ShellExecution(command)));
		}
	}

	public async build() {

		const makeFile 	= settings.MacroSettings.getInstance().macroMakeFile;
		const exportPath = settings.MacroSettings.getInstance().macroExportPath;
		const compiler 	= settings.MacroSettings.getInstance().macroCompiler;
		const type = settings.MacroSettings.getInstance().macroControlType;

		if (makeFile && makeFile.length > 0) {
			const arg = type?'-'+type:'';
			const args = [exportPath, 'make', compiler, arg];
			const t = new vscode.Task({ type: 'shell'}, vscode.TaskScope.Workspace, 'Make', 'macro', new vscode.ShellExecution('.\\'+makeFile, args));
			vscode.tasks.executeTask(t);
			return;
		}

		const compileCommand  = new Promise<string>(async (resolve, reject) => {
			const source = this.getRelativePath(settings.MacroSettings.getInstance().macroSourcePath);
			
			let glob = '**/*.{[sS][rR][cC]}';
			if (source){
				glob = path.join(source, '/', glob);
			}
	
			const srcFiles = await vscode.workspace.findFiles(glob);
			if (!srcFiles){
				reject();
				return;
			}
	
			// filter file directories to compile all files in a directory at once
			let dirs:string[] = srcFiles.map(a => path.dirname(a.fsPath));
			dirs = dirs.filter((v,i) => dirs.indexOf(v) === i);
			
			const lines:string[] = [];
			for (const dir of dirs) {
				const command = this.getCompileCommand(dir); 
				if (command){
					lines.push(command);
					lines.push('\n\r');
				}
			}
			resolve(lines.join(' '));
		});

		const linkCommand = this.getLinkCommand(); 
		const result = await Promise.all([compileCommand, linkCommand]);

		const buildPath = settings.MacroSettings.getInstance().macroBuildPath;
		if (buildPath){
			await vscode.workspace.fs.createDirectory(vscode.Uri.file(buildPath));
		}

		if (result[0] && result[1]) {
			vscode.tasks.executeTask(new vscode.Task({type:'shell'}, vscode.TaskScope.Workspace, 'Make','macro', new vscode.ShellExecution(result[0]+result[1])));
		}
	}

	public getCompileCommand(dir:string|undefined=undefined) : string | undefined {
		const compiler = settings.MacroSettings.getInstance().macroCompiler;
		const type = settings.MacroSettings.getInstance().macroControlType;
		const prm = settings.MacroSettings.getInstance().macroCompilerParams;
		const buildPath = settings.MacroSettings.getInstance().macroBuildPath;
		const currentFile = vscode.window.activeTextEditor?.document.uri.fsPath;

		let args:any[] = [];
		let fileDir = '';
		let filesPattern = '';
		
		if (dir !== undefined) {
			const relativ = this.getRelativePath(dir);
			fileDir = relativ;
			filesPattern = path.join(relativ, '*.src');
		}
		else if (currentFile){
			fileDir = this.getRelativePath(path.dirname(currentFile));
			filesPattern = this.getRelativePath(currentFile);
		}
		else {
			return undefined;
		}
		
		if (buildPath){
			const buildDir = this.getRelativePath(buildPath);
			args = [
				filesPattern,
				'-' 	+ type,
				prm,
				'-Fo'	+ buildDir,
				'-Fr'	+ buildDir,
				'-Fp'	+ buildDir,
				'-Fl'	+ fileDir
			];
		}
		else {
			args = [
				filesPattern,
				'-' 	+ type,
				prm,
				'-Fl'	+ fileDir
			];
		}
		return compiler + ' '+ args.join(' ') + '\n\r';
	}

	public async getLinkCommand(dir:string|undefined=undefined) : Promise<string | undefined> {

		const buildPath = settings.MacroSettings.getInstance().macroBuildPath;
		const exportPath = settings.MacroSettings.getInstance().macroExportPath;
		const compiler 	= settings.MacroSettings.getInstance().macroCompiler;
		const link = this.getRelativePath(settings.MacroSettings.getInstance().macroLinkPath);

		let glob = '**/*.{[lL][nN][kK]}';
		if (link){
			glob = path.join(link,'/', glob);
		}

		const lnkFiles = await vscode.workspace.findFiles(glob);
		if (!lnkFiles) {
			return undefined;
		}

		const lines:string[] = [];
		lines.push('\n\r');
		
		
		let linkPath = '';
		if (buildPath) {
			lines.push('cd ' + buildPath);
			lines.push('\n\r');
			linkPath = '..\\';
		}

		for (const file of lnkFiles) {	
			lines.push(BUILD_SYSTEMS[compiler].linker);
			lines.push(linkPath + this.getRelativePath(file.fsPath));
			lines.push('\n\r');
			lines.push(BUILD_SYSTEMS[compiler].card);
			lines.push(path.parse(this.getRelativePath(path.basename(file.fsPath))).name);
			lines.push('\n\r');
		}	

		if (exportPath) {
			const exportAbs = this.getRelativePath(exportPath);
			if (exportAbs){
				lines.push('cd ..');
				lines.push('\n\r');
				lines.push('copy *.mem');
				lines.push(exportAbs);
			}
		}		
		return lines.join(' ');
	}

	public async getCleanCommand() : Promise<string> {
		const makeFile = settings.MacroSettings.getInstance().macroMakeFile;
		// Execute internal build script
		if (makeFile === undefined || makeFile === '') {
			let source = this.getRelativePath(settings.MacroSettings.getInstance().macroSourcePath);
			let build = this.getRelativePath(settings.MacroSettings.getInstance().macroBuildPath);
			if (source){
				source = path.join(source,'/');
			}
			else {
				source = '';
			}
			if (build){
				build = path.join(build,'/');
			}
			else {
				build = '';
			}
			const lines:string[] = [];
			lines.push('del ' + source + '*.LST');
			lines.push('\n\r');
	
			for (const ext of build_ext_glob){
				lines.push('del ' + build + '*.'+ ext);
				lines.push('\n\r');
			}
			return lines.join(' ');
		}
		else {
			const make = this.getRelativePath(path.dirname(makeFile));
			let glob = '**/{[cC][lL][eE][aA][nN]}.*';
			if (make) {
				glob = path.join(make, '/', glob);
			}

			const files = await vscode.workspace.findFiles(glob);
			if (files.length > 0) {		
				const cleanFile = this.getRelativePath(files[0].fsPath);
				return '.\\' + cleanFile;
			}
			else {
				return '.\\' + makeFile + ' ' + ['0', 'clean'].join(' ');
			}
		}
	}
}
