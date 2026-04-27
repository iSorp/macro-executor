/*---------------------------------------------------------------------------------------------
* Copyright (c) 2020 Simon Waelti
* Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
'use strict';

import * as nodes from '../parser/macroNodes';
import { localize } from '../../l10nService';
import { 
	LintSettings
} from '../macroLanguageTypes';

const Warning = nodes.Level.Warning;
const Error = nodes.Level.Error;
const Ignore = nodes.Level.Ignore;

export class Rule implements nodes.IRule {

	public constructor(public id: string, private messageKey: string, private defaultMessage: string, public defaultValue: nodes.Level) {}

	public get message(): string {
        return localize(this.messageKey, this.defaultMessage);
    }
}

export const Rules = {
	DuplicateInclude: new Rule('duplicateInclude', 'rule.duplicateInclude', 'Duplicate include', Error),
	DuplicateDeclaration: new Rule('duplicateDeclaration', 'rule.duplicateDeclaration', 'Duplicate symbol declaration', Error),
	DuplicateFunction: new Rule('duplicateFunction', 'rule.duplicateFunction', 'Duplicate function', Warning),
	DuplicateAddress: new Rule('duplicateAddress', 'rule.duplicateAddress', 'Duplicate address', Ignore),
	DuplicateSequence: new Rule('duplicateSequence', 'rule.duplicateSequence', 'Duplicate sequence number', Warning),
	DuplicateLabel: new Rule('duplicateLabel', 'rule.duplicateLabel', 'Duplicate label number', Warning),
	DuplicateLabelSequence: new Rule('duplicateLabelSequence', 'rule.duplicateLabelSequence', 'Sequence number and label define the same value', Warning),

	UnknownSymbol: new Rule('unknownSymbol', 'rule.unknownSymbol', 'Unknown symbol.', Error),
	WhileLogicOperator: new Rule('whileLogicOperator', 'rule.whileLogicOperator', 'Logic operator in WHILE statement [&&, ||]', Error),
	DoEndNumberTooBig: new Rule('doEndNumberTooBig', 'rule.doEndNumberTooBig', 'DO or END number too big', Error),
	DoEndNumberNotEqual: new Rule('doEndNumberNotEqual', 'rule.doEndNumberNotEqual', 'Not agree END statement number to pair of DO', Error),
	NestingTooDeep: new Rule('nestingTooDeep', 'rule.nestingTooDeep', 'Nesting too deep', Error),
	DuplicateDoEndNumber: new Rule('duplicateDoEndNumber', 'rule.duplicateDoEndNumber', 'Duplicate DO or END number', Warning),
	MixedConditionals: new Rule('mixedConditionals', 'rule.mixedConditionals', 'Mixed conditionals [&&, ||]', Error),
	TooManyConditionals: new Rule('tooManyConditionals', 'rule.tooManyConditionals', 'Too many conditional statements', Error),
	SeqNotFound: new Rule('seqNotFound', 'rule.seqNotFound', 'Sequence number or label not found', Error),
	IncompleteParameter: new Rule('incompleteParameter', 'rule.incompleteParameter', 'Incomplete parameter found. G-Code or M-Code may need a numeric value or a variable as parameter', Error),
	IncludeNotFound: new Rule('includeNotFound', 'rule.includeNotFound', 'Include file not found', Error),
	AssignmentConstant: new Rule('assignmentConstant', 'rule.assignmentConstant', 'Assignment to constant', Ignore),
	BlockDelNumber: new Rule('blockDelNumber', 'rule.blockDelNumber', 'BLOCKDEL number not match 1-9', Error),
	UnsuitableNNAddress: new Rule('unsuitableNNAddress', 'rule.unsuitableNNAddress', 'Address NN is outside of a G10/G11 block', Warning),
	DataInputNotClosed: new Rule('dataInputNotClosed', 'rule.dataInputNotClosed', 'Data input not close with G11', Error),
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
