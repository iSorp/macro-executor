/*---------------------------------------------------------------------------------------------
* Copyright (c) 2020 Simon Waelti
* Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
'use strict';

import {
	TextDocument, MacroFileProvider, 
	Proposed, SemanticTokensBuilder, TokenTypes
} from '../macroLanguageTypes';
import * as nodes from '../parser/macroNodes';


export class MacroSemantic {
	constructor() {}
	
	public doSemanticColorization(document: TextDocument, macroFile: nodes.MacroFile) : Proposed.SemanticTokens {

		const builder = this.getTokenBuilder(document);
		macroFile.accept(candidate => {
			if (candidate.type === nodes.NodeType.label) {
				const pos = document.positionAt(candidate.offset);
				builder.push(pos.line, pos.character, candidate.length, TokenTypes.label, 0);
			}
			else if (candidate.type === nodes.NodeType.Variable && candidate.getParent()?.type !== nodes.NodeType.Function) {	
				const variable = <nodes.Variable>candidate;
				if (variable.symbol) {
					const pos = document.positionAt(variable.symbol.offset);
					const type = variable.declaration?.valueType;
					if (type === nodes.ValueType.Constant){
						builder.push(pos.line, pos.character, candidate.length, TokenTypes.constant, 0);
					}
					else if (type === nodes.ValueType.NcCode) {
						builder.push(pos.line, pos.character, candidate.length, TokenTypes.code, 0);
					}
					else if (type === nodes.ValueType.Address) {
						builder.push(pos.line, pos.character, candidate.length, TokenTypes.parameter, 0);
					}
					else if (!type && !Number.isNaN(Number(variable.getName()))) {
						builder.push(pos.line, pos.character, candidate.length, TokenTypes.number, 0);
					}
					else {
						builder.push(pos.line, pos.character, candidate.length, TokenTypes.variable, 0);
					}
				}
			}

			return true;
		});

		return builder.build();
	}

	private tokenBuilders: Map<string, SemanticTokensBuilder> = new Map();
	private getTokenBuilder(document: TextDocument): SemanticTokensBuilder {
		let result = this.tokenBuilders.get(document.uri);
		this.tokenBuilders = new Map();
		if (result !== undefined) {
			return result;
		}
		result = new SemanticTokensBuilder();
		this.tokenBuilders.set(document.uri, result);
		return result;
	}
}
