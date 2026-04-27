/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2020 Simon Waelti
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nodes from './macroNodes';

import { localize } from '../../l10nService';

export class MacroIssueType implements nodes.IRule {
	id: string;
	messageKey: string;

	public constructor(id: string, messageKey: string, private defaultMessage: string) {
		this.id = id;
		this.messageKey = messageKey;
	}

	public get message(): string {
        return localize(this.messageKey, this.defaultMessage);
    }
}

export const ParseError = {
	DefinitionExpected: new MacroIssueType('macro-definitionexpected', 'expected.definition', 'Definition file expected'),
	UnknownKeyword: new MacroIssueType('macro-unknownkeyword', 'unknown.keyword', 'Unknown keyword'),
	EndifExpected: new MacroIssueType('macro-endifexpected', 'expected.endif', 'Endif expected'),
	EndExpected: new MacroIssueType('macro-endexpected', 'expected.end', 'End expected'),
	DoExpected: new MacroIssueType('macro-doexpected', 'expected.do', 'Do expected'),
	ThenGotoExpected: new MacroIssueType('macro-thengotoexpected', 'expected.thenGoto', 'Then or goto expected'),
	NewLineExpected: new MacroIssueType('macro-newlineexpected', 'expected.newline', 'Newline expected'),
	LeftSquareBracketExpected: new MacroIssueType('macro-lbracketexpected', 'expected.lsquare', '[ expected'),
	RightSquareBracketExpected: new MacroIssueType('macro-rbracketexpected', 'expected.rsquare', '] expected'),
	LeftParenthesisExpected: new MacroIssueType('macro-lparentexpected', 'expected.lparent', '( expected'),
	RightParenthesisExpected: new MacroIssueType('macro-rparentexpected', 'expected.rparent', ') expected'),
	RightAngleBracketExpected: new MacroIssueType('macro-ranglebracketexpected', 'expected.rangle', '> expected'),
	Badstring: new MacroIssueType('macro-badstring', 'expected.badstring', 'Missing string delimiter'),
	OperatorExpected: new MacroIssueType('macro-operatorexpected', 'expected.operator', 'Operator expected'),
	IdentifierExpected: new MacroIssueType('macro-identifierexpected', 'expected.ident', 'Identifier expected'),
	FunctionIdentExpected: new MacroIssueType('macro-functionidentifierexpected', 'expected.funcident', 'Function identifier expected'),
	AddressExpected: new MacroIssueType('macro-addressexpected', 'expected.address', 'Address expected'),
	MacroVariableExpected: new MacroIssueType('macro-macrovariableexpected', 'expected.macrovariable', 'Variable (#) expected'),
	PrntFormatExpected: new MacroIssueType('macro-prntformatexpected', 'expected.prntformat', 'Format [F] expected'),
	BodyExpected: new MacroIssueType('macro-bodyexpected', 'expected.body', 'Body expected'),
	LabelExpected: new MacroIssueType('macro-labelexpected', 'expected.label', 'Label expected'),
	TermExpected: new MacroIssueType('macro-termexpected', 'expected.term', 'Term expected'),
	NumberExpected: new MacroIssueType('macro-numberexpected', 'expected.number', 'Number expected'),
	IntegerExpected: new MacroIssueType('macro-integerexpected', 'expected.integer', 'Integer expected'),
	ParameterExpected: new MacroIssueType('macro-numberexpected', 'expected.parameter', 'Parameter expected'),
	InvalidStatement: new MacroIssueType('macro-invalidstatement', 'expected.invalidstatement', 'Invalid statement'),
	ExpressionExpected: new MacroIssueType('macro-expressionexpected', 'expected.expression', 'Expression expected'),
	UnexpectedToken: new MacroIssueType('macro-unexpectedToken', 'expected.unexpectedToken', 'Unexpected token'),
	EqualExpected: new MacroIssueType('macro-equalExpected', 'expected.equalExpected', ' = expected'),
	SymbolError: new MacroIssueType('macro-symbolError', 'symbol.symbolError', 'Inappropriate symbol definition'),
	InvalidVariableName: new MacroIssueType('macro-invalidVariableName', 'invalid.variableName', 'Invalid variable name'),
};
