/*---------------------------------------------------------------------------------------------
* Copyright (c) 2020 Simon Waelti
* Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
'use strict';

import {
	TextDocument, LanguageSettings, CustomKeywords,
	SemanticTokens, SemanticTokensBuilder, TokenTypes, Range
} from '../macroLanguageTypes';
import * as nodes from '../parser/macroNodes';


export class MacroSemantic {
	private builder:SemanticTokensBuilder;
	private document: TextDocument;
	private customKeywords:CustomKeywords[];

	constructor() {}
	
	public doSemanticHighlighting(document: TextDocument, macroFile: nodes.MacroFile, settings: LanguageSettings, range:Range | undefined) : SemanticTokens {
		this.builder = new SemanticTokensBuilder();
		this.document = document;
		this.customKeywords = settings.keywords;

		try {
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
				
				if (candidate.type === nodes.NodeType.Symbol) {
					const symbol = <nodes.Symbol>candidate;
					switch (symbol.valueType) {
						case nodes.NodeType.Numeric:
							if (symbol.getParent()?.type !== nodes.NodeType.Program) {

								if (symbol.attrib === nodes.ValueAttribute.Constant) {
									this.build(symbol, candidate.type, TokenTypes.constant);
								}
								else {
									this.build(symbol, candidate.type, TokenTypes.number);
								}
							} 
							break;
						case nodes.NodeType.Code:
							this.build(symbol, symbol.type, TokenTypes.code);
							break;							
						case nodes.NodeType.Parameter:
							this.build(symbol, symbol.type, TokenTypes.parameter);
							break;
						case nodes.NodeType.Statement:
							if (symbol.attrib === nodes.ValueAttribute.GCode || symbol.attrib === nodes.ValueAttribute.MCode) {
								this.build(symbol, symbol.type, TokenTypes.code);
							}
							else {
								this.build(symbol, symbol.type, TokenTypes.parameter);
							}
						case nodes.NodeType.Address:
							if (symbol.attrib === nodes.ValueAttribute.GCode || symbol.attrib === nodes.ValueAttribute.MCode) {
								this.build(symbol, symbol.type, TokenTypes.code);
							}
							else if (symbol.attrib === nodes.ValueAttribute.Parameter) {
								this.build(symbol, symbol.type, TokenTypes.parameter);
							}
							else {
								this.build(symbol, symbol.type, TokenTypes.address);
							}
							break;
						case nodes.NodeType.SequenceNumber:
							this.build(symbol, symbol.type, TokenTypes.label);
							break;					
						case nodes.NodeType.Variable:
							this.build(symbol, symbol.type, TokenTypes.macrovar);
							break;	
						default:
							this.build(symbol, symbol.type);
					}
				}
				else if (candidate.type === nodes.NodeType.Label) {
					this.build(candidate, candidate.type, TokenTypes.label);
				}
				else if (!candidate.symbolLink) {
					if (candidate.type === nodes.NodeType.Code) {
						this.build(candidate, candidate.type);
					}
				}

				return true;
			});
			return this.builder.build();
		}
		finally {
			this.customKeywords = null!;
			this.document = null!;
			this.builder = null!;
		}
	}

	private build(node:nodes.Node, type:nodes.NodeType, tokenType?:TokenTypes) {
		const pos = this.document.positionAt(node.offset);
		let token:TokenTypes = tokenType;
		const customKey = this.customKeywords.find(a => a.symbol === node.getText() && (!a.nodeType || nodes.NodeType[a.nodeType] === type));
		if (customKey && customKey.scope) {
			token = TokenTypes[customKey.scope];
		}
		
		if (token) {
			if (node.type === nodes.NodeType.Symbol || node.type === nodes.NodeType.Label) {
				this.builder.push(pos.line, pos.character, node.getText().length, token, 0);
			}
			else {
				this.builder.push(pos.line, pos.character, node.length, token, 0);
			}
		}
	}
}
