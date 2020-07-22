/*---------------------------------------------------------------------------------------------
* Copyright (c) 2020 Simon Waelti
* Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
'use strict';

import {
	DocumentHighlight, DocumentHighlightKind, DocumentLink, Location,
	Position, Range, SymbolInformation, SymbolKind, TextEdit, 
	MacroCodeLensCommand, TextDocument, DocumentContext, MacroFileProvider, 
	WorkspaceEdit, MacroCodeLensType, MacroFileType
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

const ALL_FILES:string = '/**/*.{[sS][rR][cC],[dD][eE][fF]}';
const SRC_FILES:string = '/**/*.[sS][rR][cC]';

export class MacroNavigation {

	constructor(private fileProvider: MacroFileProvider){}
	
	public findDefinition(document: TextDocument, position: Position, macroFile: nodes.Node): Location | null {

		const includes = this.getIncludeUris(macroFile);
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

		const offset = document.offsetAt(position);
		const node = nodes.getNodeAtOffset(macroFile, offset);
		if (!node) {
			return [];
		}
		
		const includeUri = this.findIncludeUri(document, node, macroFile);
		if (!includeUri) {
			return [];
		}

		const origin = this.fileProvider.get(includeUri);
		const symbolContext = new Symbols(<nodes.MacroFile>origin.macrofile);

		let files:MacroFileType[] = [];
		switch (node.type) {
			case nodes.NodeType.Code:
			case nodes.NodeType.Address:
				files = this.fileProvider.getAll({glob:ALL_FILES});
				return this.findReferencesInternal(files, node, symbolContext, implType);
			case nodes.NodeType.Symbol:
				// search macro variable symbol (#10000)
				if (node.parent.type === nodes.NodeType.Variable) {
					const variable = <nodes.Variable>node.parent;
					if (!variable.declaration && !Number.isNaN(Number(variable.getName()))) {
						files = this.fileProvider.getAll({glob:ALL_FILES});
						return this.findReferencesInternal(files, node, symbolContext, implType);
					}
				}
	
				// Search label and variables symbols
				if (!(origin.macrofile instanceof nodes.MacroFile)) {
					files = this.fileProvider.getAll({glob:SRC_FILES});
					files = files.filter(file => {
						const includes = this.getIncludeUris(<nodes.MacroFile>file.macrofile);
						if (includes.some(uri => uri === origin.document.uri)) {
							return true;
						}
					});
				}
				files.push(origin);
				return this.findReferencesInternal(files, node, symbolContext, implType);	
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

	public findDocumentLinks(document: TextDocument, macroFile: nodes.MacroFile): DocumentLink[] {
		const result: DocumentLink[] = [];
		macroFile.accept(candidate => {
			if (candidate.type === nodes.NodeType.Include) {
				const link = this.uriLiteralNodeToDocumentLink(document, candidate);
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
				const variable = <nodes.Variable>node;

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
							entry.kind = SymbolKind.Number;
							break;
						case nodes.ValueType.NcCode:
							entry.kind = SymbolKind.Event;
							break;
						default:
							entry.kind = SymbolKind.Variable;
							break;
					}
				} 	
				else if (variable.declaration?.valueType === nodes.ValueType.NcCode) {
					entry.name = variable.getName();
					entry.kind = SymbolKind.Event;
				} 
			} 
			else if (node.type === nodes.NodeType.BlockSkip) {
				entry.name = node.getText();
				entry.kind = SymbolKind.Field;
			} 
			else if (node.type === nodes.NodeType.SequenceNumber && node.getChildren().length > 1) {
				if (node.getParent()?.type !== nodes.NodeType.BlockSkip) {
					entry.name = node.getText();
					entry.kind = SymbolKind.Field;
				}
			}
			else if (node.type === nodes.NodeType.Statement && node.getChildren().length > 1) {
				if (node.getParent()?.type !== nodes.NodeType.SequenceNumber && node.getParent()?.type !== nodes.NodeType.BlockSkip) {
					entry.name = node.getText();
					entry.kind = SymbolKind.Field;
				}
				else {

					const variable = <nodes.Variable>node;
					if (variable && variable.declaration?.valueType === nodes.ValueType.Sequence) {
						entry.name = node.getText();
						entry.kind = SymbolKind.Field;
					}
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

			let types = this.fileProvider.getAll({glob:SRC_FILES});
			for (const type of types) {

				if (((<nodes.Node>type.macrofile).type === nodes.NodeType.DefFile)) {
					continue;
				}

				if ((<nodes.Node>type.macrofile).type === nodes.NodeType.MacroFile) {
					const includes = this.getIncludeUris(<nodes.Node>type.macrofile);
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
					const value = declarations.get(node.getText()); 
					const count = value?.length;
					const c = count === undefined ? 0 : count;
					const t:MacroCodeLensType = {
						title: c + (c !== 1 ? ' references' : ' reference'),
						locations: value?value:[],
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

	private uriLiteralNodeToDocumentLink(document: TextDocument, uriLiteralNode: nodes.Node): DocumentLink | null {
		if (uriLiteralNode.getChildren().length === 0) {
			return null;
		}
		const uriStringNode = uriLiteralNode.getChild(0);
		return this.uriStringNodeToDocumentLink(document, uriStringNode);
	}
	
	private uriStringNodeToDocumentLink(document: TextDocument, uriStringNode: nodes.Node | null): DocumentLink | null {
		if (!uriStringNode) {
			return null;
		}
	
		let rawUri = uriStringNode.getText();
		const range = this.getRange(uriStringNode, document);
	
		if (range.start.line === range.end.line && range.start.character === range.end.character) {
			return null;
		}
		let target = this.fileProvider.resolveReference(rawUri, document.uri);
		return {
			range,
			target
		};
	}
	
	private getRange(node: nodes.Node, document: TextDocument): Range {
		return Range.create(document.positionAt(node.offset), document.positionAt(node.end));
	}
	
	private findReferencesInternal(files:MacroFileType[], node:nodes.Node, symbolContext:Symbols, implType:nodes.ReferenceType | undefined = undefined):Location[] {
		let locations:Location[] = [];

		for (const type of files) {
			const macroFile = <nodes.MacroFile>type.macrofile;

			// finding condition: name and reference type
			const symbol = symbolContext.findSymbolFromNode(node); 	
			if (!symbol) {
				continue;
			}

			const highlights: DocumentHighlight[] = [];
			macroFile.accept(candidate => {	
				if (symbolContext.matchesSymbol(candidate, symbol)) {
					let s = <nodes.Symbol>candidate;
					if (s && s.referenceTypes && implType) {
						if (s.referenceTypes.indexOf(implType) > -1) {
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
					return false;
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

	private findIncludeUri(document: TextDocument, node: nodes.Node, macroFile: nodes.Node): string | null {
		const includes = this.getIncludeUris(macroFile);
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

	private getIncludeUris(macroFile: nodes.MacroFile) : string[] {
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
