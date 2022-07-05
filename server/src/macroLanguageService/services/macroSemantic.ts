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
	private prevLine = -1;
	private prevChar = -1;
	
	constructor() {}
    
	public doSemanticHighlighting(document: TextDocument, macroFile: nodes.MacroFile, settings: LanguageSettings, range:Range | undefined) : SemanticTokens {
		this.builder = new SemanticTokensBuilder();
		this.document = document;
		this.customKeywords = settings.keywords;
		this.prevLine = -1;
		this.prevChar = -1;

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
                
				if (candidate.symbol) {
					const symbol = candidate.symbol;
					if (symbol.type === nodes.NodeType.Symbol) {
						switch (symbol.valueType) {
							case nodes.NodeType.Numeric:
								if (symbol.attrib === nodes.ValueAttribute.Constant) {
									this.build(symbol, nodes.NodeType.Symbol, TokenTypes.constant);
								}
								else if (symbol.attrib !== nodes.ValueAttribute.Program) {
									this.build(symbol, nodes.NodeType.Symbol, TokenTypes.number);
								}
								break;
							case nodes.NodeType.Code:
								this.build(symbol, nodes.NodeType.Symbol, TokenTypes.code);
								break;                          
							case nodes.NodeType.Parameter:
								this.build(symbol, nodes.NodeType.Symbol, TokenTypes.parameter);
								break;
							case nodes.NodeType.Statement:
								if (symbol.attrib === nodes.ValueAttribute.GCode || symbol.attrib === nodes.ValueAttribute.MCode) {
									this.build(symbol, nodes.NodeType.Symbol, TokenTypes.code);
								}
								else {
									this.build(symbol, nodes.NodeType.Symbol, TokenTypes.parameter);
								}
								break;
							case nodes.NodeType.Address:
								if (symbol.attrib === nodes.ValueAttribute.GCode || symbol.attrib === nodes.ValueAttribute.MCode) {
									this.build(symbol, nodes.NodeType.Symbol, TokenTypes.code);
								}
								else if (symbol.attrib === nodes.ValueAttribute.Parameter) {
									this.build(symbol, nodes.NodeType.Symbol, TokenTypes.parameter);
								}
								else {
									this.build(symbol, nodes.NodeType.Symbol, TokenTypes.address);
								}
								break;
							case nodes.NodeType.SequenceNumber:
								this.build(symbol, nodes.NodeType.Symbol, TokenTypes.label);
								break;                  
							case nodes.NodeType.Variable:
								this.build(symbol, nodes.NodeType.Symbol, TokenTypes.macrovar);
								break;  
						}
					}
					else if (symbol.type === nodes.NodeType.Label) {
						this.build(symbol, nodes.NodeType.Label, TokenTypes.label);
					}
				}
				else if (!candidate.symbol) {
					if (candidate.type === nodes.NodeType.Variable) {
						this.build((<nodes.Variable>candidate)?.body, nodes.NodeType.Variable);
					}
					else if (candidate.type === nodes.NodeType.Code) {
						this.build(candidate, nodes.NodeType.Code);
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
		if (!node) {
			return;
		}

		const pos = this.document.positionAt(node.offset);
		let token:TokenTypes = tokenType;
		const customKey = this.customKeywords.find(a => a.symbol === node.getText() && (!a.nodeType || nodes.NodeType[a.nodeType] === type));
		if (customKey && customKey.scope) {
			token = TokenTypes[customKey.scope];
		}

		if (token) {
			if (node.type === nodes.NodeType.Symbol || node.type === nodes.NodeType.Label) {
				if (this.prevLine !== pos.line || this.prevChar !== pos.character) {
					this.prevLine = pos.line;
					this.prevChar = pos.character;
					this.builder.push(pos.line, pos.character, node.getText().length, token, 0);	
				}
			}
			else {
				this.builder.push(pos.line, pos.character, node.length, token, 0);
			}
		}
	}
}
