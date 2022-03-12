/*---------------------------------------------------------------------------------------------
* Copyright (c) 2020 Simon Waelti
* Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
'use strict';

import {
	MacroFileProvider, TextEdit,
	TextDocumentEdit, TextDocument, Position, Range,
	LanguageSettings
} from '../macroLanguageTypes';
import * as nodes from '../parser/macroNodes';

export class MacroCommand {

	constructor(private fileProvider: MacroFileProvider) {}

	public doRefactorSequences(document: TextDocument, position: Position, macroFile: nodes.MacroFile, settings: LanguageSettings) : TextDocumentEdit | null {
		let edit:TextDocumentEdit | null = null;
		const node = nodes.getNodeAtOffset(macroFile, document.offsetAt(position));
		if (node){
			const func = <nodes.Program>node.findAParent(nodes.NodeType.Program);
			const inc = settings?.sequence?.increment ? Number(settings?.sequence?.increment) : 10;
			let seq = settings?.sequence?.base ? Number(settings?.sequence?.base) : 1000;
			let gotoLabelList: nodes.Node[] = [];

			if (func) {
				const textEdits:TextEdit[] = [];
				func.accept(candidate => {
					if (candidate.type === nodes.NodeType.Goto) {
						const gnode = (<nodes.GotoStatement>candidate).getLabel();
						if (gnode && !gnode.symbol) {
							const gotoNumber = Number(gnode.getText());
							if (Number.isInteger(gotoNumber)) {
								gotoLabelList.push(gnode);
							}
							return false;
						}
					}
					return true;
				});

				func.accept(candidate => {
					this.skip(candidate, () => {
						if (candidate.type === nodes.NodeType.SequenceNumber) {
							const nnode = (<nodes.SequenceNumber>candidate).getNumber();
							
							if (nnode && !nnode.symbol) {
								const labels = gotoLabelList.filter(a => a.getText() === nnode?.getText());
								const start = document.positionAt(nnode.offset);
								const end = document.positionAt(nnode.end);
								textEdits.push(TextEdit.del(Range.create(start, end)));
								textEdits.push(TextEdit.insert(start, seq+''));
	
								for (const label of labels) {
									const start = document.positionAt(label.offset);
									const end = document.positionAt(label.end);
									textEdits.push(TextEdit.del(Range.create(start, end)));
									textEdits.push(TextEdit.insert(start, seq.toString()));
									var index = gotoLabelList.indexOf(label);
									if (index > -1) {
										gotoLabelList.splice(index, 1);
									}
								}
								seq = seq + inc;
							}
						}
					});
					return true;
				});
				if (textEdits.length > 0) {
					edit = TextDocumentEdit.create({ 
						uri: document.uri, 
						version: document.version 
					}, 
					textEdits
					);
				}
			}
		}
		return edit;
	}

	public doCreateSequences(document: TextDocument, position: Position, macroFile: nodes.MacroFile, settings: LanguageSettings) : TextDocumentEdit | null {
		let edit:TextDocumentEdit | null = null;
		const node = nodes.getNodeAtOffset(macroFile, document.offsetAt(position));
		if (node) {
			const func = <nodes.Program>node.findAParent(nodes.NodeType.Program);
			const inc = settings?.sequence?.increment ? Number(settings?.sequence?.increment) : 10;
			let seq = this.getMaxSequenceNumber(func);
			if (seq <= 0) {
				seq = settings?.sequence?.base ? Number(settings?.sequence?.base) : 1000;
			}
			else {
				seq += inc;
			}

			if (func) {
				const textEdits:TextEdit[] = [];
				func.accept(candidate => {
					this.skip(candidate, () => {
						if (candidate.type === nodes.NodeType.Statement && !candidate.findAParent(nodes.NodeType.SequenceNumber)) {
							const statement = (<nodes.NcStatement>candidate);
							if (statement) {
								const n = 'N' + seq + ' ';
								const start = document.positionAt(statement.offset);
								textEdits.push(TextEdit.insert(start, n));
								seq = seq + inc;
								return false;
							}
						}
					});
					return true;
				});

				if (textEdits.length > 0) {
					edit = TextDocumentEdit.create({ 
						uri: document.uri, 
						version: document.version 
					}, 
					textEdits
					);
				}
			}
		}
		return edit;
	}

	private getMaxSequenceNumber(node: nodes.Node) : number {
		let seq = -1;
		node.accept(candidate => {
			this.skip(candidate, () => {
				if (candidate.type === nodes.NodeType.SequenceNumber) {
					const nnode = (<nodes.SequenceNumber>candidate).getNumber();
					const number = Number(nnode?.getText().toLocaleLowerCase().split('n').pop());
					if (nnode && !Number.isNaN(number)) {
						seq = Math.max(seq, number);
						return false;
					}
				}
			});
			return true;
		});
		return seq;
	}

	private _skip = false;
	private skip(candidate:nodes.Node, f:() => void) {
		function checkSkip(candidate:nodes.Node, code:string) : boolean {
			let result = false;
			for (const child of candidate.getChildren()) {
				result =  checkSkip(child, code);
				const childText = child.getText().toLocaleLowerCase();
				if (childText === code) {
					result = true;
					return result;
				}
			} 
			return result;
		}

		if (candidate.type === nodes.NodeType.Statement || candidate.type === nodes.NodeType.SequenceNumber) {
			if (checkSkip(candidate, 'g11')) {
				this._skip = false;
			}
			if (!this._skip) {
				f();
			}
			if (checkSkip(candidate, 'g10')) {
				this._skip = true;
			}
		}
	}
}
