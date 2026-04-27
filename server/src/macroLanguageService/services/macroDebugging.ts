/*---------------------------------------------------------------------------------------------
* Copyright (c) 2026 Simon Waelti
* Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
'use strict';

import {
	Position, TextDocument, ProgramDebugInfo,
	VariableInfo
} from '../macroLanguageTypes';
import * as nodes from '../parser/macroNodes';

export class MacroDebugging {

	public findProgramSequenceInfo(document: TextDocument, programNumber: number, sequenceNumber: number, macroFile: nodes.MacroFile): ProgramDebugInfo {

		let result:ProgramDebugInfo = null; 
		let seqFound = false;
		let progFound = false;
		macroFile.accept(candidate => {
			if (candidate.type === nodes.NodeType.Program) {
				const program = <nodes.Program>candidate;
				if (program.getIdentifier().getNonSymbolText() == String(programNumber)) {
					progFound = true;
					result = { 
						program: String(programNumber),
						sequence: sequenceNumber,
						line: document.positionAt(program.offset).line,
						uri: document.uri
					}

					result.program = program.getIdentifier().getText();
					program.accept(child => {
						if (child.type == nodes.NodeType.SequenceNumber){
							const sequence = <nodes.SequenceNumber>child;
							if (sequence.value == sequenceNumber) {
								result.line = document.positionAt(sequence.offset).line;
								result.sequence = sequenceNumber;
								seqFound = true;
							}
						}
						return !seqFound;
					});
				}
			}
			return !progFound;
		});

		return result;
	}

	public findVariableInfos(document: TextDocument, position: Position, macroFile: nodes.MacroFile): VariableInfo | null {

		const offset = document.offsetAt(position);
		const nodepath = nodes.getNodePath(macroFile, offset, nodes.NodeType.SymbolRoot);

		for (let i = nodepath.length-1; i >= 0; i--) {
			const node = nodepath[i];

			if (node.type === nodes.NodeType.Variable || node.type === nodes.NodeType.Address) {

				const program = <nodes.Program>node.findParent(nodes.NodeType.Program);
				const symbol = node.getText();
				const address = node.getNonSymbolText();

				if ( !program || !symbol || address.length < 2) {
					return null;
				}

				return {
					id: symbol,
					address: address,
					program: program.identifier.getText()
				};
			}
		}

		return null;
	}

	public findAllVariableInfos(macroFile: nodes.MacroFile): VariableInfo[] | null {
		return this.findVariableInfosInternal(null, macroFile);
	}

	public findProgramVariableInfos(programNumber: number | null, macroFile: nodes.MacroFile): VariableInfo[] | null {
		return this.findVariableInfosInternal(programNumber, macroFile);
	}

	private findVariableInfosInternal(programNumber: number | null, macroFile: nodes.MacroFile): VariableInfo[] | null {

		let result:VariableInfo[] = null; 
		let parent:nodes.Node = null;
		let found = false;
		
		// Search the program node containing the programNumber 
		if (programNumber) {
			let program:nodes.Program = null;
			
			macroFile.accept(candidate => {
				if (candidate.type === nodes.NodeType.Program) {
					program = <nodes.Program>candidate;
					if (program.getIdentifier().getNonSymbolText() == String(programNumber)) {
						found = true;
						parent = program;
					}
				}
				return !found;
			});

			if (!program) {
				return result;
			}
		}
		else {
			parent = macroFile;
		}

		// Search all variables either of the program or the file
		const variables = new Map<string, VariableInfo>();

		parent.accept(candidate => {
			if (candidate.type === nodes.NodeType.Assignment) {
				return true;
			}

			if (candidate.type === nodes.NodeType.Variable) {
				const node = <nodes.Variable>candidate;
				const symbol = node.getText();
				let address:string = undefined;
	
				// Currently only numberic variable bodies are allowed. Expression can't be resolved.
				if (node.body.type === nodes.NodeType.Numeric) {
					address = node.getNonSymbolText();
				}
				else if (node.body.type === nodes.NodeType.BinaryExpression && node.body.getChildren().length === 1) {
					// Allow #[1000] #[var]

					if (node.body.getChild(0).getChild(0).type === nodes.NodeType.Numeric) {
						address = '#' + node.body.getChild(0).getChild(0).getNonSymbolText();
					}
				}

				if (address?.length >= 2) {
					variables.set(symbol, {
						id: symbol,
						address: address
					});	

					return false;			
				}
			}
			else if (candidate.type === nodes.NodeType.Address) {
				const node = <nodes.Address>candidate;
				
				// Currently only numberic variable bodies are allowed. Expression can't be resolved.
				if (node.getChild(0)?.type !== nodes.NodeType.BinaryExpression) {
					const symbol = node.getText();
					const address = node.getNonSymbolText();

					if (symbol && address.length >= 2) {
						const parts = address.split('.');
						const bit = parts.length > 1 ? parseInt(parts[1]) : null;
						variables.set(symbol, {
							id: symbol,
							address: address,
							size: bit !== null ? 1 : 8,
						});						
					}

					return false;	
				}
			}

			return true;
		});

		return Array.from(variables.values());
	}
}
