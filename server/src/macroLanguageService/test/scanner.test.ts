/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Simon Waelti. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { Scanner, TokenType } from '../parser/macroScanner';

suite('Scanner', () => {

	function assertSingleToken(scan: Scanner, source: string, len: number, offset: number, text: string, ...tokenTypes: TokenType[]): void {
		scan.setSource(source);
		let token = scan.scan();
		assert.equal(token.len, len);
		assert.equal(token.offset, offset);
		assert.equal(token.text, text);
		assert.equal(token.type, tokenTypes[0]);
		for (let i = 1; i < tokenTypes.length; i++) {
			assert.equal(scan.scan().type, tokenTypes[i], source);
		}
		assert.equal(scan.scan().type, TokenType.EOF, source);
	}

	test('Whitespace', function () {
		let scanner = new Scanner();
		assertSingleToken(scanner, ' $', 1, 1, '$', TokenType.Delim);

		scanner = new Scanner();
		scanner.ignoreWhitespace = false;
		assertSingleToken(scanner, ' $', 1, 0, ' ', TokenType.Whitespace, TokenType.Delim);

		scanner = new Scanner();
		scanner.ignoreComment = false;
		assertSingleToken(scanner, ' /*comment', 9, 1, '/*comment', TokenType.Comment);

		scanner = new Scanner();
		assertSingleToken(scanner, ' ', 0, 1, '', TokenType.EOF);
		assertSingleToken(scanner, '      ', 0, 6, '', TokenType.EOF);
	});

	test('Token Newline', function () {
		let scanner = new Scanner();
		scanner.ignoreNewLine = false;
		assertSingleToken(scanner, ' \n', 1, 1, '\n', TokenType.NewLine);
		assertSingleToken(scanner, ' \r\n', 2, 1, '\r\n', TokenType.NewLine);
		assertSingleToken(scanner, ' \f', 1, 1, '\f', TokenType.NewLine);

		
		scanner.ignoreNewLine = true;
		assertSingleToken(scanner, ' \n', 0, 2, '', TokenType.EOF);
	});

	test('Token Symbol', function () {
		let scanner = new Scanner();
		assertSingleToken(scanner, 'var', 3, 0, 'var', TokenType.Symbol);
		assertSingleToken(scanner, 'Var', 3, 0, 'Var', TokenType.Symbol);
		assertSingleToken(scanner, '_var', 4, 0, '_var', TokenType.Symbol);
		assertSingleToken(scanner, 'var1', 4, 0, 'var1', TokenType.Symbol);
		assertSingleToken(scanner, '1var', 4, 0, '1var', TokenType.Symbol);
		assertSingleToken(scanner, '123', 3, 0, '123', TokenType.Symbol);
		assertSingleToken(scanner, '12.', 3, 0, '12.', TokenType.Symbol);
		assertSingleToken(scanner, 'var.', 4, 0, 'var.', TokenType.Symbol);
		assertSingleToken(scanner, 'var?', 4, 0, 'var?', TokenType.Symbol);
		assertSingleToken(scanner, 'var!', 4, 0, 'var!', TokenType.Symbol);
	});

	test('Token Dollar', function () {
		let scanner = new Scanner();
		assertSingleToken(scanner, '$INCLUDE', 8, 0, '$INCLUDE', TokenType.Dollar);
		assertSingleToken(scanner, '$', 1, 0, '$', TokenType.Delim);
	});

	test('Token Hash', function () {
		let scanner = new Scanner();
		assertSingleToken(scanner, '#var', 1, 0, '#', TokenType.Hash, TokenType.Symbol);
		
	});

	test('Token At', function () {
		let scanner = new Scanner();
		assertSingleToken(scanner, '@var', 4, 0, '@var', TokenType.AT);
		assertSingleToken(scanner, '@', 1, 0, '@', TokenType.Delim);
		
	});

	test('Token Gts', function () {
		let scanner = new Scanner();
		assertSingleToken(scanner, '>var', 4, 0, '>var', TokenType.GTS);
		assertSingleToken(scanner, '>', 1, 0, '>', TokenType.Delim);
	});

	test('Token Comments', function () {
		let scanner = new Scanner();
		assertSingleToken(scanner, '/*', 0, 2, '', TokenType.EOF);
		assertSingleToken(scanner, ';', 0, 1, '', TokenType.EOF);
		scanner.ignoreComment = false;
		assertSingleToken(scanner, '/*', 2, 0, '/*', TokenType.Comment);
		assertSingleToken(scanner, ';', 1, 0, ';', TokenType.Comment);
	});
	
	test('Token Strings', function () {
		let scanner = new Scanner();
		assertSingleToken(scanner, '()', 2, 0, '()', TokenType.String);
		assertSingleToken(scanner, '(\'\')', 4, 0, '(\'\')', TokenType.String);
		assertSingleToken(scanner, '("")', 4, 0, '("")', TokenType.String);
		assertSingleToken(scanner, '(**)', 4, 0, '(**)', TokenType.String);

		assertSingleToken(scanner, '(', 1, 0, '(', TokenType.BadString);
		assertSingleToken(scanner, ')', 1, 0, ')', TokenType.Delim);

		assertSingleToken(scanner, '(\')', 3, 0, '(\')', TokenType.BadString);
		assertSingleToken(scanner, '(")', 3, 0, '(")', TokenType.BadString);
		assertSingleToken(scanner, '(*)', 3, 0, '(*)', TokenType.BadString);
	});

	test('Token Delim', function () {
		let scanner = new Scanner();
		assertSingleToken(scanner, '+', 1, 0, '+', TokenType.Delim);
		assertSingleToken(scanner, '-', 1, 0, '-', TokenType.Delim);
		assertSingleToken(scanner, '/', 1, 0, '/', TokenType.Delim);
		assertSingleToken(scanner, '*', 1, 0, '*', TokenType.Delim);
		assertSingleToken(scanner, '<  ', 1, 0, '<', TokenType.Delim);
		assertSingleToken(scanner, '>  ', 1, 0, '>', TokenType.Delim);
		assertSingleToken(scanner, '\'  ', 1, 0, '\'', TokenType.Delim);
		assertSingleToken(scanner, '"', 1, 0, '"', TokenType.Delim);

		scanner = new Scanner();
		scanner.inFunction = true;
		assertSingleToken(scanner, '(', 1, 0, '(', TokenType.Delim);
	});

	test('Token singletokens', function () {
		let scanner = new Scanner();
		assertSingleToken(scanner, '[  ', 1, 0, '[', TokenType.BracketL);
		assertSingleToken(scanner, ']  ', 1, 0, ']', TokenType.BracketR);
		assertSingleToken(scanner, ',  ', 1, 0, ',', TokenType.Comma);
		assertSingleToken(scanner, '&  ', 1, 0, '&', TokenType.Ampersand);
	});
	
	test('Token keywords', function () {
		let scanner = new Scanner();
		assertSingleToken(scanner, 'if  ', 2, 0, 'if', TokenType.KeyWord);
	});

	test('Token functions', function () {
		let scanner = new Scanner();
		assertSingleToken(scanner, 'sin  ', 3, 0, 'sin', TokenType.Ffunc);
		assertSingleToken(scanner, 'popen  ', 5, 0, 'popen', TokenType.Fcommand);
	});
});