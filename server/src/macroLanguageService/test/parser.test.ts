/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Simon Waelti. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { Parser } from '../parser/macroParser';
import * as nodes from '../parser/macroNodes';
import { TokenType } from '../parser/macroScanner';
import { ParseError } from '../parser/macroErrors';

export function assertNode(text: string, parser: Parser, f: (...args: any[]) => nodes.Node | null): nodes.Node {
	let node = parser.internalParse(text, f)!;
	assert.ok(node !== null, 'no node returned');
	let markers = nodes.ParseErrorCollector.entries(node);
	if (markers.length > 0) {
		assert.ok(false, 'node has errors: ' + markers[0].getMessage() + ', offset: ' + markers[0].getNode().offset + ' when parsing ' + text);
	}
	assert.ok(parser.accept(TokenType.EOF), 'Expect scanner at EOF');
	return node;
}

export function assertError(text: string, parser: Parser, f: () => nodes.Node | null, error: nodes.IRule): void {
	let node = parser.internalParse(text, f)!;
	assert.ok(node !== null, 'no node returned');
	let markers = nodes.ParseErrorCollector.entries(node);
	if (markers.length === 0) {
		assert.ok(false, 'no errors but error expected: ' + error.message);
	} else {
		markers = markers.sort((a, b) => { return a.getOffset() - b.getOffset(); });
		assert.strictEqual(markers[0].getRule().id, error.id, 'incorrect error returned from parsing: ' + text);
	}
}

