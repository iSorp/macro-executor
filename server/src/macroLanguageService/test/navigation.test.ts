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
	Location,
	Range
} from '../macroLanguageTypes';

import { 
	Parser, 
} from '../parser/macroParser';

declare type locationFunction = (document, position, macroFile) => Location | null;
declare type locationsFunction = (document, position, macroFile) => Location[];

function assertLocation(service: LanguageService, input: string, position:Position, location:Location, f:locationFunction) {
	
	let uri = 'test://test/test.src';
	let document = TextDocument.create(uri, 'macro', 0, input);
	documents.set(uri, document);

	let macroFile = service.parseMacroFile(document);
	let result = f(document, position, macroFile);
	
	assert.strictEqual(result.uri, location.uri, input);
	assert.strictEqual(result.range.start.line, location.range.start.line, input);
	assert.strictEqual(result.range.start.character, location.range.start.character, input);
	assert.strictEqual(result.range.end.line, location.range.end.line, input);
	assert.strictEqual(result.range.end.character, location.range.end.character, input);
}

function assertLocations(service: LanguageService, input: string, position:Position, locations:Location[], f:locationsFunction) {
	
	let uri = 'test://test/test.src';
	let document = TextDocument.create(uri, 'macro', 0, input);
	documents.set(uri, document);

	let macroFile = service.parseMacroFile(document);
	let result = f(document, position, macroFile);
	
	assert.strictEqual(result.length, locations.length);

	for (let i = 0; i < result.length; i++) {
		assert.strictEqual(result[i].uri, locations[i].uri, input);
		assert.strictEqual(result[i].range.start.line, locations[i].range.start.line, input);
		assert.strictEqual(result[i].range.start.character, locations[i].range.start.character, input);
		assert.strictEqual(result[i].range.end.line, locations[i].range.end.line, input);
		assert.strictEqual(result[i].range.end.character, locations[i].range.end.character, input);
	}

}

let fileProviderMock = new FileProviderMock();
let service = getMacroLanguageService({ fileProvider: fileProviderMock });

