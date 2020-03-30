// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as settings from './common/configSettings';
import HoverProvider from './common/hoverProvider';

const MACRO = { language: 'macro', scheme: 'file' };
const LINKERS = ["MCOMPI", "MCOMP0"];
const CONTROL_TYPE = ["0", "30"];

const build_ext = [
	"rel",
	"prg",
	"ref",
	"lst",
	"bak",
	"rom",
	"mem",
	"map",
	"err",
	"tmp",
	"re$"
];

var defFileList = Array<string>();


// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "macro" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('extension.helloWorld', () => {
		// The code you place here will be executed every time your command is executed

		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World!');
	});

	let macroSettings = settings.MacroSettings.getInstance();
	
	//context.subscriptions.push(LINKERS);

	// Enable indentAction
	vscode.languages.setLanguageConfiguration(MACRO.language, {
		onEnterRules: [
			{
				beforeText: /^\s*(?:O).*?:\s*$/,
				action: { indentAction: vscode.IndentAction.Indent }
			},
			{
				beforeText: /^ *#.*$/,
				afterText: /.+$/,
				action: { indentAction: vscode.IndentAction.None, appendText: '# ' }
			}
		]
	});

	readDefFiles().then(list => defFileList = list);

	vscode.workspace.onDidDeleteFiles((e)=> {
		defFileList.length = 0;
		readDefFiles().then(list => defFileList = list);
	});

	vscode.workspace.onDidCreateFiles((e)=> {
		defFileList.length = 0;
		readDefFiles().then(list => defFileList = list);
	});

	vscode.workspace.onWillRenameFiles((e)=> {
		defFileList.length = 0;
		readDefFiles().then(list => defFileList = list);
	});
	
	function readDefFiles() {
		return new Promise<Array<string>>((resolve, reject)=> {
			let list = new Array<string>();
			vscode.workspace.findFiles('**/*.{def,DEF}', ).then(value =>{
				value.forEach(element => {
					list.push(element.fsPath);
					resolve(list);
				});
			});
		});
	}

	context.subscriptions.push(
		vscode.languages.registerHoverProvider([
			{ language: 'macro', scheme: 'file', pattern: '**/*src*' },
		], 
		new HoverProvider(()=> {
			return defFileList;
		})));

	/*vscode.languages.registerHoverProvider('macro', {
		provideHover(document, position, token) {
			document.getText(document.)

		  return {
			contents: ['Definition: ']
		  };
		}
	  });*/

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with  registerCommand
	// The commandId parameter must match the command field in package.json
	// Compilieren
	let compile = vscode.commands.registerCommand('macro.compile', function () {
		let compiler 		= settings.MacroSettings.getInstance().macroCompilerPath;
		let source 			= settings.MacroSettings.getInstance().macroSourcePath;
		let build 			= settings.MacroSettings.getInstance().macroBuildPath;
		let currentFile 	= vscode.window.activeTextEditor?.document.uri.fsPath;
		let arg 			= " -" + macroSettings.macroControlType;
		if (compiler !== "MCOMPI"){
			arg = "";
		} 
		let args = " " + arg;
		if (build !== undefined && build !== "") {
			args = args + " -Fo"+ build  +" -Fr"+ build  +" -Fp"+ build;
		}
		if (source !== undefined && source !== "") {
			args = args +" -Fl"+ source;
		}

		let def = { type: "shell", id: "shell"};
		let t = new vscode.Task(def, vscode.TaskScope.Workspace, 'Compile','Macro', 
			new vscode.ShellExecution(compiler + " " + currentFile + args), '$macro');

		vscode.tasks.executeTask(t);
	});

	// Compilieren und linken
	let build = vscode.commands.registerCommand('macro.build', function () {
		let makeFile 		= settings.MacroSettings.getInstance().macroMakeFile;
		let exportPath 		= settings.MacroSettings.getInstance().macroExportPath;
		let source 			= settings.MacroSettings.getInstance().macroSourcePath;
		let link 			= settings.MacroSettings.getInstance().macroLinkPath;
		let build 			= settings.MacroSettings.getInstance().macroBuildPath;
		let compiler 		= settings.MacroSettings.getInstance().macroCompilerPath;
		let arg = " -" + macroSettings.macroControlType;
		if (compiler !== "MCOMPI"){
			arg = "";
		} 

		// Execute internal build script
		if (makeFile === undefined || makeFile === "") {
			vscode.workspace.findFiles('**/*.{lnk,LNK}', ).then(value =>{

				let link_string = "";
				let mmcard_string = "";
				value.forEach(element => {
					let filename = element.fsPath.replace(/^.*(\\|\/|\:)/, '');	// separate file name
					if (link !== undefined && link !== "") {
						link_string = link_string + 'MLINKI  ..\\'+link+'\\'+filename+'\n\r'; 
					}
					else{
						link_string = link_string + 'MLINKI ' +filename+'\n\r'; 
					}
					mmcard_string = mmcard_string + 'MMCARDI ' + filename.replace(/(\.).*/, '') +'\n\r'; // remove extension
				});

				let bscript = ""; 	
				if (link !== undefined && link !== "") {
					bscript				+='ATTRIB -R '+ link +'\\*.lnk" \n\r';
				}
				else {
					bscript				+='ATTRIB -R *.lnk" \n\r';
				}
				if (build !== undefined && build !== "") {
					bscript 			+= 'mkdir ' + build + '\n\r';
				}
				if (source !== undefined && source !== "") {
					bscript 			+= compiler + ' ' + source +'\\*.src ' + arg +' -Fl'+source;
				}
				else{
					bscript 			+= compiler + ' *.src ' + arg;
				}
				if (build !== undefined && build !== "") {
					bscript 			+= ' -Fo'+build+' -Fr'+build+' -Fp'+build;
				}
				bscript					+= '\n\r';
				if (build !== undefined && build !== "") {
					bscript 			+= 'cd ' + build + '\n\r';
				}
				bscript 			+= link_string;
				bscript 			+= mmcard_string;
				bscript 			+= 'copy *.mem ' + exportPath;

				let def = { type: "shell", id: "shell"};
				let t = new vscode.Task(def, vscode.TaskScope.Workspace, 'Make', 'Macro', new vscode.ShellExecution(bscript), '$macro');
				vscode.tasks.executeTask(t);
			});
		} 
		else {
			// External Make file
			let args = [exportPath, "make", compiler, arg];
			let def = { type: "shell", id: "shell"};
			let t = new vscode.Task(def, vscode.TaskScope.Workspace, 'Make', 'Macro', new vscode.ShellExecution(".\\"+macroSettings.macroMakeFile + " " + args));
			vscode.tasks.executeTask(t);
		} 
	});

	// Clean
	let clean = vscode.commands.registerCommand('macro.clean', function () {
		let makeFile = settings.MacroSettings.getInstance().macroMakeFile;
		// Execute internal build script
		if (makeFile === undefined || makeFile === "") {
			let source 			= settings.MacroSettings.getInstance().macroSourcePath;
			let build 			= settings.MacroSettings.getInstance().macroBuildPath;

			let bscript = "cd " + source + "\n\r";
			build_ext.forEach(element => {
				bscript = bscript + "del *." + element + "\n\r";
			});
			bscript = bscript + "cd ..\\" + build + "\n\r";
			build_ext.forEach(element => {
				bscript = bscript + "del *." + element + "\n\r";
			});

			let def = { type: "shell", id: "shell"};
			let t = new vscode.Task(def, "Make", "Workspace", new vscode.ShellExecution(bscript));
			vscode.tasks.executeTask(t);
		}
		else {
			let def = { type: "shell", id: "shell"};
			vscode.workspace.findFiles("Clean.bat").then(value => { 
				if (value.length > 0) {					
					let t = new vscode.Task(def, "Clean", "Workspace", new vscode.ShellExecution(".\\Clean.bat"));
					vscode.tasks.executeTask(t);
				}
				else {
					let args = ["0", "clean"];
					let t = new vscode.Task(def, vscode.TaskScope.Workspace, 'Clean', 'Macro', new vscode.ShellExecution(".\\"+macroSettings.macroMakeFile + " " + args));
					vscode.tasks.executeTask(t);
				}
			});
		}
	});

	// Set Compiler
	let setCompiler = vscode.commands.registerCommand('macro.setCompiler', function () {
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
	});

	// Set Control type for Compiler
	let setControlType = vscode.commands.registerCommand('macro.setControlType', function () {
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
	});

	// Set Export Path
	let setExportPath = vscode.commands.registerCommand('macro.setExportPath', function () {
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
	});

	context.subscriptions.push(setCompiler);
	context.subscriptions.push(setExportPath);
	context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}
