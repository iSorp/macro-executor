/*---------------------------------------------------------------------------------------------
* Copyright (c) 2020 Simon Waelti
* Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
'use strict';

import * as nodes from '../parser/macroNodes';
import * as nls from 'vscode-nls';
import { 
	LintSettings } from '../macroLanguageTypes';

const localize: nls.LocalizeFunc = nls.loadMessageBundle();
const Warning = nodes.Level.Warning;
const Error = nodes.Level.Error;
const Ignore = nodes.Level.Ignore;

export class Rule implements nodes.IRule {

	public constructor(public id: string, public message: string, public defaultValue: nodes.Level) {}
}

export const Rules = {
	DuplicateInclude: new Rule('duplicateInclude', localize('rule.duplicateInclude', 'Duplicate include'), Error),
	DuplicateDeclaration: new Rule('duplicateDeclaration', localize('rule.duplicateDeclaration', 'Duplicate symbol declaration'), Error),
	DuplicateFunction: new Rule('duplicateFunction', localize('rule.duplicateFunction', 'Duplicate function'), Warning),
	DuplicateAddress: new Rule('duplicateAddress', localize('rule.duplicateAddress', 'Duplicate address'), Ignore),
	DuplicateSequence: new Rule('duplicateSequence', localize('rule.duplicateSequence', 'Duplicate sequence number'), Warning),
	DuplicateLabel: new Rule('duplicateLabel', localize('rule.duplicateLabel', 'Duplicate label number'), Warning),
	DuplicateLabelSequence: new Rule('duplicateLabelSequence', localize('rule.duplicateLabelSequence', 'Sequence number and label define the same value'), Warning),

	UnknownSymbol: new Rule('unknownSymbol', localize('rule.unknownSymbol', 'Unknown symbol.'), Error),
	WhileLogicOperator: new Rule('whileLogicOperator', localize('rule.whileLogicOperator', 'Logic operator in WHILE statement [&&, ||]'), Error),
	DoEndNumberTooBig: new Rule('doEndNumberTooBig', localize('rule.doEndNumberTooBig', 'DO or END number too big'), Error),
	DoEndNumberNotEqual: new Rule('doEndNumberNotEqual', localize('rule.doEndNumberNotEqual', 'Not agree END statement number to pair of DO'), Error),
	NestingTooDeep: new Rule('nestingTooDeep', localize('rule.nestingTooDeep', 'Nesting too deep'), Error),
	DuplicateDoEndNumber: new Rule('duplicateDoEndNumber', localize('rule.duplicateDoEndNumber', 'Duplicate DO or END number'), Warning),
	MixedConditionals: new Rule('mixedConditionals', localize('rule.mixedConditionals', 'Mixed conditionals [&&, ||]'), Error),
	TooManyConditionals: new Rule('tooManyConditionals', localize('rule.tooManyConditionals', 'Too many conditional statements'), Error),
	SeqNotFound: new Rule('seqNotFound', localize('rule.seqNotFound', 'Sequence number or label not found'), Error),
	IncompleteParameter: new Rule('incompleteParameter', localize('rule.incompleteParameter', 'Incomplete parameter found. G-Code or M-Code may need a numeric value or a variable as parameter'), Error),
	IncludeNotFound: new Rule('includeNotFound', localize('rule.includeNotFound', 'Include file not found'), Error),
	AssignmentConstant: new Rule('assignmentConstant', localize('rule.assignmentConstant', 'Assignment to constant'), Ignore),
	BlockDelNumber: new Rule('blockDelNumber', localize('rule.blockDelNumber', 'BLOCKDEL number not match 1-9'), Error),

};

export class LintConfiguration {
	constructor(private conf?: LintSettings) {}

	getRule(rule: Rule): nodes.Level {
		if (this.conf?.rules){
			const level = toLevel(this.conf?.rules[rule.id]);
			if (level) {
				return level;
			}
		}
		return rule.defaultValue;
	}
}

function toLevel(level: string): nodes.Level | null {
	switch (level) {
		case 'ignore': return nodes.Level.Ignore;
		case 'warning': return nodes.Level.Warning;
		case 'error': return nodes.Level.Error;
	}
	return null;
}