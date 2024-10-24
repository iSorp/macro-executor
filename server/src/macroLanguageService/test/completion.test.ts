/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Simon Waelti. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { Position } from 'vscode-languageserver-textdocument';
import { FileProviderMock, documents } from './fileProviderMock';
import {
	LanguageService, 
	getMacroLanguageService, 
} from '../macroLanguageService';

import {
	TextDocument, 
	LanguageSettings,
	CompletionList
} from '../macroLanguageTypes';

import { 
	Parser, 
} from '../parser/macroParser';

declare type completionFunction = (document, position, macroFile, settings) => CompletionList | null;

function assertCompletion(service: LanguageService, input: string, position:Position, expected: string, f:completionFunction) {
	
	let settings:LanguageSettings = {
		keywords:[],
		sequence: {
			base: 1000,
			increment: 5
		}
	};
	
	let document = TextDocument.create(`test://test/test.src`, 'macro', 0, input);
	let macroFile = service.parseMacroFile(document);
	let result = f(document, position, macroFile, settings);
	
	assert.strictEqual(result.items[7].textEdit.newText, expected, input);
}

let fileProviderMock = new FileProviderMock();
let service = getMacroLanguageService({ fileProvider: fileProviderMock });

suite('Completion', () => {

	test('N-Number completion', function () {

		assertCompletion(service, 'O 100\nN10\nN\n', 
			{ line:2,character:1}, 
			'N${1:15} $0',
			service.doComplete.bind(service)
		);
	});
});


