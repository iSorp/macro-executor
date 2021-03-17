/*---------------------------------------------------------------------------------------------
* Copyright (c) 2020 Simon Waelti
* Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
'use strict';

import {
	DocumentHighlight, DocumentHighlightKind, DocumentLink, Location,
	Position, Range, SymbolInformation, SymbolKind, TextEdit, 
	MacroCodeLensCommand, TextDocument, MacroFileProvider, 
	WorkspaceEdit, MacroCodeLensType, MacroFileType
} from '../macroLanguageTypes';
import * as nodes from '../parser/macroNodes';
import { Symbols } from '../parser/macroSymbolScope';
import { CodeLens } from 'vscode-languageserver';
import { type } from 'os';


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
		let node = nodes.getNodeAtOffset(macroFile, offset);
		node = node.findAParent(nodes.NodeType.Symbol, nodes.NodeType.Label) ?? node;

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
		
			return {
				uri: type.document.uri,
				range: this.getRange(symbol.node, type.document)
			};
		}
		return null;
	}
	
	public findReferences(document: TextDocument, position: Position, macroFile: nodes.MacroFile, implType:nodes.ReferenceType | undefined = undefined): Location[] {

		const offset = document.offsetAt(position);
		let node = nodes.getNodeAtOffset(macroFile, offset);
		node = node.findAParent(nodes.NodeType.Symbol, nodes.NodeType.Label) ?? node.findAParent(nodes.NodeType.Variable, nodes.NodeType.Code) ?? node;
	
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
			case nodes.NodeType.Variable:
			case nodes.NodeType.Code:
				files = this.fileProvider.getAll({glob:ALL_FILES});
				break;
			case nodes.NodeType.Numeric:
				if (node.getParent()?.type === nodes.NodeType.Goto || node.getParent()?.type === nodes.NodeType.SequenceNumber) {
					files.push(origin);	
					break;
				}
				return [];
			case nodes.NodeType.Label:
			case nodes.NodeType.Symbol:
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
				break;
			default:
				return [];
		}
		return this.findReferencesInternal(files, node, symbolContext, implType);	
	}

	public findImplementations(document: TextDocument, position: Position, macroFile: nodes.MacroFile): Location[] {
		let node = nodes.getNodeAtOffset(macroFile, document.offsetAt(position));
		node = node.findAParent(nodes.NodeType.Symbol, nodes.NodeType.Label) ?? node;
		let referenceType:nodes.ReferenceType = undefined;

		switch (node.type) {
			case nodes.NodeType.Symbol:
				referenceType = nodes.ReferenceType.Program;
				break;
			case nodes.NodeType.Label:
				referenceType = nodes.ReferenceType.JumpLabel;
				break;
			case nodes.NodeType.Numeric:
				if (node.getParent()?.type === nodes.NodeType.Goto) {
					referenceType = nodes.ReferenceType.JumpLabel;
					break;
				}
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

			if (node.type === nodes.NodeType.Symbol) {
				const symbol = <nodes.Symbol>node;
				if (node.findAParent(nodes.NodeType.Statement, nodes.NodeType.Code, nodes.NodeType.Parameter) || symbol.nType === nodes.NodeType.Statement) {

					switch (symbol.nType) {
						case nodes.NodeType.Address:
							if (symbol.attrib === nodes.ValueAttribute.Parameter) {
								entry.kind = SymbolKind.Property;
							}
							else {
								entry.kind = SymbolKind.Interface;
							}
							break;
						case nodes.NodeType.Parameter:
							entry.kind = SymbolKind.Property;
							break;
						case nodes.NodeType.Variable:
							entry.kind = SymbolKind.Variable;
							break;
						case nodes.NodeType.Numeric:
							if (symbol.attrib === nodes.ValueAttribute.Constant) {
								entry.kind = SymbolKind.Constant;
							}
							else {
								entry.kind = SymbolKind.Number;
							}
							break;
						case nodes.NodeType.SequenceNumber:
							entry.kind = SymbolKind.Field;
							break;
						case nodes.NodeType.Statement:
							if (node.getChildren().length > 1) {
								result.push({
									name: symbol.getNodeText(),
									kind: SymbolKind.Field,
									location: Location.create(document.uri, this.getRange(node, document))
								});
							}

							if (symbol.attrib === nodes.ValueAttribute.Parameter) {
								entry.kind = SymbolKind.Property;
							}
							else {
								entry.kind = SymbolKind.Event;
							}
							break;
						case nodes.NodeType.Code:
							entry.kind = SymbolKind.Event;
							break;
						default:
							entry.kind = SymbolKind.Variable;
							break;
					}

					entry.name = symbol.getText();
					entry.location = Location.create(document.uri, Range.create(document.positionAt(node.offset), document.positionAt(node.offset + entry.name.length)));
					result.push(entry);

					return true;
				}		
			}
			else if (node.type === nodes.NodeType.Label) {
				const label = <nodes.Label>node;
				if (node.findAParent(nodes.NodeType.Program, nodes.NodeType.Goto)) {
					if (label.nType === nodes.NodeType.Numeric) {
						entry.name = label.getText();
						entry.kind = SymbolKind.Constant;
					} 
				}
			} 
			else if (!node.symbolLink) {
				if (node.type === nodes.NodeType.SymbolDef) {
					entry.name = (<nodes.SymbolDefinition>node).getName();
					entry.kind = SymbolKind.Variable;
				} 
				else if (node.type === nodes.NodeType.LabelDef) {
					entry.name = (<nodes.LabelDefinition>node).getName();
					entry.kind = SymbolKind.Constant;
				} 
				else if (node.type === nodes.NodeType.Program) {
					const prog = (<nodes.Program>node);
					entry.kind = SymbolKind.Function;
					if (prog.identifier?.symbolLink) {
						entry.name = prog.identifier.symbolLink.symNode.getText() + ' (O' + prog.getName() + ')';			
					}
					else {
						entry.name = `O${prog.getName()}`;
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
				}
				else if (node.type === nodes.NodeType.Code) {
					entry.name = (<nodes.NcCode>node).getText();
					entry.kind = SymbolKind.Event;
				}
				else if (node.type === nodes.NodeType.Parameter) {
					entry.name = (<nodes.Parameter>node).getText();
					entry.kind = SymbolKind.Property;
				} 
				else if (node.type === nodes.NodeType.Goto) {
					entry.name = node.getText();
					entry.kind = SymbolKind.Event;
				}
			}

			if (entry.name) {
				entry.location = Location.create(document.uri, this.getRange(node, document));
				result.push(entry);
			}

			return true;
		});
		return result;
	}

	public findCodeLenses(document: TextDocument, macroFile: nodes.MacroFile): CodeLens[] {

		const codeLenses: CodeLens[] = [];
		const definitions:FunctionMap = new FunctionMap();

		// local search
		if (macroFile.type === nodes.NodeType.MacroFile) {
			macroFile.accept(candidate => {
				if (candidate.type === nodes.NodeType.SymbolDef || candidate.type === nodes.NodeType.LabelDef) {
					return false;
				}
				else if (candidate.type === nodes.NodeType.Symbol || candidate.type === nodes.NodeType.Label) {
					const node = (<nodes.Symbol>candidate);
					if (node) {
						/*const t:MacroCodeLensType = {
							title: node.symbolLink?.value,
						};
						codeLenses.push(
							{
								range: getRange(node, document), 
								data:t
							});*/

						definitions.add(node.getText(), {
							uri:document.uri,  
							range: this.getRange(node, document)
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
					if (candidate.type === nodes.NodeType.SymbolDef || candidate.type === nodes.NodeType.LabelDef) {
						return false;
					}
					else if (candidate.type === nodes.NodeType.Symbol || candidate.type === nodes.NodeType.Label) {
						const node = (<nodes.Symbol>candidate);
						if (node) {
							definitions.add(node.getText(), {
								uri:type.document.uri,  
								range: this.getRange(node, type.document)
							});
						}
					}
					return true;
				});
			}
		}

		(<nodes.Node>macroFile).accept(candidate => {
			if (candidate.type === nodes.NodeType.SymbolDef || candidate.type === nodes.NodeType.LabelDef) {

				const node = (<nodes.AbstractDefinition>candidate).getIdentifier();
				if (node) {
					const value = definitions.get(node.getText()); 
					const count = value?.length;
					const c = count === undefined ? 0 : count;
					const t:MacroCodeLensType = {
						title: c + (c !== 1 ? ' references' : ' reference'),
						locations: value?value:[],
						type: MacroCodeLensCommand.References
					};
					codeLenses.push(
						{
							range: this.getRange(node, document), 
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
						if (s.hasReferenceType(implType)) {
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
