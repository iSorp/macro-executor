/*---------------------------------------------------------------------------------------------
 *	Copyright (c) 2020 Simon Waelti
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as settings from './configSettings';
import CompositeDisposable from './CompositeDisposable';


const MACRO = { language: 'macro', scheme: 'file' };
const LINKERS = ['MCOMPI', 'MCOMP0'];
const CONTROL_TYPE = ['0', '30'];

const build_ext = [
	'rel',
	'prg',
	'ref',
	'lst',
	'bak',
	'rom',
	'mem',
	'map',
	'err',
	'tmp',
	're$'
];


export default function registerCommands() : CompositeDisposable {

	let disposables = new CompositeDisposable();
	disposables.add(vscode.commands.registerCommand('macro.setExportPath', setExportPath)); 
	disposables.add(vscode.commands.registerCommand('macro.setControlType', setControlType));
	disposables.add(vscode.commands.registerCommand('macro.setCompiler', setCompiler));

	disposables.add(vscode.commands.registerCommand('macro.compile', compile));
	disposables.add(vscode.commands.registerCommand('macro.build', build));
	disposables.add(vscode.commands.registerCommand('macro.clean', clean));

	return disposables;
}

function compile() : Promise<void> {
	return new Promise<void>((resolve, reject) => {
		let compiler 		= settings.MacroSettings.getInstance().macroCompilerPath;
		let source 			= settings.MacroSettings.getInstance().macroSourcePath;
		let build 			= settings.MacroSettings.getInstance().macroBuildPath;
		let currentFile 	= vscode.window.activeTextEditor?.document.uri.fsPath;
		let arg 			= ' -' + settings.MacroSettings.getInstance().macroControlType;
		if (compiler !== 'MCOMPI'){
			arg = '';
		} 
		let args = ' ' + arg;
		if (build !== undefined && build !== '') {
			args = args + ' -Fo'+ build  +' -Fr'+ build  +' -Fp'+ build;
		}
		if (source !== undefined && source !== '') {
			args = args +' -Fl'+ source;
		}
		
		let def = { 
			type: 'shell', 
			id: 'shell',
		};
		let t = new vscode.Task(def, vscode.TaskScope.Workspace, 'Compile','macro', 
			new vscode.ShellExecution(compiler + ' ' + currentFile + args), '$macro');

		vscode.tasks.executeTask(t);
	});
}

// Compilieren und linken
function build() {
	let makeFile 		= settings.MacroSettings.getInstance().macroMakeFile;
	let exportPath 		= settings.MacroSettings.getInstance().macroExportPath;
	let source 			= settings.MacroSettings.getInstance().macroSourcePath;
	let link 			= settings.MacroSettings.getInstance().macroLinkPath;
	let build 			= settings.MacroSettings.getInstance().macroBuildPath;
	let compiler 		= settings.MacroSettings.getInstance().macroCompilerPath;
	let arg = ' -' 		+ settings.MacroSettings.getInstance().macroControlType;
	if (compiler !== 'MCOMPI'){
		arg = '';
	} 

	// Execute internal build script
	if (makeFile === undefined || makeFile === '') {
		vscode.workspace.findFiles('**/*.{lnk,LNK}', ).then(value =>{

			let link_string = '';
			let mmcard_string = '';
			value.forEach(element => {
				let filename = element.fsPath.replace(/^.*(\\|\/|\:)/, '');	// separate file name
				if (link !== undefined && link !== '') {
					link_string = link_string + 'MLINKI  ..\\'+link+'\\'+filename+'\n\r'; 
				}
				else{
					link_string = link_string + 'MLINKI ' +filename+'\n\r'; 
				}
				mmcard_string = mmcard_string + 'MMCARDI ' + filename.replace(/(\.).*/, '') +'\n\r'; // remove extension
			});

			let bscript = ''; 	
			if (link !== undefined && link !== '') {
				bscript				+='ATTRIB -R '+ link +'\\*.lnk" \n\r';
			}
			else {
				bscript				+='ATTRIB -R *.lnk" \n\r';
			}
			if (build !== undefined && build !== '') {
				bscript 			+= 'mkdir ' + build + '\n\r';
			}
			if (source !== undefined && source !== '') {
				bscript 			+= compiler + ' ' + source +'\\*.src ' + arg +' -Fl'+source;
			}
			else{
				bscript 			+= compiler + ' *.src ' + arg;
			}
			if (build !== undefined && build !== '') {
				bscript 			+= ' -Fo'+build+' -Fr'+build+' -Fp'+build;
			}
			bscript					+= '\n\r';
			if (build !== undefined && build !== '') {
				bscript 			+= 'cd ' + build + '\n\r';
			}
			bscript 			+= link_string;
			bscript 			+= mmcard_string;
			bscript 			+= 'copy *.mem ' + exportPath;

			let def = { type: 'shell', id: 'shell'};
			let t = new vscode.Task(def, vscode.TaskScope.Workspace, 'Make', 'macro', new vscode.ShellExecution(bscript), '$macro');
			vscode.tasks.executeTask(t);
		});
	} 
	else {
		// External Make file
		let args = [exportPath, 'make', compiler, arg];
		let def = { type: 'shell', id: 'shell'};
		let t = new vscode.Task(def, vscode.TaskScope.Workspace, 'Make', 'Macro', new vscode.ShellExecution('.\\'+ makeFile + ' ' + args));
		vscode.tasks.executeTask(t);
	} 
}

// Clean
function clean() {
	let makeFile = settings.MacroSettings.getInstance().macroMakeFile;
	// Execute internal build script
	if (makeFile === undefined || makeFile === '') {
		let source 			= settings.MacroSettings.getInstance().macroSourcePath;
		let build 			= settings.MacroSettings.getInstance().macroBuildPath;

		let bscript = 'cd ' + source + '\n\r';
		build_ext.forEach(element => {
			bscript = bscript + 'del *.' + element + '\n\r';
		});
		bscript = bscript + 'cd ..\\' + build + '\n\r';
		build_ext.forEach(element => {
			bscript = bscript + 'del *.' + element + '\n\r';
		});

		let def = { type: 'shell', id: 'shell'};
		let t = new vscode.Task(def, 'Make', 'Workspace', new vscode.ShellExecution(bscript));
		vscode.tasks.executeTask(t);
	}
	else {
		let def = { type: 'shell', id: 'shell'};
		vscode.workspace.findFiles('Clean.bat').then(value => { 
			if (value.length > 0) {					
				let t = new vscode.Task(def, 'Clean', 'Workspace', new vscode.ShellExecution('.\\Clean.bat'));
				vscode.tasks.executeTask(t);
			}
			else {
				let args = ['0', 'clean'];
				let t = new vscode.Task(def, vscode.TaskScope.Workspace, 'Clean', 'macro', new vscode.ShellExecution('.\\'+ makeFile + ' ' + args));
				vscode.tasks.executeTask(t);
			}
		});
	}
}

// Set Compiler
function setCompiler() {
	let currentCompilerPath = settings.MacroSettings.getInstance().macroCompilerPath;
	const quickPickOptions = {
		matchOnDetail: true,
		matchOnDescription: false,
		placeHolder: `current: ${currentCompilerPath}`
	};

	vscode.window.showQuickPick(LINKERS, quickPickOptions).then(value => {
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