suite('Parser', () => {

	test('Macro file scope', function () {
		let parser = new Parser(null);
		assertNode('@var 1', parser, parser._parseMacroFile.bind(parser));
		assertNode('>label 1', parser, parser._parseMacroFile.bind(parser));
		assertNode('$INCLUDE test.def', parser, parser._parseMacroFile.bind(parser));
		assertNode('O 100\n', parser, parser._parseMacroFile.bind(parser));
	});

	test('Definition file scope', function () {
		let parser = new Parser(null);
		assertNode('@var 1', parser, parser._parseDefFile.bind(parser));
		assertNode('>label 1', parser, parser._parseDefFile.bind(parser));
		assertNode('$NOLIST', parser, parser._parseDefFile.bind(parser));
		assertNode('$LIST', parser, parser._parseDefFile.bind(parser));
	});

	test('Includes', function () {
		let parser = new Parser(null);
		assertNode('$INCLUDE test.def', parser, parser._parseIncludes.bind(parser));
		assertNode('$INCLUDE test/test.def', parser, parser._parseIncludes.bind(parser));
		assertNode('$INCLUDE test\\test.def', parser, parser._parseIncludes.bind(parser));
		assertError('$INCLUDE ', parser, parser._parseIncludes.bind(parser), ParseError.DefinitionExpected);
	});

	test('Symbol definition', function () {
		let parser = new Parser(null);
		assertNode('@var 100', parser, parser._parseSymbolDefinition.bind(parser));
		assertError('@var ', parser, parser._parseSymbolDefinition.bind(parser), ParseError.AddressExpected);
	});

	test('Label declaration', function () {
		let parser = new Parser(null);
		assertNode('>label 1', parser, parser._parseLabelDefinition.bind(parser));
		assertError('>label ', parser, parser._parseLabelDefinition.bind(parser), ParseError.AddressExpected);
	});

	test('Sub Program declaration', function () {
		let parser = new Parser(null);
		assertNode('O 1000\n', parser, parser._parseProgram.bind(parser));
		assertNode('O test\n', parser, parser._parseProgram.bind(parser));
		assertError('O ', parser, parser._parseProgram.bind(parser), ParseError.FunctionIdentExpected);
	});

	test('Sequence number', function () {
		let parser = new Parser(null);
		assertNode('N100', parser, parser._parseSequenceNumber.bind(parser));
	});

	test('Block skip', function () {
		let parser = new Parser(null);
		assertNode('/', parser, parser._parseBlockSkip.bind(parser));
	});

	test('Address', function () {
		let parser = new Parser(null);
		assertNode('R100', parser, parser._parseAddress.bind(parser));
		assertNode('R100.0', parser, parser._parseAddress.bind(parser));
		assertNode('R100.[1]', parser, parser._parseAddress.bind(parser));
		assertNode('R1.#[1+[1]]', parser, parser._parseAddress.bind(parser));
		assertNode('R#1', parser, parser._parseAddress.bind(parser));
	});

	test('Variable', function () {
		let parser = new Parser(null);
		assertNode('#100', parser, parser._parseVariable.bind(parser));
		assertNode('#test', parser, parser._parseVariable.bind(parser));
		assertNode('#100<100>', parser, parser._parseVariable.bind(parser));
		assertNode('#100<#100>', parser, parser._parseVariable.bind(parser));
		assertNode('#test<100>', parser, parser._parseVariable.bind(parser));
		assertNode('#test<#test>', parser, parser._parseVariable.bind(parser));

		assertError('# ', parser, parser._parseVariable.bind(parser), ParseError.IdentifierExpected);
		assertError('#100< ', parser, parser._parseVariable.bind(parser), ParseError.RightAngleBracketExpected);
	});

	/*test('Label', function () {
		let parser = new Parser(null);
		assertNode('TEST', parser, parser._parseLabel.bind(parser));
	});*/

	test('String', function () {
		let parser = new Parser(null);
		assertNode('( )', parser, parser._parseString.bind(parser));
		assertNode('(\' \')', parser, parser._parseString.bind(parser));
		assertNode('(" ")', parser, parser._parseString.bind(parser));
		assertNode('(* *)', parser, parser._parseString.bind(parser));

		assertError('( ', parser, parser._parseString.bind(parser), ParseError.Badstring);
		assertError('(\' )', parser, parser._parseString.bind(parser), ParseError.Badstring);
		assertError('(" )', parser, parser._parseString.bind(parser), ParseError.Badstring);
		assertError('(* )', parser, parser._parseString.bind(parser), ParseError.Badstring);
	});

	test('Numeric', function () {
		let parser = new Parser(null);
		assertNode('100', parser, parser._parseNumber.bind(parser));
		assertNode('100.', parser, parser._parseNumber.bind(parser));
		assertNode('100.0', parser, parser._parseNumber.bind(parser));
	});

	test('Nc statement', function () {
		let parser = new Parser(null);
		assertNode('G01', parser, parser._parseNcStatement.bind(parser));
		assertNode('N100G01', parser, parser._parseProgramBody.bind(parser));
		assertNode('N100 G04 P01', parser, parser._parseProgramBody.bind(parser));
		assertNode('N100 1', parser, parser._parseProgramBody.bind(parser));
		assertNode('X', parser, parser._parseNcStatement.bind(parser));
		assertNode('G[1]', parser, parser._parseNcStatement.bind(parser));
		assertNode('X#[1]', parser, parser._parseNcStatement.bind(parser));
		assertNode('X+1', parser, parser._parseNcStatement.bind(parser));
		assertNode('X-1', parser, parser._parseNcStatement.bind(parser));
		assertNode('X360.', parser, parser._parseNcStatement.bind(parser));
		assertNode('X360.F1', parser, parser._parseNcStatement.bind(parser));
		assertNode('X360.0F1.', parser, parser._parseNcStatement.bind(parser));

		assertError('N100+1', parser, parser._parseProgramBody.bind(parser), ParseError.InvalidStatement);
	});

	test('Nc statement symbolic', function () {
		let parser = new Parser(null);
		assertNode('O100\n@CALL M98P\n@SUB 1\nCALL SUB', parser, parser._parseMacroFile.bind(parser));
	});

	test('Control command', function () {
		let parser = new Parser(null);
		assertNode('$EJECT', parser, parser._parseControlCommands.bind(parser, '$eject'));
		assertError('$eject', parser, parser._parseControlCommands.bind(parser, '$eject'), ParseError.UnknownKeyword);
	});

	test('Macro statement', function () {
		let parser = new Parser(null);
		assertNode('#1 = 1', parser, parser._parseMacroStatement.bind(parser));

		assertError('#1 ', parser, parser._parseMacroStatement.bind(parser), ParseError.EqualExpected);
		assertError('#1 = ', parser, parser._parseMacroStatement.bind(parser), ParseError.TermExpected);
	});

	test('IF statement', function () {
		let parser = new Parser(null);
		assertNode('IF [1] THEN #1 = 1', parser, parser._parseIfStatement.bind(parser, ()=> {}));
		assertNode('IF [1] THEN #1 = 1\nELSE #1 = 1', parser, parser._parseIfStatement.bind(parser, ()=> {}));
		assertNode('IF [1] THEN \nELSE #1 = 1', parser, parser._parseIfStatement.bind(parser, ()=> {}));
		assertNode('IF [1] THEN\n#1 = 1\nELSE\nENDIF', parser, parser._parseIfStatement.bind(parser, parser._parseMacroStatement.bind(parser)));
		assertNode('IF [1] THEN\nENDIF', parser, parser._parseIfStatement.bind(parser, ()=> {}));
		assertNode('IF [1] THEN\nELSE\nENDIF', parser, parser._parseIfStatement.bind(parser, ()=> {}));
		assertNode('IF [1] THEN\nIF [1] THEN #1 = 1\nIF [1] THEN #1 = 1\nENDIF\nENDIF', parser, parser._parseIfStatement.bind(parser, parser._parseIfStatement.bind(parser, () => {})));
		assertNode('IF [1] GOTO 1', parser, parser._parseIfStatement.bind(parser, ()=> {}));

		assertNode('IF [1EQ1] THEN #1 = 1', parser, parser._parseIfStatement.bind(parser, ()=> {}));

		assertError('IF ', parser, parser._parseIfStatement.bind(parser), ParseError.LeftSquareBracketExpected);
		assertError('IF [ ', parser, parser._parseIfStatement.bind(parser), ParseError.ExpressionExpected);
		assertError('IF [1 ', parser, parser._parseIfStatement.bind(parser), ParseError.RightSquareBracketExpected);
		assertError('IF [1] ', parser, parser._parseIfStatement.bind(parser), ParseError.ThenGotoExpected);
		assertError('IF [1] THEN ', parser, parser._parseIfStatement.bind(parser, ()=> {}), ParseError.EndifExpected);
		assertError('IF [1] THEN\nIF [1] THEN #1 = 1\nIF [1] THEN #1 = 1\nENDIF', 
			parser, parser._parseIfStatement.bind(parser, parser._parseIfStatement.bind(parser, () => {})),  ParseError.EndifExpected);
	});

	test('WHILE statement', function () {
		let parser = new Parser(null);
		assertNode('WHILE [1] DO 1\nEND 1', parser, parser._parseWhileStatement.bind(parser, ()=> {}));
	
		assertError('WHILE ', parser, parser._parseWhileStatement.bind(parser), ParseError.LeftSquareBracketExpected);
		assertError('WHILE [ ', parser, parser._parseWhileStatement.bind(parser), ParseError.ExpressionExpected);
		assertError('WHILE [1 ', parser, parser._parseWhileStatement.bind(parser), ParseError.RightSquareBracketExpected);
		assertError('WHILE [1] ', parser, parser._parseWhileStatement.bind(parser), ParseError.DoExpected);
		assertError('WHILE [1] DO ', parser, parser._parseWhileStatement.bind(parser), ParseError.LabelExpected);
		assertError('WHILE [1] DO 1\n ', parser, parser._parseWhileStatement.bind(parser, ()=> {}), ParseError.EndExpected);
		assertError('WHILE [1] DO 1\n END', parser, parser._parseWhileStatement.bind(parser, ()=> {}), ParseError.LabelExpected);
	});
	
	test('Binary expression', function () {
		let parser = new Parser(null);
		assertNode('+1', parser, parser._parseBinaryExpr.bind(parser));
		assertNode('-1', parser, parser._parseBinaryExpr.bind(parser));
		assertNode('1+1', parser, parser._parseBinaryExpr.bind(parser));
		assertNode('[1+1]', parser, parser._parseBinaryExpr.bind(parser));
		assertNode('+[1+1]', parser, parser._parseBinaryExpr.bind(parser));
		assertNode('-[1+1]', parser, parser._parseBinaryExpr.bind(parser));
		assertNode('#1', parser, parser._parseBinaryExpr.bind(parser));
		assertNode('#[1+1]', parser, parser._parseBinaryExpr.bind(parser));
		assertNode('#[1+[1]]', parser, parser._parseBinaryExpr.bind(parser));
		assertNode('#[1+#[1]]', parser, parser._parseBinaryExpr.bind(parser));
	
		assertError('[ ', parser, parser._parseBinaryExpr.bind(parser), ParseError.TermExpected);
		assertError('[1 ', parser, parser._parseBinaryExpr.bind(parser), ParseError.RightSquareBracketExpected);
		assertError('[1+[ ', parser, parser._parseBinaryExpr.bind(parser), ParseError.TermExpected);
		assertError('[1+[1 ', parser, parser._parseBinaryExpr.bind(parser), ParseError.RightSquareBracketExpected);
	});

	test('Conditional expression', function () {
		let parser = new Parser(null);
		assertNode('1 EQ 1', parser, parser._parseConditionalExpression.bind(parser, false));
		assertNode('1 || 1', parser, parser._parseConditionalExpression.bind(parser, false));
		assertNode('1 EQ 1 || 1', parser, parser._parseConditionalExpression.bind(parser, false));
		assertNode('1 EQ 1 || 1 EQ 1', parser, parser._parseConditionalExpression.bind(parser, false));

		assertError('1 EQ ', parser, parser._parseConditionalExpression.bind(parser, false), ParseError.TermExpected);
		assertError('1 EQ 1 || ', parser, parser._parseConditionalExpression.bind(parser, false), ParseError.ExpressionExpected);
	});

	test('Unary operator', function () {
		let parser = new Parser(null);
		assertNode('+', parser, parser._parseUnaryOperator.bind(parser));
		assertNode('-', parser, parser._parseUnaryOperator.bind(parser));
	});

	test('Binary operator', function () {
		let parser = new Parser(null);
		assertNode('and', parser, parser._parseBinaryOperator.bind(parser));
		assertNode('or', parser, parser._parseBinaryOperator.bind(parser));
		assertNode('xor', parser, parser._parseBinaryOperator.bind(parser));
		assertNode('mod', parser, parser._parseBinaryOperator.bind(parser));
		assertNode('/', parser, parser._parseBinaryOperator.bind(parser));
		assertNode('*', parser, parser._parseBinaryOperator.bind(parser));
		assertNode('+', parser, parser._parseBinaryOperator.bind(parser));
		assertNode('-', parser, parser._parseBinaryOperator.bind(parser));
	});

	test('Conditional operator', function () {
		let parser = new Parser(null);
		assertNode('eq', parser, parser._parseConditionalOperator.bind(parser));
		assertNode('ne', parser, parser._parseConditionalOperator.bind(parser));
		assertNode('le', parser, parser._parseConditionalOperator.bind(parser));
		assertNode('ge', parser, parser._parseConditionalOperator.bind(parser));
		assertNode('lt', parser, parser._parseConditionalOperator.bind(parser));
		assertNode('gt', parser, parser._parseConditionalOperator.bind(parser));
	});

	test('Logical operator', function () {
		let parser = new Parser(null);
		assertNode('||', parser, parser._parseLogicalOperator.bind(parser));
		assertNode('&&', parser, parser._parseLogicalOperator.bind(parser));
	});

	test('New line', function () {
		let parser = new Parser(null);
		assertError('@var1  1 10 ', parser, parser._parseMacroFile.bind(parser), ParseError.InvalidStatement);
		assertError('>var2  1 10 ', parser, parser._parseMacroFile.bind(parser), ParseError.InvalidStatement);
		assertError('O 100 N10 ', parser, parser._parseMacroFile.bind(parser), ParseError.NewLineExpected);
		assertError('O 100 \n #100 = 1 N10 ', parser, parser._parseMacroFile.bind(parser), ParseError.NewLineExpected);
		assertError('O 100 \n IF [1] THEN #1 = 1 N10 ', parser, parser._parseMacroFile.bind(parser), ParseError.NewLineExpected);
		assertError('O 100 \n IF [1] GOTO 10 N10 ', parser, parser._parseMacroFile.bind(parser), ParseError.NewLineExpected);
		assertError('O 100 \n WHILE [1] DO 1 N10 ', parser, parser._parseMacroFile.bind(parser), ParseError.NewLineExpected);
		assertError('O 100 \n WHILE [1] DO 1 \n END 1 N10', parser, parser._parseMacroFile.bind(parser), ParseError.NewLineExpected);
		assertError('O 100 \n IF [1] THEN #1=1 N10\n ENDIF\n ', parser, parser._parseMacroFile.bind(parser), ParseError.NewLineExpected);
		assertError('O 100 \n IF [1] THEN \n ENDIF N10 ', parser, parser._parseMacroFile.bind(parser), ParseError.NewLineExpected);
		assertError('O 100 \n N100 G01 #1=1 ', parser, parser._parseMacroFile.bind(parser), ParseError.NewLineExpected);
		assertError('O 100 \n / N100 G01 #1=1 ', parser, parser._parseMacroFile.bind(parser), ParseError.NewLineExpected);
	});

	test('Functions', function () {
		let parser = new Parser(null);
		assertNode('sin[1]', parser, parser._parseFfunc.bind(parser));
		assertNode('cos[1]', parser, parser._parseFfunc.bind(parser));
		assertNode('tan[1]', parser, parser._parseFfunc.bind(parser));
		assertNode('asin[1]', parser, parser._parseFfunc.bind(parser));
		assertNode('acos[1]', parser, parser._parseFfunc.bind(parser));
		assertNode('atan[1]', parser, parser._parseFfunc.bind(parser));
		assertNode('atan[1,1]', parser, parser._parseFfunc.bind(parser));
		assertNode('atan[1]/[1]', parser, parser._parseFfunc.bind(parser));
		assertNode('sqrt[1]', parser, parser._parseFfunc.bind(parser));
		assertNode('abs[1]', parser, parser._parseFfunc.bind(parser));
		assertNode('bin[1]', parser, parser._parseFfunc.bind(parser));
		assertNode('bcd[1]', parser, parser._parseFfunc.bind(parser));
		assertNode('round[1]', parser, parser._parseFfunc.bind(parser));
		assertNode('fix[1]', parser, parser._parseFfunc.bind(parser));
		assertNode('fup[1]', parser, parser._parseFfunc.bind(parser));
		assertNode('ln[1]', parser, parser._parseFfunc.bind(parser));
		assertNode('exp[1]', parser, parser._parseFfunc.bind(parser));
		assertNode('pow[1,1]', parser, parser._parseFfunc.bind(parser));
		assertNode('adp[1]', parser, parser._parseFfunc.bind(parser));
		assertNode('prm[1]', parser, parser._parseFfunc.bind(parser));
		assertNode('prm[1,1]', parser, parser._parseFfunc.bind(parser));
		assertNode('prm[1]/[1]', parser, parser._parseFfunc.bind(parser));
	});

	test('Commands', function () {
		let parser = new Parser(null);
		assertNode('popen', parser, parser._parseFcommand.bind(parser));
		assertNode('pclos', parser, parser._parseFcommand.bind(parser));
		assertNode('dprnt[]', parser, parser._parseFcommand.bind(parser));
		assertNode('bprnt[]', parser, parser._parseFcommand.bind(parser));
		assertNode('setvn 100[test]', parser, parser._parseFcommand.bind(parser));
		assertNode('fgen(1,1,1)', parser, parser._parseFcommand.bind(parser));
		assertNode('fdel(1,1)', parser, parser._parseFcommand.bind(parser));
		assertNode('fopen(1,1,1)', parser, parser._parseFcommand.bind(parser));
		assertNode('fclos(1)', parser, parser._parseFcommand.bind(parser));
		assertNode('fpset(1,1,1)', parser, parser._parseFcommand.bind(parser));
		assertNode('fread(1,1,1)', parser, parser._parseFcommand.bind(parser));
		assertNode('fwrit(1,1,1)', parser, parser._parseFcommand.bind(parser));
	});

	test('Non Symbol Statement', function () {
		let parser = new Parser(null);
		assertNode('1AND2EQ#1AND#1||1ANDSIN[1]', parser, parser._parseConditionalExpression.bind(parser, false));
	});

});