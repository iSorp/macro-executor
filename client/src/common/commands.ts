/*---------------------------------------------------------------------------------------------
 *	Copyright (c) 2020 Simon Waelti
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import * as settings from './configSettings';
import CompositeDisposable from './CompositeDisposable';


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
}

const CONTROL_TYPE = ['', '-0', '-30', '-PM', '-0F'];
const build_ext_glob = 'ref,REL,PRG,LST,ROM,MEM,MAP,tmp.lnk';


export default function registerCommands() : CompositeDisposable {

	let disposables = new CompositeDisposable();
	disposables.add(vscode.commands.registerCommand('macro.setExportPath', setExportPath)); 
	disposables.add(vscode.commands.registerCommand('macro.setControlType', setControlType));
	disposables.add(vscode.commands.registerCommand('macro.setCompiler', setCompiler));

	const project = new ProjectService();
	disposables.add(vscode.commands.registerCommand('macro.compile', project.compile.bind(project)));
	disposables.add(vscode.commands.registerCommand('macro.build', project.link.bind(project)));
	disposables.add(vscode.commands.registerCommand('macro.clean', project.clean.bind(project)));
	
	return disposables;
}


// Set Compiler
function setCompiler() {
	let currentCompilerPath = settings.MacroSettings.getInstance().macroCompilerPath;
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

	private workspace:string;
	private workspacePath:string;

	constructor () {
		this.workspace = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath + '/' : '';
		this.workspacePath = path.normalize(this.workspace + '/').toLocaleLowerCase();
	}

	private getRelPath(pathAbs:string) : string | undefined {
		let pathRel:string | undefined;
		if (pathAbs){
			pathRel = pathAbs;
			if (path.isAbsolute(pathAbs)) {
				const p = String(path.normalize(pathRel).toLocaleLowerCase()).split(this.workspacePath).pop();
				if (p) {
					pathRel = p;
				}
			}
		}		
		return pathRel;
	}

	private getAbsPath(relPath:string) : string | undefined {
		// absolute build path
		let pathAbs:string | undefined = undefined;
		if (relPath){
			pathAbs = path.normalize(relPath);
			if (!path.isAbsolute(relPath)){
				pathAbs = path.normalize(this.workspace + '/' + relPath);
			}
		}
		return pathAbs;
	}

	/**
	 * Compile current file 
	 */
	public async compile() {

		const compiler = settings.MacroSettings.getInstance().macroCompilerPath;
		const type = settings.MacroSettings.getInstance().macroControlType;
		const currentFile = vscode.window.activeTextEditor?.document.uri.fsPath;
		if (!currentFile){
			return;
		}

		const fileDir = path.dirname(currentFile);
		
		let build = this.getAbsPath(settings.MacroSettings.getInstance().macroBuildPath);
		if (!build) {
			build = '';
		}

		let arg = '';
		if (type !== undefined && type !== ''){
			arg = type;
		}

		let bscript = compiler + ' ' + currentFile + ' ' + arg;
		bscript = bscript + ' -Fo'+ build  +' -Fr'+ build  +' -Fp'+ build;
		bscript = bscript + ' -Fl'+ fileDir;
		
		const t = new vscode.Task({type:'shell'}, vscode.TaskScope.Workspace, 'Compile','macro', new vscode.ShellExecution(bscript));
		await vscode.tasks.executeTask(t);
	}

	/**
	 * Compile and link workspace
	 */
	public async link() {
		const makeFile 	= settings.MacroSettings.getInstance().macroMakeFile;
		const exportPath = settings.MacroSettings.getInstance().macroExportPath;
		const compiler 	= settings.MacroSettings.getInstance().macroCompilerPath;
		const type = settings.MacroSettings.getInstance().macroControlType;

		let arg = '';
		if (type !== undefined && type !== ''){
			arg = type;
		}

		// Execute internal build script
		if (makeFile === undefined || makeFile === '') {
			const link = this.getRelPath(settings.MacroSettings.getInstance().macroLinkPath);
			let buildPath = this.getAbsPath(settings.MacroSettings.getInstance().macroBuildPath);

			const lnkFiles = await new Promise<vscode.Uri[]>(async (resolve, reject) => {
				vscode.workspace.findFiles('**/'+link+'/**/*.{[lL][nN][kK]}').then(files => {
					resolve(files);
				});
			});
			if (!lnkFiles){return;}
	
			if (buildPath){
				await vscode.workspace.fs.createDirectory(vscode.Uri.file(buildPath));
			}
			else {
				buildPath = '';
			}
	
			let bscript = ''; 
			let link_string = '';
			let mmcard_string = '';
			let mcomp_string = '';

			for (const file of lnkFiles) {
				const filename = path.basename(file.fsPath);	// separate file name
				link_string = link_string + BUILD_SYSTEMS[compiler].linker +' ' + file.fsPath +'\n\r'; 
				mmcard_string = mmcard_string + BUILD_SYSTEMS[compiler].card +' ' + path.parse(filename).name +'\n\r'; // remove extension
			}

			const srcFiles = await new Promise<vscode.Uri[]>(async (resolve, reject) => {
				const source = this.getRelPath(settings.MacroSettings.getInstance().macroSourcePath);
				vscode.workspace.findFiles('**/'+source+'/**/*.{[sS][rR][cC]}').then(files => {
					resolve(files);
				});
			});
			if (!srcFiles){return;}

			for (const file of srcFiles) {
				const dir = path.dirname(file.fsPath);
				mcomp_string += BUILD_SYSTEMS[compiler].compiler +' ' + file.fsPath +' ' + arg +' -Fl'+ dir + ' -Fo'+buildPath+' -Fr'+buildPath+' -Fp'+buildPath +'\n\r';
			}

			bscript 		+= mcomp_string;
			bscript 		+= 'cd ' + buildPath +'\n\r';
			bscript 		+= link_string;
			bscript 		+= mmcard_string;
			bscript 		+= exportPath ? 'copy *.mem ' + exportPath : '';

			const def = { type: 'shell'};
			const t = new vscode.Task(def, vscode.TaskScope.Workspace, 'Build', 'macro', new vscode.ShellExecution(bscript), '$macro');
			vscode.tasks.executeTask(t);
		} 
		else {
			// External Make file
			const args = [exportPath, 'make', compiler, arg];
			const def = { type: 'shell'};
			const t = new vscode.Task(def, vscode.TaskScope.Workspace, 'Make', 'macro', new vscode.ShellExecution(makeFile + ' ' + args));
			vscode.tasks.executeTask(t);
		} 
	}
	
	/**
	 * Cleanup workspace
	 */
	public clean() {
		const makeFile = settings.MacroSettings.getInstance().macroMakeFile;
		// Execute internal build script
		if (makeFile === undefined || makeFile === '') {

			const source = this.getRelPath(settings.MacroSettings.getInstance().macroSourcePath);
			vscode.workspace.findFiles('**/'+source+'/**/*.{'+build_ext_glob+'}', ).then(files => { 
				files.forEach(file => {
					vscode.workspace.fs.delete(file, {useTrash:false});
				});
			});

			const build = this.getRelPath(settings.MacroSettings.getInstance().macroBuildPath);
			vscode.workspace.findFiles('**/'+build+'/**/*.{'+build_ext_glob+'}', ).then(files => { 
				files.forEach(file => {
					vscode.workspace.fs.delete(file, {useTrash:false});
				});
			});
		}
		else {
			const def = { type: 'shell' };
			vscode.workspace.findFiles('clean').then(value => { 
				if (value.length > 0) {					
					const t = new vscode.Task(def, 'Clean', 'Workspace', new vscode.ShellExecution('.\\clean'));
					vscode.tasks.executeTask(t);
				}
				else {
					const args = ['0', 'clean'];
					const t = new vscode.Task(def, vscode.TaskScope.Workspace, 'Clean', 'macro', new vscode.ShellExecution('.\\'+ makeFile + ' ' + args));
					vscode.tasks.executeTask(t);
				}
			});
		}
	}
}
