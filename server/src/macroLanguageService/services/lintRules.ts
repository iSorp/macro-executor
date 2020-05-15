/*---------------------------------------------------------------------------------------------
* Copyright (c) 2020 Simon Waelti
* Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
'use strict';

import * as nodes from '../parser/macroNodes';
import * as nls from 'vscode-nls';

const localize: nls.LocalizeFunc = nls.loadMessageBundle();
const Warning = nodes.Level.Warning;
const Error = nodes.Level.Error;
const Info = nodes.Level.Info;

export class Rule implements nodes.IRule {

	public constructor(public id: string, public message: string, public defaultValue: nodes.Level) {}
}

export const Rules = {
	DuplicateIncludes: new Rule('duplicateIncludes', localize('rule.duplicateIncludes', 'Duplicate includes'), Error),
	DuplicateDeclarations: new Rule('duplicateDeclarations', localize('rule.duplicateDeclarations', 'Duplicated symbol declaration'), Error),
	DuplicateFunction: new Rule('duplicateFunction', localize('rule.duplicateFunction', 'Duplicate function'), Warning),
	DuplicateAddress: new Rule('duplicateAddress', localize('rule.duplicateAddress', 'Duplicate address'), Warning),
	DuplicateSequence: new Rule('duplicateSequence', localize('rule.duplicateSequence', 'Duplicate sequence number'), Warning),
	DuplicateLabel: new Rule('duplicateLabel', localize('rule.duplicateLabel', 'Duplicate label number'), Warning),
	DuplicateLabelSequence: new Rule('duplicateLabelSequence', localize('rule.duplicateLabelSequence', 'Sequence number and label define the same value'), Warning),

	UnknownSymbol: new Rule('unknownSymbol', localize('rule.unknownSymbol', 'Unknown symbol.'), Error),
	IllegalStatement: new Rule('illegalStatement', localize('rule.illegalStatement', 'Illegal statement'), Error),
	MixedConditionals: new Rule('mixedConditionals', localize('rule.mixedConditionals', 'Mixed conditionals [&&, ||]'), Error),
	TooManyConditionals: new Rule('tooManyConditionals', localize('rule.tooManyConditionals', 'Too many conditional statemens'), Error),
	IncopleteParameter: new Rule('incopleteParameter', localize('rule.incopleteParameter', 'incomplete parameter found. G-Code or M-Code may need a numeric value or a variable as parameter'), Error),
	IncludeNotFound: new Rule('includeNotFound', localize('rule.includeNotFound', 'Include file not found'), Error),
	AssignmentConstant: new Rule('assignmentConstant', localize('rule.assignmentConstant', 'Assignment to constant'), Warning),


};