suite('Navigation', () => {

	test('Find object definition', function () {

		documents.set('test://test/test.def', TextDocument.create('test://test/test.def', 'macro', 0, '@dummy #1\n@var #1'));
		
		assertLocation(service, '@var #1\nO 100\nvar = 1\n', 
			{ line:2,character:0}, 
			{ range: Range.create(0, 0, 0, 7), uri: 'test://test/test.src' }, 
			service.findDefinition.bind(service)
		);

		assertLocation(service, '$INCLUDE test://test/test.def\nO 100\nvar = 1\n', 
			{ line:2,character:0}, 
			{ range: Range.create(1, 0, 1, 7), uri: 'test://test/test.def' }, 
			service.findDefinition.bind(service)
		);
	});

	test('Find label definition', function () {

		documents.set('test://test/test.def', TextDocument.create('test://test/test.def', 'macro', 0, '>dummy 1\n>LABEL 1'));

		assertLocation(service, '>LABEL 1\nO 100\nLABEL\n', 
			{ line:2,character:0}, 
			{ range: Range.create(0, 0, 0, 8), uri: 'test://test/test.src' }, 
			service.findDefinition.bind(service)
		);

		assertLocation(service, '$INCLUDE test://test/test.def\nO 100\nLABEL\n', 
			{ line:2,character:0}, 
			{ range: Range.create(1, 0, 1, 8), uri: 'test://test/test.def' }, 
			service.findDefinition.bind(service)
		);
	});

	test('Find goto sequence definition', function () {
		assertLocation(service, 'O 100\nN1000\nGOTO 1000\n', 
			{ line:2,character:5}, 
			{ range: Range.create(1, 0, 1, 5), uri: 'test://test/test.src' }, 
			service.findDefinition.bind(service)
		);
	});

	test('Find object references', function () {

		documents.set('test://test/test.def', TextDocument.create('test://test/test.def', 'macro', 0, '@dummy #1\n@var #1'));
		
		assertLocations(service, '@var #1\nO 100\nvar = 1\nvar = 1\n', 
			{ line:2,character:0}, 
			[
				{ range: Range.create(0, 1, 0, 4), uri: 'test://test/test.src' },
				{ range: Range.create(2, 0, 2, 3), uri: 'test://test/test.src' },
				{ range: Range.create(3, 0, 3, 3), uri: 'test://test/test.src' }
			], 
			service.findReferences.bind(service)
		);

		assertLocations(service, '$INCLUDE test://test/test.def\nO 100\nvar = 1\nvar = 1\n', 
			{ line:2,character:0}, 
			[
				{ range: Range.create(2, 0, 2, 3), uri: 'test://test/test.src' },
				{ range: Range.create(3, 0, 3, 3), uri: 'test://test/test.src' },
				{ range: Range.create(1, 1, 1, 4), uri: 'test://test/test.def' }
			], 
			service.findReferences.bind(service)
		);
	});

	test('Find label references', function () {

		documents.set('test://test/test.def', TextDocument.create('test://test/test.def', 'macro', 0, '>dummy 1\n>LABEL 1\n>SEQ N1000'));
		
		assertLocations(service,  '>LABEL 1\nO 100\nLABEL\nLABEL\n', 
			{ line:2,character:0}, 
			[
				{ range: Range.create(0, 1, 0, 6), uri: 'test://test/test.src' },
				{ range: Range.create(2, 0, 2, 5), uri: 'test://test/test.src' },
				{ range: Range.create(3, 0, 3, 5), uri: 'test://test/test.src' }
			], 
			service.findReferences.bind(service)
		);

		assertLocations(service, '$INCLUDE test://test/test.def\nO 100\nLABEL\nLABEL\n', 
			{ line:2,character:0}, 
			[
				{ range: Range.create(2, 0, 2, 5), uri: 'test://test/test.src' },
				{ range: Range.create(3, 0, 3, 5), uri: 'test://test/test.src' },
				{ range: Range.create(1, 1, 1, 6), uri: 'test://test/test.def' }
			], 
			service.findReferences.bind(service)
		);

		assertLocations(service,  '@SEQ N1000\nO 100\nN1000\nN1000\n', 
			{ line:2,character:1}, 
			[
				{ range: Range.create(0, 6, 0, 10), uri: 'test://test/test.src' },
				{ range: Range.create(2, 1, 2, 5), uri: 'test://test/test.src' },
				{ range: Range.create(3, 1, 3, 5), uri: 'test://test/test.src' }
			], 
			service.findReferences.bind(service)
		);

		assertLocations(service, '$INCLUDE test://test/test.def\nO 100\nN1000\nN1000\n', 
			{ line:2,character:1}, 
			[
				{ range: Range.create(2, 1, 2, 5), uri: 'test://test/test.src' },
				{ range: Range.create(3, 1, 3, 5), uri: 'test://test/test.src' }
			], 
			service.findReferences.bind(service)
		);
	});


	test('Find object implementations', function () {

		documents.set('test://test/test.def', TextDocument.create('test://test/test.def', 'macro', 0, '@dummy 1\n@var 100'));
		
		assertLocations(service, '$INCLUDE test://test/test.def\nO var\nM123 var\n', 
			{ line:2,character:5}, 
			[
				{ range: Range.create(1, 2, 1, 5), uri: 'test://test/test.src' },
			], 
			service.findImplementations.bind(service)
		);
	});

	test('Find label implementations', function () {

		documents.set('test://test/test.def', TextDocument.create('test://test/test.def', 'macro', 0, '@dummy 1\n>LABEL 100'));
		
		assertLocations(service, '$INCLUDE test://test/test.def\nO 100\nLABEL\n', 
			{ line:2,character:0}, 
			[
				{ range: Range.create(2, 0, 2, 5), uri: 'test://test/test.src' },
			], 
			service.findImplementations.bind(service)
		);

		assertLocations(service, 'O 100\nGOTO100\nN100', 
			{ line:1,character:4}, 
			[
				{ range: Range.create(2, 1, 2, 4), uri: 'test://test/test.src' },
			], 
			service.findImplementations.bind(service)
		);
	});

});


