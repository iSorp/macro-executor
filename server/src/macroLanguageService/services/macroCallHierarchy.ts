/*---------------------------------------------------------------------------------------------
* Copyright (c) 2020 Simon Waelti
* Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
'use strict';

import { URI, Utils } from 'vscode-uri';
import * as path from 'path';
import {
	MacroFileProvider, TextDocument, Position, Range, 
	CallHierarchyItem, CallHierarchyIncomingCall, SymbolKind,
	LanguageSettings, SRC_FILES
} from '../macroLanguageTypes';
import * as nodes from '../parser/macroNodes';

export class MacroCallHierarchy {
	constructor(private fileProvider: MacroFileProvider) {}

	public doPrepareCallHierarchy(document: TextDocument, position: Position, macroFile: nodes.Node): CallHierarchyItem[] | null {

		const offset = document.offsetAt(position);
		const node = nodes.getNodeAtOffset(macroFile, offset);

		if (node) {
			const range = this.getRange(node, document);
			return [
				{
					name: node.getNodeText(),
					uri: document.uri,
					kind: SymbolKind.Function,
					range: range,
					selectionRange: range
				}
			];
		} else {
			return null;
		}
	}

	public doIncomingCalls(document: TextDocument, item: CallHierarchyItem, macroFile: nodes.Node, settings: LanguageSettings): CallHierarchyIncomingCall[] | null {

		let items:CallHierarchyIncomingCall[] = [];

		const offset = document.offsetAt(item.range.start);
		const node = nodes.getNodeAtOffset(macroFile, offset);
		const files = this.fileProvider.getAll({glob:SRC_FILES});

		for (const file of files) {

			(<nodes.Node>file.macrofile).accept(candidate => {	

				if (candidate.getText() === node.getText()) {

					const program = candidate.findAParent(nodes.NodeType.Parameter);
					if (program) {
						const sibling = program.getLastSibling();
	
						if (sibling && (settings?.callFunctions.find(a => a === sibling.getText()))) {
							const caller = <nodes.Program>candidate.findAParent(nodes.NodeType.Program);
							const callerRange = this.getRange(caller.identifier, file.document);
							const range = this.getRange(candidate, file.document);
							const filename = path.basename(URI.parse(file.document.uri).fsPath);
		
							const incoming:CallHierarchyIncomingCall = {
								from: {
									name: caller.identifier.getNodeText(),
									uri: file.document.uri,
									kind: SymbolKind.Function,
									detail: file.document.uri === document.uri? null : filename,
									range: callerRange,
									selectionRange: range
								},
								fromRanges: [range]
							};
		
							items.push(incoming);
							return false;
						}
					}
				}
				return true;
			});
		}

		return items;
	}

	private getRange(node: nodes.Node, document: TextDocument): Range {
		return Range.create(document.positionAt(node.offset), document.positionAt(node.end));
	}
}