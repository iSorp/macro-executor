/*---------------------------------------------------------------------------------------------
* Copyright (c) 2020 Simon Waelti
* Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
'use strict';

import { URI, Utils } from 'vscode-uri';
import * as path from 'path';
import {
	MacroFileProvider, TextDocument, Position, Range, 
	CallHierarchyItem, CallHierarchyIncomingCall, CallHierarchyOutgoingCall,
	SymbolKind, LanguageSettings, Location
} from '../macroLanguageTypes';
import * as nodes from '../parser/macroNodes';
import { MacroNavigation } from './macroNavigation';

export class MacroCallHierarchy {

	private navigation: MacroNavigation;

	constructor(private fileProvider: MacroFileProvider) {
		this.navigation = new MacroNavigation(this.fileProvider);
	}

	public doPrepareCallHierarchy(document: TextDocument, position: Position, macroFile: nodes.Node): CallHierarchyItem[] | null {

		const offset = document.offsetAt(position);
		const node = nodes.getNodeAtOffset(macroFile, offset);

		if (node) {
			const range = this.getRange(node, document);
			return [
				{
					name: node.getText(),
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

		const items: Map<string, CallHierarchyIncomingCall> = new Map<string, CallHierarchyIncomingCall>();

		const macrofile = this.fileProvider.get(item.uri)?.macrofile;
		if (!macrofile) {
			return null;
		}

		const locations = this.navigation.findReferences(document, item.range.start, <nodes.MacroFile>macrofile);
		for (const location of locations) {
			const macroFileType = this.fileProvider.get(location.uri);

			if (!macroFileType) {
				continue;
			}

			const callerFromIdent = this.getNodeFromLocation(macroFileType.document, <nodes.MacroFile>macroFileType.macrofile, location);
			const parameter = callerFromIdent.findAParent(nodes.NodeType.Parameter);
			if (parameter) {
				const callFunction = parameter.getLastSibling();
				if (callFunction && (settings?.callFunctions.find(a => a === callFunction.getNonSymbolText()))) {

					const callerFromProgram = <nodes.Program>callerFromIdent.findAParent(nodes.NodeType.Program);
					const callerFromRange = this.getRange(callerFromIdent, macroFileType.document);
					const key = callerFromProgram.identifier.getNonSymbolText()+macroFileType.document.uri;

					if (!items.has(key)) {
	
						const callerToRange = this.getRange(callerFromProgram.identifier, macroFileType.document);
						const filename = path.basename(URI.parse(macroFileType.document.uri).fsPath);
		
						items.set(key, {
							from: {
								name: callerFromProgram.identifier.getText(),
								uri: macroFileType.document.uri,
								kind: SymbolKind.Function,
								detail: macroFileType.document.uri === document.uri? null : filename,
								range: callerToRange,
								selectionRange: callerToRange
							},
							fromRanges: [callerFromRange]
						});
					}
					else {
						items.get(key).fromRanges.push(callerFromRange);
					}
				}
			}
		}

		return [...items.values()];
	}

	public doOutgoingCalls(document: TextDocument, item: CallHierarchyItem, macroFile: nodes.MacroFile, settings: LanguageSettings): CallHierarchyOutgoingCall[] | null {

		const items: Map<string, CallHierarchyOutgoingCall> = new Map<string, CallHierarchyOutgoingCall>();

		const locations = this.navigation.findImplementations(document, item.range.start, macroFile);
		for (const location of locations) {
			const macroFileType = this.fileProvider.get(location.uri);

			if (!macroFileType) {
				continue;
			}
	
			const sourceProgramIdent = this.getNodeFromLocation(macroFileType.document, <nodes.MacroFile>macroFileType.macrofile, location);
			if (sourceProgramIdent) {
				const sourceProgram = sourceProgramIdent.getParent();

				sourceProgram.accept(candidate => {

					if (settings?.callFunctions.find(a => a === candidate.getNonSymbolText())) {

						const parameter = candidate.getNextSibling();
						const callerFromIdent = parameter.getChild(0);
						const callerFromRange = this.getRange(callerFromIdent, macroFileType.document);
						const locations = this.navigation.findImplementations(macroFileType.document, macroFileType.document.positionAt(callerFromIdent.offset), macroFile);

						for (const location of locations) {
							const macroFileType = this.fileProvider.get(location.uri);
				
							if (!macroFileType) {
								continue;
							}
					
							const callerToIdent = this.getNodeFromLocation(macroFileType.document, <nodes.MacroFile>macroFileType.macrofile, location);
							if (callerToIdent) {
								const callerToProgram = <nodes.Program>callerToIdent.getParent();
								const key = callerToProgram.identifier.getNonSymbolText()+macroFileType.document.uri;

								if (!items.has(key)) {

									const callerToRange = this.getRange(callerToProgram.identifier, macroFileType.document);
									const filename = path.basename(URI.parse(macroFileType.document.uri).fsPath);

									items.set(key, {
										to: {
											name: callerToProgram.identifier.getText(),
											uri: macroFileType.document.uri,
											kind: SymbolKind.Function,
											detail: macroFileType.document.uri === document.uri? null : filename,
											range: callerToRange,
											selectionRange: callerToRange // Range beim entferten symbol
										},
										fromRanges: [callerFromRange]
									});
								}
								else {
									items.get(key).fromRanges.push(callerFromRange);
								}
		
								return false;
							}
						}
					}
					return true;
				});
			}

			break; 
		}

		return [...items.values()];
	}

	private getNodeFromLocation(document: TextDocument, macroFile: nodes.MacroFile, location: Location) : nodes.Node {
		const offset = document.offsetAt(location.range.start);
		return nodes.getNodeAtOffset(macroFile, offset, nodes.NodeType.SymbolRoot);
	}

	private getRange(node: nodes.Node, document: TextDocument): Range {
		return Range.create(document.positionAt(node.offset), document.positionAt(node.end));
	}
}
