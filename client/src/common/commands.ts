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

const CONTROL_TYPE = ['', '0', '30', 'PM', '0F'];
const build_ext_glob = 'ref,REL,PRG,ROM,MEM,MAP,tmp.lnk';


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
		this.workspacePath = path.dirname(path.normalize(this.workspace + '/').toLocaleLowerCase());
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
		
		let buildPath = this.getAbsPath(settings.MacroSettings.getInstance().macroBuildPath);
		if (!buildPath) {
			buildPath = this.workspacePath;;
		}

		let arg = '';
		if (type !== undefined && type !== ''){
			arg = '-'+type;
		}

		let bscript = compiler + ' ' + currentFile + ' ' + arg;
		if (buildPath){
			bscript = bscript + ' -Fo'+ buildPath  +' -Fr'+ buildPath  +' -Fp'+ buildPath;
		}
		bscript = bscript + ' -Fl'+ fileDir;
		
		const t = new vscode.Task({type:'shell'}, vscode.TaskScope.Workspace, 'Compile','macro', new vscode.ShellExecution(bscript));
		vscode.tasks.executeTask(t);
	}

	/**
	 * Compile and link workspace
	 */
	public async link() {
		let makeFile 	= settings.MacroSettings.getInstance().macroMakeFile;
		const exportPath = settings.MacroSettings.getInstance().macroExportPath;
		const compiler 	= settings.MacroSettings.getInstance().macroCompilerPath;
		const type = settings.MacroSettings.getInstance().macroControlType;

		let arg = '';
		if (type !== undefined && type !== ''){
			arg = '-'+type;
		}

		// Execute internal build script
		if (makeFile === undefined || makeFile === '') {
			let link = vscode.workspace.asRelativePath(settings.MacroSettings.getInstance().macroLinkPath);
			if (link){
				link = path.join(link, '/');
			}
			else {
				link = '';
			}

			const lnkFiles = await vscode.workspace.findFiles(link+'**/*.{[lL][nN][kK]}');
			if (!lnkFiles){return;}
	
			const buildPath = this.getAbsPath(settings.MacroSettings.getInstance().macroBuildPath);
			if (buildPath){
				await vscode.workspace.fs.createDirectory(vscode.Uri.file(buildPath));
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

			let source = vscode.workspace.asRelativePath(settings.MacroSettings.getInstance().macroSourcePath);
			if (source){
				source = path.join(source, '/');
			}
			else {
				source = '';
			}

			const srcFiles = await vscode.workspace.findFiles(source+'**/*.{[sS][rR][cC]}');
			if (!srcFiles){return;}

			// filter file directories to compile all files in a directory at once
			let dirs:string[] = srcFiles.map(a => path.dirname(a.fsPath))
			dirs = dirs.filter((v,i) => dirs.indexOf(v) === i);
	
			for (const dir of dirs) {
				const filesPattern = path.join(dir,'/', '*.src');
				if (buildPath){
					mcomp_string += BUILD_SYSTEMS[compiler].compiler +' ' + filesPattern +' ' + arg +' -Fl'+ dir + ' -Fo'+buildPath+' -Fr'+buildPath+' -Fp'+buildPath +'\n\r';
				}
				else {
					mcomp_string += BUILD_SYSTEMS[compiler].compiler +' ' + filesPattern +' ' + arg +' -Fl'+ dir + '\n\r';
				}
			}

			bscript 		+= mcomp_string;
			bscript 		+= buildPath ? 'cd ' + buildPath +'\n\r' : '';
			bscript 		+= link_string;
			bscript 		+= mmcard_string;
			bscript 		+= exportPath ? 'copy *.mem ' + exportPath : '';

			const def = { type: 'shell'};
			const t = new vscode.Task(def, vscode.TaskScope.Workspace, 'Build', 'macro', new vscode.ShellExecution(bscript), '$macro');
			vscode.tasks.executeTask(t);
		} 
		else {
			// External Make file
			makeFile = this.getAbsPath(makeFile);
			const args = [exportPath, 'make', compiler, arg];
			const def = { type: 'shell'};
			const t = new vscode.Task(def, vscode.TaskScope.Workspace, 'Make', 'macro', new vscode.ShellExecution(makeFile + ' ' + args));
			vscode.tasks.executeTask(t);
		} 
	}
	
	/**
	 * Cleanup workspace
	 */
	public async clean() {
		let makeFile = settings.MacroSettings.getInstance().macroMakeFile;
		// Execute internal build script
		if (makeFile === undefined || makeFile === '') {

			let source = vscode.workspace.asRelativePath(settings.MacroSettings.getInstance().macroSourcePath);
			if (source){
				source += '/';
			}
			else {
				source = '';
			}
			vscode.workspace.findFiles(source+'**/*.LST').then(files => { 
				files.forEach(file => {
					vscode.workspace.fs.delete(file, {useTrash:false});
				});
			});

			let build = vscode.workspace.asRelativePath(settings.MacroSettings.getInstance().macroBuildPath);
			if (build){
				build += '/';
			}
			else {
				build = '';
			}
			const files = await vscode.workspace.findFiles(build+'**/*.{'+build_ext_glob+'}');
			for (const file of files){
				vscode.workspace.fs.delete(file, {useTrash:false});
			}
		}
		else {
			makeFile = this.getAbsPath(makeFile);

			let dir = vscode.workspace.asRelativePath(path.dirname(makeFile), false);
			if (path.isAbsolute(dir)){
				dir = '';
			}
			else {
				dir = path.join(dir, '/');
			}

			const files = await vscode.workspace.findFiles(dir + '**/{[cC][lL][eE][aA][nN]}.*');

			const def = { type: 'shell' };
			if (files.length > 0) {					
				const t = new vscode.Task(def, 'Clean', 'Workspace', new vscode.ShellExecution(files[0].fsPath));
				vscode.tasks.executeTask(t);
			}
			else {
				const args = ['0', 'clean'];
				const t = new vscode.Task(def, vscode.TaskScope.Workspace, 'Clean', 'macro', new vscode.ShellExecution(makeFile + ' ' + args));
				vscode.tasks.executeTask(t);
			}
		}
	}
}
