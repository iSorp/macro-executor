/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2020 Simon Waelti
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nodes from './macroNodes';

import * as nls from 'vscode-nls';

const localize: nls.LocalizeFunc = nls.loadMessageBundle();

export class MacroIssueType implements nodes.IRule {
	id: string;
	message: string;

	public constructor(id: string, message: string) {
		this.id = id;
		this.message = message;
	}
}

export const ParseError = {
	DefinitionExpected: new MacroIssueType('macro-definitionexpected', localize('expected.definition', 'Definition file expected')),
	UnknownKeyword: new MacroIssueType('macro-unknownkeyword', localize('unknown.keyword', 'Unknown keyword')),
	EndifExpected: new MacroIssueType('macro-endifexpected', localize('expected.endif', 'Endif expected')),
	EndExpected: new MacroIssueType('macro-endexpected', localize('expected.end', 'End expected')),
	DoExpected: new MacroIssueType('macro-doexpected', localize('expected.do', 'Do expected')),
	ThenGotoExpected: new MacroIssueType('macro-thengotoexpected', localize('expected.thenGoto', 'Then or goto expected')),
	NewLineExpected: new MacroIssueType('macro-newlineexpected', localize('expected.newline', 'Newline expected')),
	LeftSquareBracketExpected: new MacroIssueType('macro-lbracketexpected', localize('expected.lsquare', '[ expected')),
	RightSquareBracketExpected: new MacroIssueType('macro-rbracketexpected', localize('expected.rsquare', '] expected')),
	LeftParenthesisExpected: new MacroIssueType('macro-lparentexpected', localize('expected.lparent', '( expected')),
	RightParenthesisExpected: new MacroIssueType('macro-rparentexpected', localize('expected.rparent', ') expected')),
	RightAngleBracketExpected: new MacroIssueType('macro-ranglebracketexpected', localize('expected.rangle', '> expected')),
	Badstring: new MacroIssueType('macro-badstring', localize('expected.badstring', 'Missing string delimiter')),
	OperatorExpected: new MacroIssueType('macro-operatorexpected', localize('expected.operator', 'Operator expected')),
	IdentifierExpected: new MacroIssueType('macro-identifierexpected', localize('expected.ident', 'Identifier expected')),
	FunctionIdentExpected: new MacroIssueType('macro-functionidentifierexpected', localize('expected.funcident', 'Function identifier expected')),
	AddressExpected: new MacroIssueType('macro-addressexpected', localize('expected.address', 'Address expected')),
	MacroVariableExpected: new MacroIssueType('macro-macrovariableexpected', localize('expected.macrovariable', 'Variable (#) expected')),
	PrntFormatExpected: new MacroIssueType('macro-prntformatexpected', localize('expected.prntformat', 'Format [F] expected')),
	BodyExpected: new MacroIssueType('macro-bodyexpected', localize('expected.body', 'Body expected')),
	LabelExpected: new MacroIssueType('macro-labelexpected', localize('expected.label', 'Label expected')),
	TermExpected: new MacroIssueType('macro-termexpected', localize('expected.term', 'Term expected')),
	NumberExpected: new MacroIssueType('macro-numberexpected', localize('expected.number', 'Number expected')),
	IntegerExpected: new MacroIssueType('macro-integerexpected', localize('expected.integer', 'Integer expected')),
	ParameterExpected: new MacroIssueType('macro-numberexpected', localize('expected.parameter', 'Parameter expected')),
	InvalidStatement: new MacroIssueType('macro-invalidstatement', localize('expected.invalidstatement', 'Invalid statement')),
	ExpressionExpected: new MacroIssueType('macro-expressionexpected', localize('expected.expression', 'Expression expected')),
	UnexpectedToken: new MacroIssueType('macro-unexpectedToken', localize('expected.unexpectedToken', 'Unexpected token')),
	EqualExpected: new MacroIssueType('macro-equalExpected', localize('expected.equalExpected', ' = expected')),
	SymbolError: new MacroIssueType('macro-symbolError', localize('symbol.symbolError', 'Inappropriate symbol definition')),
};
