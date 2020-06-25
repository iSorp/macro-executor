/*---------------------------------------------------------------------------------------------
* Copyright (c) 2020 Simon Waelti
* Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
'use strict';

import {
	DocumentHighlight, DocumentHighlightKind, DocumentLink, Location,
	Position, Range, SymbolInformation, SymbolKind, TextEdit, 
	MacroCodeLensCommand, TextDocument, DocumentContext, MacroFileProvider, 
	WorkspaceEdit, MacroCodeLensType
} from '../macroLanguageTypes';
import * as nodes from '../parser/macroNodes';
import { Symbols, Symbol } from '../parser/macroSymbolScope';
import { CodeLens } from 'vscode-languageserver';


class FunctionMap {
	private elements:Map<string, Location[]> = new Map<string,Location[]>();
	public add(key:string, value:Location){
		if (!this.elements.has(key)){
			this.elements.set(key, new Array<Location>());
		}
		this.elements.get(key)?.push(value);
	}

	public get(key:string) : Location[] | undefined {
		return this.elements.get(key);
	}
}

type EditEntries = {
	[key:string]:TextEdit[];
}

export class MacroNavigation {
	constructor(private fileProvider: MacroFileProvider){}
	
	public findDefinition(document: TextDocument, position: Position, macroFile: nodes.Node): Location | null {

		const includes = this.getIncludeUris(macroFile, this.fileProvider);
		includes.push(document.uri);
		const offset = document.offsetAt(position);
		const node = nodes.getNodeAtOffset(macroFile, offset);
		if (!node) {
			return null;
		}
	
		for (const uri of includes) {
			let type = this.fileProvider?.get(uri);
			if (!type){
				continue;
			}

			const symbols = new Symbols(<nodes.Node>type.macrofile);
			const symbol = symbols.findSymbolFromNode(node);
			if (!symbol) {
				continue;
			}
		
			return {
				uri: type.document.uri,
				range: this.getRange(symbol.node, type.document)
			};
		}
		return null;
	}
	
	public findReferences(document: TextDocument, position: Position, macroFile: nodes.MacroFile, implType:nodes.ReferenceType | undefined = undefined): Location[] {

		let locations:Location[] = [];

		const offset = document.offsetAt(position);
		const node = nodes.getNodeAtOffset(macroFile, offset);
		if (!node) {
			return locations;
		}

		let include = this.findIncludeUri(document, node, macroFile);
		if (!include){
			return locations;
		}

		let symbols = new Symbols(<nodes.Node>macroFile);
		let symbol = symbols.findSymbolFromNode(node);
		if (symbol && !node.findAParent(nodes.NodeType.DefFile)) {
			return this.findLocalReferences(symbol, symbols, document, macroFile, implType);
		}
		else{
			return this.findGlobalReferences(include, position, node, implType);
		}
	}

	public findImplementations(document: TextDocument, position: Position, macroFile: nodes.MacroFile): Location[] {
		const node = nodes.getNodeAtOffset(macroFile, document.offsetAt(position));
		let referenceType:nodes.ReferenceType = undefined;
		switch (node.getParent().type) {
			case nodes.NodeType.VariableDef:
			case nodes.NodeType.Variable:
				referenceType = nodes.ReferenceType.Function;
				break;
			case nodes.NodeType.Goto:	
			case nodes.NodeType.labelDef:	
			case nodes.NodeType.Label:	
				referenceType = nodes.ReferenceType.JumpLabel;
				break;
			default:
				return [];
		}

		return this.findReferences(document, position, macroFile, referenceType);
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

			if (node.type === nodes.NodeType.VariableDef) {
				entry.name = (<nodes.VariableDeclaration>node).getName();
				entry.kind = SymbolKind.Variable;
			} 
			else if (node.type === nodes.NodeType.labelDef) {
				entry.name = (<nodes.LabelDeclaration>node).getName();
				entry.kind = SymbolKind.Constant;
			} 
			else if (node.type === nodes.NodeType.Function) {
				entry.name = (<nodes.Function>node).getName();
				entry.kind = SymbolKind.Function;
			} 
			else if (node.type === nodes.NodeType.Label) {
				if (node.parent?.type === nodes.NodeType.Function) {
					let label = <nodes.Label>node;
					if (label.declaration?.valueType === nodes.ValueType.Numeric) {
						entry.name = label.getName();
						entry.kind = SymbolKind.Constant;
					} 
					else if (label.declaration?.valueType === nodes.ValueType.String){
						entry.name = label.getName();
						entry.kind = SymbolKind.String;
					} 
				}
			} 
			else if (node.type === nodes.NodeType.Variable) {
				let variable = <nodes.Variable>node;

				if (variable.parent?.type === nodes.NodeType.Statement) {
					entry.name = variable.getName();
					switch (variable.declaration?.valueType){
						case nodes.ValueType.Address:
							entry.kind = SymbolKind.Interface;
							break;
						case nodes.ValueType.NcParam:
							entry.kind = SymbolKind.Property;
							break;
						case nodes.ValueType.Constant:
							entry.kind = SymbolKind.Constant;
							break;
						case nodes.ValueType.Variable:
							entry.kind = SymbolKind.Variable;
							break;
						case nodes.ValueType.Numeric:
							entry.kind = SymbolKind.Variable;
							break;
						case nodes.ValueType.NcCode:
							entry.kind = SymbolKind.Event;
							break;
						case nodes.ValueType.Undefinded:
							entry.kind = SymbolKind.Variable;
							break;
						default:
							entry.kind = SymbolKind.Variable;
							break;
					}
				} 	
				else if (variable.declaration?.valueType === nodes.ValueType.NcCode){
					entry.name = variable.getName();
					entry.kind = SymbolKind.Event;
				} 
			} 
			else if (node.type === nodes.NodeType.BlockSkip) {
				entry.name = node.getText();
				entry.kind = SymbolKind.Field;
			} 
			else if (node.type === nodes.NodeType.SequenceNumber && node.getChildren().length > 1) {
				if (node.getParent()?.type !== nodes.NodeType.BlockSkip){
					entry.name = node.getText();
					entry.kind = SymbolKind.Field;
				}
			}
			else if (node.type === nodes.NodeType.Statement && node.getChildren().length > 1) {
				if (node.getParent()?.type !== nodes.NodeType.SequenceNumber && node.getParent()?.type !== nodes.NodeType.BlockSkip){
					entry.name = node.getText();
					entry.kind = SymbolKind.Field;
				}
			}
			else if (node.type === nodes.NodeType.Code) {
				entry.name = (<nodes.NcCode>node).getText();
				entry.kind = SymbolKind.Event;
			}
			else if (node.type === nodes.NodeType.Parameter) {
				entry.name = (<nodes.NcParameter>node).getText();
				entry.kind = SymbolKind.Property;
			} 
			else if (node.type === nodes.NodeType.Goto) {
				entry.name = node.getText();
				entry.kind = SymbolKind.Event;
			} 
		
			if (entry.name) {
				entry.location = Location.create(document.uri, this.getRange(locationNode, document));
				result.push(entry);
			}

			return true;
		});
		return result;
	}

	public findCodeLenses(document: TextDocument, macroFile: nodes.MacroFile): CodeLens[] {
		function getRange(node: nodes.Node, document: TextDocument) {
			return Range.create(document.positionAt(node.offset), document.positionAt(node.end));
		}	

		const codeLenses: CodeLens[] = [];
		const declarations:FunctionMap = new FunctionMap();

		// local search
		if (macroFile.type === nodes.NodeType.MacroFile) {
			macroFile.accept(candidate => {
				if (candidate.type === nodes.NodeType.Variable || candidate.type === nodes.NodeType.Label) {
					const node = (<nodes.AbstractDeclaration>candidate).getSymbol();
					if (node) {
						declarations.add(node.getText(), {
							uri:document.uri,  
							range: getRange(node, document)
						});
					}
					return false;
				}			
				return true;
			});
		}
		// global search
		else {

			let types = this.fileProvider.getAll({glob:'/**/*.[sS][rR][cC]'});
			for (const type of types) {

				if (((<nodes.Node>type.macrofile).type === nodes.NodeType.DefFile)) {
					continue;
				}

				if ((<nodes.Node>type.macrofile).type === nodes.NodeType.MacroFile) {
					const includes = this.getIncludeUris(<nodes.Node>type.macrofile, this.fileProvider);
					if (includes.filter(uri => uri === document.uri).length <= 0) {
						continue;
					}
				}

				(<nodes.Node>type.macrofile).accept(candidate => {
					if (candidate.type === nodes.NodeType.Variable || candidate.type === nodes.NodeType.Label) {
						const node = (<nodes.AbstractDeclaration>candidate).getSymbol();
						if (node) {
							declarations.add(node.getText(), {
								uri:type.document.uri,  
								range: getRange(node, type.document)
							});
						}
						return false;
					}
					return true;
				});
			}
		}

		(<nodes.Node>macroFile).accept(candidate => {
			if (candidate.type === nodes.NodeType.VariableDef || candidate.type === nodes.NodeType.labelDef) {

				const node = (<nodes.AbstractDeclaration>candidate).getSymbol();
				if (node) {
					const value = declarations.get(node.getText()); //declarations.filter(a => a === node?.getText());
					const count = value?.length;
					const c = count === undefined ? 0 : count;
					const t:MacroCodeLensType = {
						title: c + (c !== 1 ? ' references' : ' reference'),
						locations: value,
						type: MacroCodeLensCommand.References
					};
					codeLenses.push(
						{
							range: getRange(node, document), 
							data:t
						});
				}
				return false;
			}
			return true;
		});

		return codeLenses;
	}
	
	public doRename(document: TextDocument, position: Position, newName: string, macroFile: nodes.MacroFile): WorkspaceEdit {
		const locations = this.findReferences(document, position, macroFile);
		const edits:EditEntries = {};
		const allUris = locations.map(a => a.uri);
		const uniqueUris = allUris.filter((v,i) => allUris.indexOf(v) === i);

		for (const uri of uniqueUris) {
			const fileLocations = locations.filter(a => uri === a.uri);
			edits[uri] = fileLocations.map(h => TextEdit.replace(h.range, newName));
		}

		return {
			changes: edits
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
	
	private findLocalReferences(symbol:Symbol, symbols:Symbols, document: TextDocument, macroFile: nodes.MacroFile, implType:nodes.ReferenceType | undefined = undefined) : Location[] {
	
		const highlights: DocumentHighlight[] = [];

		macroFile.accept(candidate => {
			if (symbol) {
				if (symbols.matchesSymbol(candidate, symbol)) {
					let s = <nodes.Symbol>candidate;
					if (s && s.referenceTypes && implType){
						if (s.referenceTypes.indexOf(implType) > -1) {
							highlights.push({
								kind: this.getHighlightKind(candidate),
								range: this.getRange(candidate, document)
							});
						}
					}
					else {
						highlights.push({
							kind: this.getHighlightKind(candidate),
							range: this.getRange(candidate, document)
						});
					}
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

	private findGlobalReferences(includeUri:string, position:Position, node:nodes.Node, implType:nodes.ReferenceType | undefined = undefined):Location[] {
	
		let locations:Location[] = [];
		let types = this.fileProvider.getAll({glob:'/**/*.[sS][rR][cC]'});
		const origin = this.fileProvider.get(includeUri);
		if (origin){
			types = types.concat(origin);
		}

		for (const type of types) {

			// for macro files: only accept a src file which includes the origin def file
			if ((<nodes.Node>type.macrofile).type === nodes.NodeType.MacroFile) {
				const includes = this.getIncludeUris(<nodes.Node>type.macrofile, this.fileProvider);
				if (includes.filter(uri => uri === includeUri).length <= 0){
					continue;
				}
			}

			// all symbols found in the file
			const symbols = new Symbols(<nodes.Node>type.macrofile);
			
			// finding condition: name and reference type
			const symbol = symbols.findSymbolFromNode(node); 			
			const name = node.getText();
			
			// only accept the symbol of the origin symbol source file
			if (symbol && includeUri !== type.document.uri) {
				continue; // local declaration found
			}

			const highlights: DocumentHighlight[] = [];
			(<nodes.Node>type.macrofile).accept(candidate => {
				if (node && node.type === candidate.type && candidate.matches(name)) {
					let s = <nodes.Symbol>candidate;
					if (s && s.referenceTypes && implType){
						if (s.referenceTypes?.indexOf(implType) > 0) {
							highlights.push({
								kind: this.getHighlightKind(candidate),
								range: this.getRange(candidate, type.document)
							});
						}
					}
					else {
						highlights.push({
							kind: this.getHighlightKind(candidate),
							range: this.getRange(candidate, type.document)
						});
					}
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

	/**
	 * Finds the uri of the declaration origin of a certain node
	 * @param document 
	 * @param node 
	 * @param macroFile 
	 */
	private findIncludeUri(document: TextDocument, node: nodes.Node, macroFile: nodes.Node): string | null {
		const includes = this.getIncludeUris(macroFile, this.fileProvider);
		includes.push(document.uri);
		if (!node) {
			return null;
		}
	
		for (const uri of includes) {
			let type = this.fileProvider?.get(uri);
			if (!type) {
				continue;
			}

			const symbols = new Symbols(<nodes.Node>type.macrofile);
			const symbol = symbols.findSymbolFromNode(node);
			if (!symbol) {
				continue;
			}

			return type.document.uri;
		}
		return null;
	}

	/**
	 * Gets the include uris of a macrofile
	 * @param macroFile 
	 * @param fileProvider 
	 */
	private getIncludeUris(macroFile: nodes.MacroFile, fileProvider:MacroFileProvider) : string[] {
		const includes = <string[]>macroFile.getData(nodes.Data.Includes);
		if (includes) {
			return [].concat(includes);
		}
		return [];
	}

	private getHighlightKind(node: nodes.Node): DocumentHighlightKind {
		return DocumentHighlightKind.Read;
	}
}
