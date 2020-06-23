/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Simon Waelti. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {
	TextDocument, LanguageService, getMacroLanguageService, LanguageSettings,
} from '../macroLanguageService';
import { TextDocumentEdit } from 'vscode-languageserver';

function assertEdits(service: LanguageService, input: string, marker: string, expectedMatches: number, expectedWrites: number, newTexts:string[], f:(document, position, macroFile, settings) => TextDocumentEdit) {
	let document = TextDocument.create(`test://test/test.src`, 'macro', 0, input);
	let macroFile = service.parseMacroFile(document);
	let index = input.indexOf(marker) + marker.length;
	let position = document.positionAt(index);

	let settings:LanguageSettings = {
		sequence: {
			base : 1000,
			increment : 10
		}
	};

	let edits = f(document, position, macroFile, settings);
	assert.strictEqual(edits.edits.length, expectedMatches, input);

	let nWrites = 0;
	for (let i = 0; i < edits.edits.length; i++) {
		const edit = edits.edits[i];
		const newText = newTexts[i];
		if (edit.newText && edit.newText === newText) {
			nWrites++;
		}

		const start1 = document.offsetAt(position)- marker.length;
		const start2 = document.offsetAt(edit.range.start);
		assert.equal(start1, start2);
	}

	assert.equal(nWrites, expectedWrites, input);
}

suite('Commands', () => {

	test('Create sequence number', function () {
		const service = getMacroLanguageService(null);
		assertEdits(service, 'O 100\nG01\n', 'G01', 1, 1, ['N1000 '], service.doCreateSequences.bind(service));
	});

	test('Refactor sequence number', function () {
		const service = getMacroLanguageService(null);
		assertEdits(service, 'O 100\n\nN100G01\n', 'N100', 2, 1, ['', 'N1000'], service.doRefactorSequences.bind(service));
	});

});