/*---------------------------------------------------------------------------------------------
*	Copyright (c) 2020 Simon Waelti
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {
	DocumentHighlight, DocumentHighlightKind, DocumentLink, Location,
	Position, Range, SymbolInformation, SymbolKind, TextEdit, 
	WorkspaceEdit, TextDocument, DocumentContext, MacroFileProvider, MacroFileType
} from '../macroLanguageTypes';
import * as nodes from '../parser/macroNodes';
import { Symbols, Symbol } from '../parser/macroSymbolScope';


export class MacroNavigation {
	constructor(private fileProvider?: MacroFileProvider){}
	
	public findDefinition(document: TextDocument, position: Position, macroFile: nodes.Node): Location | null {
		let declarations:MacroFileType[] = [];

		if (this.fileProvider){
			declarations = this.getIncludes(macroFile, this.fileProvider);
		}
		
		declarations.push({document: document, macrofile: macroFile, version:0});
		const offset = document.offsetAt(position);
		const node = nodes.getNodeAtOffset(macroFile, offset);
		if (!node) {
			return null;
		}
	
		for (const declaration of declarations) {
			const symbols = new Symbols(<nodes.Node>declaration.macrofile);
			const symbol = symbols.findSymbolFromNode(node);
			if (!symbol) {
				continue;
			}
		
			return {
				uri: declaration.document.uri,
				range: this.getRange(symbol.node, declaration.document)
			};
		}
		return null;
	}
	
	public findReferences(document: TextDocument, position: Position, macroFile: nodes.MacroFile): Location[] {

		let locations:Location[] = [];

		const offset = document.offsetAt(position);
		const node = nodes.getNodeAtOffset(macroFile, offset);
		if (!node) {
			return locations;
		}

		let include = this.findInclude(document, position, macroFile);
		if (!include){
			return locations;
		}

		let symbols = new Symbols(<nodes.Node>macroFile);
		let symbol = symbols.findSymbolFromNode(node);
		if (symbol) {
			return this.findLocalReferences(symbol, symbols, document, macroFile);
		}
		else{
			return this.findGlobalReferences(include, position, node ,document, macroFile);
		}
	

		return locations;
	}

	private findInclude(document: TextDocument, position: Position, macroFile: nodes.Node): string | null {
		let declarations:MacroFileType[] = [];

		if (this.fileProvider){
			declarations = this.getIncludes(macroFile, this.fileProvider);
		}
		
		declarations.push({document: document, macrofile: macroFile, version:0});
		const offset = document.offsetAt(position);
		const node = nodes.getNodeAtOffset(macroFile, offset);
		if (!node) {
			return null;
		}
	
		for (const declaration of declarations) {
			const symbols = new Symbols(<nodes.Node>declaration.macrofile);
			const symbol = symbols.findSymbolFromNode(node);
			if (!symbol) {
				continue;
			}

			return declaration.document.uri;
		}
		return null;
	}

	private findLocalReferences(symbol:Symbol, symbols:Symbols, document: TextDocument, macroFile: nodes.MacroFile) : Location[] {
	
		const highlights: DocumentHighlight[] = [];
		let locations:Location[] = [];

		macroFile.accept(candidate => {
			if (symbol) {
				if (symbols.matchesSymbol(candidate, symbol)) {
					highlights.push({
						kind: this.getHighlightKind(candidate),
						range: this.getRange(candidate, document)
					});
					return false;
				}
			} 
			return true;
		});
	
		return highlights.map(h => {
			return {
				uri: document.uri,
				range: h.range
			};
		});
	}

	private findGlobalReferences(include:string, position:Position, node:nodes.Node, document: TextDocument, macroFile: nodes.MacroFile):Location[] {
	
		let locations:Location[] = [];
		let declarations:MacroFileType[] = [];

		if (this.fileProvider){
			let dec = this.fileProvider?.getAll();
			if (dec) {
				declarations = declarations.concat(dec);
			}
		}
		
		for (const type of declarations) {

			const symbols = new Symbols(<nodes.Node>type.macrofile);
			const symbol = symbols.findSymbolFromNode(node);
			const name = node.getText();
			
			if (symbol) {
				continue; // local declaration found
			}

			if (include !== this.findInclude(document, position, macroFile)){
				continue;
			}

			const highlights: DocumentHighlight[] = [];

			(<nodes.Node>type.macrofile).accept(candidate => {
				if (symbol) {
					if (symbols.matchesSymbol(candidate, symbol)) {
						highlights.push({
							kind: this.getHighlightKind(candidate),
							range: this.getRange(candidate, type.document)
						});
						return false;
					}
				} 
				if (node && node.type === candidate.type && candidate.matches(name)) {
					// Same node type and data
					highlights.push({
						kind: this.getHighlightKind(candidate),
						range: this.getRange(candidate, type.document)
					});
				}
				return true;
			});
	
			const ret = highlights.map(h => {
				return {
					uri: type.document.uri,
					range: h.range
				};
			});
			locations = locations.concat(ret);
		}
		return locations;
	}

	public findDocumentHighlights(document: TextDocument, position: Position, macroFile: nodes.MacroFile): DocumentHighlight[] {
		const result: DocumentHighlight[] = [];

		const offset = document.offsetAt(position);
		let node = nodes.getNodeAtOffset(macroFile, offset);
		if (!node) {
			return result;
		}

		const symbols = new Symbols(macroFile);
		const symbol = symbols.findSymbolFromNode(node);
		const name = node.getText();

		macroFile.accept(candidate => {
			if (symbol) {
				if (symbols.matchesSymbol(candidate, symbol)) {
					result.push({
						kind: this.getHighlightKind(candidate),
						range: this.getRange(candidate, document)
					});
					return false;
				}
			} else if (node && node.type === candidate.type && candidate.matches(name)) {
				// Same node type and data
				result.push({
					kind: this.getHighlightKind(candidate),
					range: this.getRange(candidate, document)
				});
			}
			return true;
		});

		return result;
	}

	public findDocumentLinks(document: TextDocument, macroFile: nodes.MacroFile, documentContext: DocumentContext): DocumentLink[] {
		const result: DocumentLink[] = [];
		macroFile.accept(candidate => {
			if (candidate.type === nodes.NodeType.Include) {
				const link = this.uriLiteralNodeToDocumentLink(document, candidate, documentContext);
				if (link) {
					result.push(link);
				}
				return false;
			}
			return true;
		});
		return result;
	}

	public findDocumentSymbols(document: TextDocument, macroFile: nodes.MacroFile): SymbolInformation[] {
		const result: SymbolInformation[] = [];
		macroFile.accept((node) => {
			const entry: SymbolInformation = {
				name: null!,
				kind: SymbolKind.Class,
				location: null!
			};
			let locationNode: nodes.Node | null = node;

			if (node instanceof nodes.VariableDeclaration) {
				entry.name = (<nodes.VariableDeclaration>node).getName();
				entry.kind = SymbolKind.Variable;
			} 
			else if (node instanceof nodes.LabelDeclaration) {
				entry.name = (<nodes.LabelDeclaration>node).getName();
				entry.kind = SymbolKind.Constant;
			} 
			else if (node instanceof nodes.Function) {
				entry.name = (<nodes.Function>node).getName();
				entry.kind = SymbolKind.Function;
			} 
			else if (node instanceof nodes.Label) {
				entry.name = (<nodes.Label>node).getName();
				entry.kind = SymbolKind.Constant;
			} 
			else if (node instanceof nodes.NcCode) {
				entry.name = (<nodes.NcCode>node).getText();
				entry.kind = SymbolKind.Event;
			}
			else if (node instanceof nodes.NcParameter) {
				entry.name = (<nodes.NcParameter>node).getText();
				entry.kind = SymbolKind.Property;
			} 
			else if (node instanceof nodes.SequenceNumber) {
				entry.name = (<nodes.SequenceNumber>node).getText();
				entry.kind = SymbolKind.Field;
			} 

			if (entry.name) {
				entry.location = Location.create(document.uri, this.getRange(locationNode, document));
				result.push(entry);
			}

			return true;
		});
		return result;
	}

	public doRename(document: TextDocument, position: Position, newName: string, macroFile: nodes.MacroFile): WorkspaceEdit {
		const highlights = this.findDocumentHighlights(document, position, macroFile);
		const edits = highlights.map(h => TextEdit.replace(h.range, newName));
		return {
			changes: { [document.uri]: edits }
		};
	}

	private uriLiteralNodeToDocumentLink(document: TextDocument, uriLiteralNode: nodes.Node, documentContext: DocumentContext): DocumentLink | null {
		if (uriLiteralNode.getChildren().length === 0) {
			return null;
		}
		const uriStringNode = uriLiteralNode.getChild(0);
		return this.uriStringNodeToDocumentLink(document, uriStringNode, documentContext);
	}
	
	private uriStringNodeToDocumentLink(document: TextDocument, uriStringNode: nodes.Node | null, documentContext: DocumentContext): DocumentLink | null {
		if (!uriStringNode) {
			return null;
		}
	
		let rawUri = uriStringNode.getText();
		const range = this.getRange(uriStringNode, document);
	
		if (range.start.line === range.end.line && range.start.character === range.end.character) {
			return null;
		}
		let target = documentContext.resolveReference(rawUri, document.uri);
		return {
			range,
			target
		};
	}
	
	private getRange(node: nodes.Node, document: TextDocument): Range {
		return Range.create(document.positionAt(node.offset), document.positionAt(node.end));
	}
	
	private getHighlightKind(node: nodes.Node): DocumentHighlightKind {
		return DocumentHighlightKind.Read;
	}
	
	private getIncludes(macrofile:nodes.MacroFile, fileProvider:MacroFileProvider) : MacroFileType[] {
		let declarations:MacroFileType[] = [];
		macrofile.accept(candidate => {
			if (candidate.type === nodes.NodeType.Include) {
				const uriStringNode = candidate.getChild(0);
				if (uriStringNode){
					let dec = fileProvider?.get(uriStringNode?.getText());
					if (dec) {
						declarations.push(dec);
					}
				}
				return false;
			}
			return true;
		});
		return declarations;
	}
}
