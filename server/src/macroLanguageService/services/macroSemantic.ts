/*---------------------------------------------------------------------------------------------
* Copyright (c) 2020 Simon Waelti
* Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
'use strict';

import {
	TextDocument, LanguageSettings, Position,
	Proposed, SemanticTokensBuilder, TokenTypes, Range
} from '../macroLanguageTypes';
import * as nodes from '../parser/macroNodes';


export class MacroSemantic {
	private builder:SemanticTokensBuilder;
	private settings:LanguageSettings;
	private document: TextDocument;

	constructor() {}
	
	public doSemanticHighlighting(document: TextDocument, macroFile: nodes.MacroFile, settings: LanguageSettings, range:Range | undefined) : Proposed.SemanticTokens {
		this.builder = new SemanticTokensBuilder();
		this.settings = settings;
		this.document = document;

		let start:number;
		let end:number;
		if (range){
			start = document.offsetAt(range.start);
			end = document.offsetAt(range.end);
		}
		macroFile.accept(candidate => {
			if (range) {
				if (candidate.offset < start) {
					return true;
				}
				if (candidate.offset > end) {
					return false;
				} 
			}
			if (candidate.type === nodes.NodeType.Code) {
				this.build(candidate, candidate.type);
			}
			else if (candidate.type === nodes.NodeType.Label) {
				const label = <nodes.Label>candidate;
				if (label.symbol){
					this.build(label.symbol, label.type, TokenTypes.label);
				}
			}
			else if (candidate.type === nodes.NodeType.Variable) {	
				const variable = <nodes.Variable>candidate;
				if (variable.symbol) {
					const type = variable.declaration?.valueType;
					if (type === nodes.ValueType.Variable) {
						this.build(variable.symbol, variable.type, TokenTypes.macrovar);
					}
					else if (type === nodes.ValueType.Constant && candidate.getParent()?.type !== nodes.NodeType.Function) {
						this.build(variable.symbol, variable.type, TokenTypes.constant);
					}
					else if (type === nodes.ValueType.Numeric && candidate.getParent()?.type !== nodes.NodeType.Function) {
						this.build(variable.symbol, variable.type, TokenTypes.symbol);
					}
					else if (type === nodes.ValueType.NcCode) {
						this.build(variable.symbol, variable.type, TokenTypes.code);
					}
					else if (type === nodes.ValueType.NcParam) {
						this.build(variable.symbol, variable.type, TokenTypes.parameter);
					}
					else if (type === nodes.ValueType.Address) {
						this.build(variable.symbol, variable.type, TokenTypes.address);
					}
					else if (type === nodes.ValueType.Sequence) {
						this.build(variable.symbol, variable.type, TokenTypes.label);
					}
					else if (!type && !Number.isNaN(Number(variable.getName()))) {
						this.build(variable.symbol, variable.type, TokenTypes.number);
					}
				}
			}

			return true;
		});
		return this.builder.build();
	}

	private build(node:nodes.Node, type:nodes.NodeType, tokenType?:TokenTypes) {
		const pos = this.document.positionAt(node.offset);
		let token:TokenTypes = tokenType;
		const customKey = this.settings.keywords.find(a => RegExp('^'+a.symbol+'$').test(node.getText()) && (!a.nodeType || nodes.NodeType[a.nodeType] === type));
		if (customKey) {
			token = TokenTypes[customKey.scope];
		}
		
		if (token) {
			this.builder.push(pos.line, pos.character, node.length, token, 0);
		}
	}
}
