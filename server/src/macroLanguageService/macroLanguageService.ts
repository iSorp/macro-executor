/*---------------------------------------------------------------------------------------------
* Copyright (c) 2020 Simon Waelti
* Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
'use strict';

import { Parser } from './parser/macroParser';
import { MacroHover } from './services/macroHover';
import { MacroNavigation as MacroNavigation } from './services/macroNavigation';
import { MacroValidation } from './services/macroValidation';
import { MacroCompletion } from './services/macroCompletions';
import { MacroCommand } from './services/macroCommands';

import {
	LanguageSettings, LanguageServiceOptions, DocumentContext, 
	DocumentLink, SymbolInformation, Diagnostic, Position, Hover, 
	Location, TextDocument, CompletionList, CodeLens, 
	TextDocumentEdit, WorkspaceEdit
} from './macroLanguageTypes';


export type Macrofile = {};
export * from './macroLanguageTypes';

export interface LanguageService {
	doValidation(document: TextDocument, file: Macrofile, documentSettings: LanguageSettings): Diagnostic[];
	parseMacroFile(document: TextDocument): Macrofile;
	doHover(document: TextDocument, position: Position, macroFile: Macrofile):Hover | null;
	doComplete(document: TextDocument, position: Position, stylesheet: Macrofile, documentSettings: LanguageSettings): CompletionList;
	findDefinition(document: TextDocument, position: Position, macroFile: Macrofile): Location | null;
	findReferences(document: TextDocument, position: Position, macroFile: Macrofile): Location[];
	findImplementations(document: TextDocument, position: Position, macroFile: Macrofile): Location[];
	findDocumentLinks(document: TextDocument, macrofile: Macrofile, documentContext: DocumentContext): DocumentLink[];
	findDocumentSymbols(document: TextDocument, macrofile: Macrofile): SymbolInformation[];
	findCodeLenses(document: TextDocument, macrofile: Macrofile): CodeLens[];
	doRename(document: TextDocument, position: Position, newName: string, macroFile: Macrofile): WorkspaceEdit;
	doRefactorSequences(document: TextDocument, position: Position, macrofile: Macrofile, documentSettings: LanguageSettings) : TextDocumentEdit | null;
	doCreateSequences(document: TextDocument, position: Position, macrofile: Macrofile, documentSettings: LanguageSettings) : TextDocumentEdit | null;
}

function createFacade(parser: Parser, hover: MacroHover, completion: MacroCompletion, navigation: MacroNavigation, validation: MacroValidation, command: MacroCommand): LanguageService {
	return {
		doValidation: validation.doValidation.bind(validation),
		parseMacroFile: parser.parseMacroFile.bind(parser),
		doHover: hover.doHover.bind(hover),
		doComplete: completion.doComplete.bind(completion),
		findDefinition: navigation.findDefinition.bind(navigation),
		findReferences: navigation.findReferences.bind(navigation),
		findImplementations: navigation.findImplementations.bind(navigation),
		findDocumentLinks: navigation.findDocumentLinks.bind(navigation),
		findDocumentSymbols: navigation.findDocumentSymbols.bind(navigation),
		findCodeLenses: navigation.findCodeLenses.bind(navigation),
		doRename: navigation.doRename.bind(navigation),
		doRefactorSequences: command.doRefactorSequences.bind(command),
		doCreateSequences: command.doCreateSequences.bind(command)
	};
}

export function getMacroLanguageService(options: LanguageServiceOptions): LanguageService {

	return createFacade(
		new Parser(options && options.fileProvider),
		new MacroHover(options && options.fileProvider),
		new MacroCompletion(options && options.fileProvider),
		new MacroNavigation(options && options.fileProvider),
		new MacroValidation(options && options.fileProvider),
		new MacroCommand(options && options.fileProvider),
	);
}
