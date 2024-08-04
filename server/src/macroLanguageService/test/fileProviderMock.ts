import {
	TextDocument,
	MacroFileProvider,
	MacroFileType,
	MacroFileInfo, 
	FileProviderParams,
} from '../macroLanguageTypes';

import { 
	Parser, 
} from '../parser/macroParser';

export { FileProviderMock };

export const documents: Map<string, TextDocument> = new Map<string, TextDocument>();

class FileProviderMock implements MacroFileProvider {

	constructor() {}

	public get(file: string): MacroFileInfo | undefined {
		const document = documents.get(file);
		const macroFile =  new Parser(this).parseMacroFile(document);
		return {
			document: document,
			macrofile: macroFile,
			version: 1,
			type: this.getMacroFileType(file)
		};
	}
	
	public getAll(param?:FileProviderParams) {
		let types:MacroFileInfo[] = [];
		for (const file of documents.keys()) {
			let type = this.get(file);
			if (type){
				types.push(type);
			}
		}
		return types;
	}

	public resolveReference(ref: string, base?: string): string | undefined {
		return undefined;
	}
	
	public getMacroFileType(file: string) : MacroFileType {
		var fileExt = file.split('.').pop().toLocaleLowerCase();
		switch(fileExt) {
			case 'def':
				return MacroFileType.DEF;
			case 'lnk':
				return MacroFileType.LNK;
			default:
				return MacroFileType.SRC;
		}
	} 
}
