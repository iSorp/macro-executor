/*---------------------------------------------------------------------------------------------
* Copyright (c) 2020 Simon Waelti
* Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
'use strict';

import {
	TextDocument, MacroFileProvider, 
	Proposed, SemanticTokensBuilder, TokenTypes, Range
} from '../macroLanguageTypes';
import * as nodes from '../parser/macroNodes';


export class MacroSemantic {
	constructor() {}
	
	public doSemanticHighlighting(document: TextDocument, macroFile: nodes.MacroFile, range:Range | undefined) : Proposed.SemanticTokens {

		const builder = new SemanticTokensBuilder();
		let start:number;
		let end:number;
		if (range){
			start = document.offsetAt(range.start);
			end = document.offsetAt(range.end);
		}
		macroFile.accept(candidate => {
			if (range) {
				if (candidate.offset < start){
					return true;
				}
				if (candidate.offset > end){
					return false;
				} 
			}
		
			if (candidate.type === nodes.NodeType.label) {
				const label = <nodes.Label>candidate;
				if (label.symbol){
					const pos = document.positionAt(label.symbol.offset);
					builder.push(pos.line, pos.character, label.symbol.length, TokenTypes.label, 0);
				}
			}
			else if (candidate.type === nodes.NodeType.Variable && candidate.getParent()?.type !== nodes.NodeType.Function) {	
				const variable = <nodes.Variable>candidate;
				if (variable.symbol) {
					const pos = document.positionAt(variable.symbol.offset);
					const type = variable.declaration?.valueType;
					if (type === nodes.ValueType.Variable) {
						builder.push(pos.line, pos.character, variable.symbol.length, TokenTypes.variable, 0);
					}
					else if (type === nodes.ValueType.Constant) {
						if (!RegExp(/(true)|(false)/i).test(variable.symbol.getText())) {
							builder.push(pos.line, pos.character, variable.symbol.length, TokenTypes.constant, 0);
						}
					}
					else if (type === nodes.ValueType.Numeric) {
						builder.push(pos.line, pos.character, variable.symbol.length, TokenTypes.symbol, 0);
					}
					else if (type === nodes.ValueType.NcCode) {
						builder.push(pos.line, pos.character, variable.symbol.length, TokenTypes.code, 0);
					}
					else if (type === nodes.ValueType.Address) {
						builder.push(pos.line, pos.character, variable.symbol.length, TokenTypes.address, 0);
					}
					else if (!type && !Number.isNaN(Number(variable.getName()))) {
						builder.push(pos.line, pos.character, variable.symbol.length, TokenTypes.number, 0);
					}
				}
			}
			return true;
		});
		return builder.build();
	}
}
