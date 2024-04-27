/*---------------------------------------------------------------------------------------------
 *	Copyright (c) 2020 Simon Waelti
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import CompositeDisposable from './compositeDisposable';
import { pickFolder } from '../extension';

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
async function setCompiler() {
	pickFolder(workspace => {
		const config = vscode.workspace.getConfiguration('macro', workspace);
		const quickPickOptions = {
			matchOnDetail: true,
			matchOnDescription: false,
			placeHolder: `current: ${config.build.compiler}`
		};
	
		vscode.window.showQuickPick(COMPILER, quickPickOptions).then(value => {
			if (value !== undefined) {
				config.update('build.compiler', value, vscode.ConfigurationTarget.WorkspaceFolder).then(() => {
					//Done
				}, reason => {
					vscode.window.showErrorMessage(`Failed to set 'compilerPath'. Error: ${reason.message}`);
					console.error(reason);
				});
			}
		});
	});
}

async function setControlType () {
	pickFolder(workspace => {
		const config = vscode.workspace.getConfiguration('macro', workspace);
		const quickPickOptions = {
			matchOnDetail: true,

			matchOnDescription: false,
			placeHolder: `current: ${config.build.controlType}`
		};

		vscode.window.showQuickPick(CONTROL_TYPE, quickPickOptions).then(value => {
			if (value !== undefined) {
				config.update('build.controlType', value, vscode.ConfigurationTarget.WorkspaceFolder).then(() => {
					//Done
				}, reason => {
					vscode.window.showErrorMessage(`Failed to set 'controlType'. Error: ${reason.message}`);
					console.error(reason);
				});
			}
		});
	});
}

// Set Export Path
function setExportPath () {
	const config = vscode.workspace.getConfiguration('macro');
	const OpenDialogOptions = {
		matchOnDetail: true,
		matchOnDescription: false,
		placeHolder: `current: ${config.project.exportPath}`,
		canSelectMany: false,
		canSelectFiles : false,
		canSelectFolders : true,
		openLabel: 'Select',
	};

	// Set Export Path
	vscode.window.showOpenDialog(OpenDialogOptions).then(value => {
		if (value !== undefined) {
			const macroConfig = vscode.workspace.getConfiguration('macro');
			macroConfig.update('project.exportPath', value[0].fsPath, vscode.ConfigurationTarget.Global).then(() => {
			//Done
			}, reason => {
				vscode.window.showErrorMessage(`Failed to set 'export path'. Error: ${reason.message}`);
				console.error(reason);
			});
		}
	});
}

class ProjectService {

	private getRelativePath(p:string, workspacePath:string, includeWsFolder:boolean = false) : string {
		const rel = path.normalize(vscode.workspace.asRelativePath(p, includeWsFolder));
		if (p === workspacePath) {
			return '';
		}
		return rel;
	}

	public async clean() {
		pickFolder(async workspace => {
			const command = await this.getCleanCommand(workspace); 
			if (command){
				vscode.tasks.executeTask(new vscode.Task({type:'shell'}, workspace, 'Clean','macro', new vscode.ShellExecution(command)));
			}
		});
	}

	/**
	 * Compile current file 
	 */
	public async compile() {
		const workspace = vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri);
		if (workspace) {
			const command = this.getCompileCommand(workspace); 
			if (command){
				vscode.tasks.executeTask(new vscode.Task({type:'shell'}, workspace, 'Compile','macro', new vscode.ShellExecution(command),'$macro'));
			}
		}
	}

	public async build() {
	
		pickFolder(async workspace => {
			
			const config = vscode.workspace.getConfiguration('macro', workspace);

			if (config.validate.onBuild) {
				vscode.commands.executeCommand('macro.action.validate', workspace.uri.toString());	
			}
			
			const makeFile 	= config.build.makeFile;
			const exportPath= config.project.exportPath;
			const compiler 	= config.build.compiler;
			const type 		= config.build.controlType;

			if (makeFile && makeFile.length > 0) {
				const arg = type?'-'+type:'';
				const args = [exportPath, 'make', compiler, arg];
				const t = new vscode.Task({ type: 'shell'}, workspace, 'Make', 'macro', new vscode.ShellExecution('.\\'+makeFile, args));
				vscode.tasks.executeTask(t);
				return;
			}

			const compileCommand  = new Promise<string>(async (resolve, reject) => {
				const source = this.getRelativePath(config.project.sourcePath, workspace.uri.fsPath, true);
				let glob = '**/*.{[sS][rR][cC]}';
				if (source){
					glob = path.join(source, '/', glob);
				}
				const srcFiles = await vscode.workspace.findFiles(new vscode.RelativePattern(workspace, glob));
				if (!srcFiles){
					reject();
					return;
				}
	
				// filter file directories to compile all files in a directory at once
				let dirs:string[] = srcFiles.map(a => path.dirname(a.fsPath));
				dirs = dirs.filter((v,i) => dirs.indexOf(v) === i);
			
				const lines:string[] = [];
				for (const dir of dirs) {
					const command = this.getCompileCommand(workspace, dir); 
					if (command){
						lines.push(command);
						lines.push('\n\r');
					}
				}
				resolve(lines.join(' '));
			});

			const linkCommand = this.getLinkCommand(workspace); 
			const result = await Promise.all([compileCommand, linkCommand]);

			const buildPath = config.project.buildPath;
			if (buildPath){
				await vscode.workspace.fs.createDirectory(vscode.Uri.file(buildPath));
			}

			if (result[0] && result[1]) {
				vscode.tasks.executeTask(new vscode.Task({type:'shell'}, workspace, 'Make','macro', new vscode.ShellExecution(result[0]+result[1]),'$macro'));
			}
		});
	}

	public getCompileCommand(workspace:vscode.WorkspaceFolder, dir:string|undefined=undefined) : string | undefined {
		const config = vscode.workspace.getConfiguration('macro', workspace);
		const compiler 	= config.build.compiler;
		const type 		= config.build.controlType;
		const prm 		= config.build.compilerParams;
		const buildPath	= config.project.buildPath;
		const currentFile = vscode.window.activeTextEditor?.document.uri.fsPath;

		let fileDir = '';
		let filesPattern = '';

		if (dir !== undefined) {
			const relativ = this.getRelativePath(dir, workspace.uri.fsPath);
			fileDir = relativ;
			filesPattern = path.join(relativ, '*.src');
		}
		else if (currentFile){
			fileDir = this.getRelativePath(path.dirname(currentFile), workspace.uri.fsPath);
			filesPattern = this.getRelativePath(currentFile, workspace.uri.fsPath);
		}
		else {
			return undefined;
		}

		let args:any[] = [];
		args.push(filesPattern);
		args.push('-'+type);
		args.push(prm);

		if (buildPath){
			const buildDir = this.getRelativePath(buildPath, workspace.uri.fsPath);
			args.push('-Fo' + buildDir);
			args.push('-Fr' + buildDir);
			args.push('-Fp' + buildDir);
		}

		if (fileDir) {
			args.push('-Fl' + fileDir);
		}
		return compiler + ' '+ args.join(' ');
	}

	public async getLinkCommand(workspace:vscode.WorkspaceFolder, dir:string|undefined=undefined) : Promise<string | undefined> {
		const config 	= vscode.workspace.getConfiguration('macro', workspace);
		const buildPath	= config.project.buildPath;
		const exportPath= config.project.exportPath;
		const compiler 	= config.build.compiler;
		const params 	= config.build.linkerParams;
		const link 		= this.getRelativePath(config.project.linkPath, workspace.uri.fsPath);

		let glob = '**/*.{[lL][nN][kK]}';
		if (link){
			glob = path.join(link,'/', glob);
		}

		const lnkFiles = await vscode.workspace.findFiles(new vscode.RelativePattern(workspace, glob));
		if (!lnkFiles) {
			return undefined;
		}

		const lines:string[] = [];		
		let linkPath = '';
		if (buildPath) {
			lines.push('cd ' + buildPath);
			lines.push('\n\r');
			linkPath = '..\\';
		}

		for (const file of lnkFiles) {	
			lines.push(BUILD_SYSTEMS[compiler].linker + ' ' + params);
			lines.push(linkPath + this.getRelativePath(file.fsPath, workspace.uri.fsPath));
			lines.push('\n\r');
			lines.push(BUILD_SYSTEMS[compiler].card);
			lines.push(path.parse(this.getRelativePath(path.basename(file.fsPath), workspace.uri.fsPath)).name);
			lines.push('\n\r');
		}	

		if (exportPath) {
			let p = '';
			if (path.isAbsolute(exportPath)) {
				p = path.normalize(exportPath);
			}
			else {
				p = path.join('..\\',this.getRelativePath(exportPath, workspace.uri.fsPath));
			}
			lines.push('copy *.mem');
			lines.push(p);
		}		
		return lines.join(' ');
	}

	public async getCleanCommand(workspace:vscode.WorkspaceFolder) : Promise<string> {
		const config 	= vscode.workspace.getConfiguration('macro', workspace);
		const makeFile	= config.build.makeFile;

		// Execute internal build script
		if (makeFile === undefined || makeFile === '') {

			
			let source = this.getRelativePath(config.project.sourcePath, workspace.uri.fsPath);
			let build = this.getRelativePath(config.project.buildPath, workspace.uri.fsPath);
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
			const make = this.getRelativePath(path.dirname(makeFile), workspace.uri.fsPath);
			let glob = '**/{[cC][lL][eE][aA][nN]}.*';
			if (make) {
				glob = path.join(make, '/', glob);
			}

			const files = await vscode.workspace.findFiles(new vscode.RelativePattern(workspace, glob));
			if (files.length > 0) {		
				const cleanFile = this.getRelativePath(files[0].fsPath, workspace.uri.fsPath);
				return '.\\' + cleanFile;
			}
			else {
				return '.\\' + makeFile + ' ' + ['0', 'clean'].join(' ');
			}
		}
	}
}
