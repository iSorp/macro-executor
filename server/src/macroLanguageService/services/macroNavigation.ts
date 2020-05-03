/*---------------------------------------------------------------------------------------------
* Copyright (c) 2020 Simon Waelti
* Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
'use strict';

import {
	DocumentHighlight, DocumentHighlightKind, DocumentLink, Location,
	Position, Range, SymbolInformation, SymbolKind, TextEdit, 
	MacroCodeLensCommand, TextDocument, DocumentContext, MacroFileProvider, MacroFileType
} from '../macroLanguageTypes';
import * as nodes from '../parser/macroNodes';
import { Symbols, Symbol } from '../parser/macroSymbolScope';
import { CodeLens } from 'vscode-languageserver';


export class MacroNavigation {
	constructor(private fileProvider?: MacroFileProvider){}
	
	public findDefinition(document: TextDocument, position: Position, macroFile: nodes.Node): Location | null {
		let includes:string[] = [];

		if (this.fileProvider){
			includes = this.getIncludeUris(macroFile, this.fileProvider);
		}
		
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
		return this.findReferences(document, position, macroFile, nodes.ReferenceType.Function);
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
			else if (node.type === nodes.NodeType.label) {
				if (node.getParent()?.type === nodes.NodeType.Function){
					entry.name = (<nodes.Label>node).getName();
					entry.kind = SymbolKind.Constant;
				}
			} 
			else if (node.type === nodes.NodeType.Goto) {
				entry.name = node.getText();
				entry.kind = SymbolKind.Event;
			} 
			else if (node.type === nodes.NodeType.Variable) {
				let variable = <nodes.Variable>node;
				if (variable.declaration?.valueType === nodes.ValueType.MFunc){
					entry.name = variable.getName();
					entry.kind = SymbolKind.Event;
				}
			} 
			else if (node.type === nodes.NodeType.SequenceNumber) {
				entry.name = node.getText();
				entry.kind = SymbolKind.Field;
			} 
			else if (node.type === nodes.NodeType.Statement && node.getChildren().length > 1) {
				if (node.getParent()?.type !== nodes.NodeType.SequenceNumber){
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
		
			if (entry.name) {
				entry.location = Location.create(document.uri, this.getRange(locationNode, document));
				result.push(entry);
			}

			return true;
		});
		return result;
	}

	public findCodeLenses(document: TextDocument, macroFile: nodes.MacroFile): CodeLens[] {
		function getRange(node: nodes.Node) {
			return Range.create(document.positionAt(node.offset), document.positionAt(node.end));
		}	

		let codeLenses: CodeLens[] = [];
		let declarations:nodes.Node[] =  [];

		if (!this.fileProvider){
			return codeLenses;
		}

		// local search
		if (macroFile.type === nodes.NodeType.MacroFile) {
			macroFile.accept(candidate => {
				if (candidate.type === nodes.NodeType.Variable || candidate.type === nodes.NodeType.label) {
					declarations.push(candidate);
				}				
				return true;
			});
		}
		// global search
		{
			const types = this.fileProvider?.getAll();
			for (const type of types) {

				if (((<nodes.Node>type.macrofile).type === nodes.NodeType.DefFile)) {
					continue;
				}

				if ((<nodes.Node>type.macrofile).type === nodes.NodeType.MacroFile) {
					let includes = this.getIncludeUris(<nodes.Node>type.macrofile, this.fileProvider);
					if (includes.filter(uri => uri === document.uri).length <= 0) {
						continue;
					}
				}

				
				(<nodes.Node>type.macrofile).accept(candidate => {
					if (candidate.type === nodes.NodeType.Variable || candidate.type === nodes.NodeType.label) {
						declarations.push(candidate);
					}
					return true;
				});
			}
		}

		(<nodes.Node>macroFile).accept(candidate => {
			if (candidate.type === nodes.NodeType.VariableDef || candidate.type === nodes.NodeType.labelDef /*|| candidate.type === nodes.NodeType.Function*/) {

				let node:nodes.Node | undefined;
				/*if (candidate.type === nodes.NodeType.Function){
					node = (<nodes.Function>candidate).getIdentifier();
				}*/
				{
					node = (<nodes.AbstractDeclaration>candidate).getSymbol();
				}
				let count = declarations.filter(a => (<nodes.DeclarationType<nodes.AbstractDeclaration>>a).getSymbol()?.getText() === node?.getText());

				if (node) {
					let pos = document.positionAt(node.offset);
					codeLenses.push(
						{
							range: getRange(node), 
							data: {
								title: count.length + (count.length > 1 ? ' references found' : ' reference found'),
								uri:document.uri,
								line:pos.line,
								character:pos.character,
								type: MacroCodeLensCommand.References
							}
						});
					return false;
				}
			}
			return true;
		});

		return codeLenses;
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
						if (s.referenceTypes?.indexOf(implType) > 0) {
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
		let declarations:MacroFileType[] = [];

		if (this.fileProvider){
			declarations = this.fileProvider?.getAll();
		}
		
		for (const type of declarations) {

			// only accept the origin def file
			if (((<nodes.Node>type.macrofile).type === nodes.NodeType.DefFile && includeUri !== type.document.uri.toLocaleLowerCase())){
				continue;
			}

			// only accept a src file which includes the origin def file
			if (this.fileProvider && (<nodes.Node>type.macrofile).type === nodes.NodeType.MacroFile) {
				let includes = this.getIncludeUris(<nodes.Node>type.macrofile, this.fileProvider);
				if (includes.filter(uri => uri === includeUri).length <= 0){
					continue;
				}
			}

			// all symbols found in the origin def file
			const symbols = new Symbols(<nodes.Node>type.macrofile);
			
			// condition: name and reference type
			const symbol = symbols.findSymbolFromNode(node); 			
			const name = node.getText();
			
			// only accept the symbol of the origin symbol source file
			if (symbol && includeUri !== type.document.uri.toLocaleLowerCase()) {
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

	private findIncludeUri(document: TextDocument, node: nodes.Node, macroFile: nodes.Node): string | null {
		let includes:string[] = [];

		if (this.fileProvider){
			includes = this.getIncludeUris(macroFile, this.fileProvider);
		}
		
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

	private getIncludeUris(macroFile: nodes.MacroFile, fileProvider:MacroFileProvider) : string[] {
		let includeUris:string[] = [];
		macroFile.accept(candidate => {
			if (candidate.type === nodes.NodeType.Include) {
				const uriStringNode = candidate.getChild(0);
				if (uriStringNode) {
					const f = fileProvider.getLink(uriStringNode?.getText());
					if (f){
						includeUris.push(f);
					}
				}
				return false;
			}
			return true;
		});
		return includeUris;
	}

	private getHighlightKind(node: nodes.Node): DocumentHighlightKind {
		return DocumentHighlightKind.Read;
	}
}
