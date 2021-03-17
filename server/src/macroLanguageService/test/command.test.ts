/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Simon Waelti. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {
	TextDocument, 
	LanguageService, 
	getMacroLanguageService, 
	LanguageSettings,
	Range, 
	Position,
	TextDocumentEdit
} from '../macroLanguageService';

let settings:LanguageSettings = {
	sequence: {
		base : 1000,
		increment : 10
	}
};

declare type commandFunction = (document, position, macroFile, settings) => TextDocumentEdit;

function assertEdits(service: LanguageService, input: string, positions:Position[], newTexts:string[], f:commandFunction) {
	let document = TextDocument.create(`test://test/test.src`, 'macro', 0, input);
	let macroFile = service.parseMacroFile(document);

	let edits = f(document, document.positionAt(0), macroFile, settings);
	assert.strictEqual(edits.edits.length, newTexts.length, input);

	let nWrites = 0;
	for (let i = 0; i < edits.edits.length; i++) {
		const edit = edits.edits[i];
		const newText = newTexts[i];
		const position = positions[i];
		if (edit.newText === newText) {
			nWrites++;
		}

		const expectedRange = Range.create(position, Position.create(position.line, position.character));
		const start1 = document.offsetAt(edit.range.start);
		const start2 = document.offsetAt(expectedRange.start);
		assert.strictEqual(start1, start2);
	}
	assert.strictEqual(nWrites, newTexts.length, input);
}

suite('Commands', () => {

	test('Create sequence number', function () {
		const service = getMacroLanguageService(null);
		
		assertEdits(service, 'O 100\nG01\n', 
			[{line:1,character:0}], 
			['N1000 '], 
			service.doCreateSequences.bind(service));
		
		assertEdits(service, 'O 100\nG01\nG02\n', 
			[
				{line:1,character:0},
				{line:2,character:0}
			], ['N1000 ', 'N1010 '], 
			service.doCreateSequences.bind(service));
		
		// Skip G10/G11
		assertEdits(service, 'O 100\nG01\nG10\nG01\nG11\nG01',  
			[
				{line:1,character:0},
				{line:2,character:0},
				{line:4,character:0},
				{line:5,character:0}
			], 
			['N1000 ', 'N1010 ', 'N1020 ', 'N1030 '], 
			service.doCreateSequences.bind(service));
	});


	test('Refactor sequence number', function () {
		const service = getMacroLanguageService(null);

		assertEdits(service, 'O 100\nN100G01\n', 
			[
				{line:1,character:1},
				{line:1,character:1}
			], 
			['', '1000'], 
			service.doRefactorSequences.bind(service));

		assertEdits(service, 'O 100\nN100G01\nN100 G01\n',  
			[
				{line:1,character:1},
				{line:1,character:1}, 
				{line:2,character:1},
				{line:2,character:1}
			], 
			['', '1000', '', '1010'], 
			service.doRefactorSequences.bind(service));

		// Skip G10/G11
		assertEdits(service, 'O 100\nN100G01\nN100 G10\nN10 R100\nG11',  
			[
				{line:1,character:1},
				{line:1,character:1}, 
				{line:2,character:1},
				{line:2,character:1},
			], 
			['', '1000', '', '1010'], 
			service.doRefactorSequences.bind(service));

		assertEdits(service, 'O 100\nGOTO 100\nN100\nGOTO 100\n',  
			[
				{line:2,character:1},
				{line:2,character:1},
				{line:1,character:5},
				{line:1,character:5},
				{line:3,character:5},
				{line:3,character:5}
			], 
			['', '1000', '', '1000', '','1000'], 
			service.doRefactorSequences.bind(service));
	});

});