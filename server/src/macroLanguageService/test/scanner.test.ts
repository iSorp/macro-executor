/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Simon Waelti. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { IToken, Scanner, TokenType } from '../parser/macroScanner';


suite('Scanner', () => {

	function assertSingleToken(scanner: Scanner, source: string, len: number, offset: number, text: string, ...tokenTypes: TokenType[]): void {
		scanner.setSource(source);
		let token = scanner.scan();
		assert.strictEqual(token.len, len);
		assert.strictEqual(token.offset, offset);
		assert.strictEqual(token.text, text);
		assert.strictEqual(token.type, tokenTypes[0]);
		for (let i = 1; i < tokenTypes.length; i++) {
			assert.strictEqual(scanner.scan().type, tokenTypes[i], source);
		}
		assert.strictEqual(scanner.scan().type, TokenType.EOF, source);
	}

	function assertSingleTokenNonSymolStatement(scanner: Scanner, source: string, len: number, offset: number, text: string, ...tokenTypes: TokenType[]): void {
		scanner.setSource(source);
		let token = scanner.scanNonSymbol();
		if (tokenTypes.length > 0) {
			assert.strictEqual(token.len, len);
			assert.strictEqual(token.offset, offset);
			assert.strictEqual(token.text, text);
			assert.strictEqual(token.type, tokenTypes[0]);
			for (let i = 1; i < tokenTypes.length; i++) {
				assert.strictEqual(scanner.scanNonSymbol().type, tokenTypes[i], source);
			}
		}
		else {
			assert.strictEqual(token, null);
		}
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
		assertSingleToken(scanner, 'var$abc', 7, 0, 'var$abc', TokenType.Symbol);
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
		assertSingleToken(scanner, '@var', 1, 0, '@', TokenType.AT, TokenType.Symbol);
		
	});

	test('Token Gts', function () {
		let scanner = new Scanner();
		assertSingleToken(scanner, '>var', 1, 0, '>', TokenType.GTS, TokenType.Symbol);
		assertSingleToken(scanner, '<', 1, 0, '<', TokenType.LTS);
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
		assertSingleToken(scanner, '\'  ', 1, 0, '\'', TokenType.Delim);
		assertSingleToken(scanner, '"', 1, 0, '"', TokenType.Delim);

		scanner = new Scanner();
		scanner.ignoreBadString = true;
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
		assertSingleToken(scanner, 'popen  ', 5, 0, 'popen', TokenType.Fcmd);
	});

	test('Token for nonsymbolic statement', function () {
		let scanner = new Scanner();
		assertSingleTokenNonSymolStatement(scanner, 'ANDSIN', 3, 0, 'AND', TokenType.KeyWord);
		assertSingleTokenNonSymolStatement(scanner, 'R', 1, 0, 'R', TokenType.Parameter);
		assertSingleTokenNonSymolStatement(scanner, '1', 1, 0, '1', TokenType.Number);
		//assertSingleTokenNonSymolStatement(scanner, '1.0', 3, 0, '1.0', TokenType.Number);
		assertSingleTokenNonSymolStatement(scanner, 'G01G01', 1, 0, 'G', TokenType.Parameter, TokenType.Number, TokenType.Parameter, TokenType.Number);

		assertSingleTokenNonSymolStatement(scanner, 'EQ', 2, 0, 'EQ', TokenType.KeyWord);
		assertSingleTokenNonSymolStatement(scanner, 'R10EQ1', 1, 0, 'R', TokenType.Parameter, TokenType.Number, TokenType.KeyWord, TokenType.Number);

		assertSingleTokenNonSymolStatement(scanner, 'R.0', 1, 0, 'R', TokenType.Parameter); 
		assertSingleTokenNonSymolStatement(scanner, 'ABC', 3, 0, 'ABC', TokenType.Symbol); 
	});

	test('Token N', function () {
		let scanner = new Scanner();
		assertSingleTokenNonSymolStatement(scanner, 'N', 1, 0, 'N', TokenType.Sequence);
	});

	test('Token NN', function () {
		let scanner = new Scanner();
		assertSingleTokenNonSymolStatement(scanner, 'NN', 2, 0, 'NN', TokenType.NNAddress);
	});
	
	test('Token SystemVar', function () {
		let scanner = new Scanner();
		assertSingleToken(scanner, '[#_TEST]', 8, 0, '[#_TEST]', TokenType.SystemVar);
		assertSingleToken(scanner, '[#_TEST[123]]', 13, 0, '[#_TEST[123]]', TokenType.SystemVar);
	});
});
