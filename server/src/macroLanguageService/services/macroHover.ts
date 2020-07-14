/*---------------------------------------------------------------------------------------------
* Copyright (c) 2020 Simon Waelti
* Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
'use strict';

import * as nodes from '../parser/macroNodes';
import { MacroNavigation } from './macroNavigation';
import { getComment } from '../parser/macroScanner';
import { TextDocument, Range, Position, Location, Hover, MarkedString, MarkupContent, 
	MacroFileProvider, functionSignatures, GCodeDescription as CodeDescription, LanguageSettings, MacroFileType 
} from '../macroLanguageTypes';
import { MarkupKind } from 'vscode-languageserver';

export class MacroHover {

	private settings: LanguageSettings;
	private textDocument: TextDocument;

	constructor(private fileProvider: MacroFileProvider) { }

	public doHover(document: TextDocument, position: Position, macroFile: nodes.MacroFile, settings: LanguageSettings): Hover | null {		
		this.textDocument = document;
		this.settings = settings;

		try {
			let navigation = new MacroNavigation(this.fileProvider);
			let hover: Hover | null = null;

			const offset = document.offsetAt(position);
			const nodepath = nodes.getNodePath(macroFile, offset);
		
			let declaraion:MacroFileType = null;
			const location = navigation.findDefinition(document, position, macroFile);
			if (location) {
				declaraion = this.fileProvider?.get(location.uri);
			}

			for (let i = 0; i < nodepath.length; i++) {
				const node = nodepath[i];
	
				if (location && declaraion) {
					let type = '';
					if (node.type === nodes.NodeType.VariableDef) {
						const vardef = <nodes.VariableDeclaration>node;
						const custom = this.getCustomKeywordDescription(vardef.getName(), nodes.NodeType.Variable);
						hover =  {
							contents: {
								kind:MarkupKind.Markdown,
								value: [`${custom}`].join('\n')
							},
							range: this.getRange(vardef.getSymbol())
						};
					}
					else if (node.type === nodes.NodeType.labelDef) {
						const labeldef = <nodes.LabelDeclaration>node;
						const custom = this.getCustomKeywordDescription(labeldef.getName(), nodes.NodeType.Label);
						hover =  {
							contents: {
								kind:MarkupKind.Markdown,
								value: [`${custom}`].join('\n')
							},
							range: this.getRange(labeldef.getSymbol())
						};
					}
					else if (node.type === nodes.NodeType.Variable) {
						type = 'symbol';
						let text:string[] = [];
						const detail = this.getMarkedStringForDeclaration(type, <nodes.Node>declaraion!.macrofile, declaraion!.document, location);
						const custom = this.getCustomKeywordDescription((<nodes.Variable>node).getName(), nodes.NodeType.Variable);
						const comment = getComment(declaraion.document.offsetAt(location.range.start), declaraion.document.getText()).trim();
						text.push(detail);
						if (custom || comment){
							text.push('','***','');	
						}
						if (comment) {
							text.push(comment);	
						}
						if (custom) {
							text.push(custom);	
						}

						hover =  {
							contents: {
								kind:MarkupKind.Markdown,
								value: text.join('\n')
							},
							range: this.getRange(node)
						};
					}
					else if (node.type === nodes.NodeType.Label) {
						type = 'label';
						let text:string[] = [];
						const detail = this.getMarkedStringForDeclaration(type, <nodes.Node>declaraion!.macrofile, declaraion!.document, location);
						const custom = this.getCustomKeywordDescription((<nodes.Label>node).getName(), nodes.NodeType.Label);
						const comment = getComment(document.offsetAt(location.range.start), document.getText()).trim();
						text.push(detail);
						if (custom || comment){
							text.push('','***','');	
						}
						if (comment) {
							text.push(comment);	
						}
						if (custom) {
							text.push(custom);	
						}

						hover =  {
							contents: {
								kind:MarkupKind.Markdown,
								value: text.join('\n')
							},
							range: this.getRange(node)
						};
					}
					else if (node.type === nodes.NodeType.Code) {
						let text:string[] = [];
						const custom = this.getCustomKeywordDescription(node.getText(), nodes.NodeType.Code);
						const desc = CodeDescription[node.getText()];
						const type = (<nodes.NcCode>node).codeType + '-code';
						text.push(['```macro',`(${type}) ` + `${node.getText()}`,'```'].join('\n'));

						if (custom || desc){
							text.push('','***','');	
						}
						if (custom) {
							text.push(custom);	
						}
						else if (desc) {
							text.push(desc);	
						}

						hover =  {
							contents: {
								kind:MarkupKind.Markdown,
								value: text.join('\n')
							},
							range: this.getRange(node)
						};
					}
				}
				else if (node.type === nodes.NodeType.Ffunc) {
					const text = this.getMarkedStringForFunction(<nodes.Ffunc>node);
					hover =  {
						contents: {
							kind:MarkupKind.Markdown,
							value: [`${text}`].join('\n')
						},
						range: this.getRange(node)
					};
				}
			}
			return hover;
		} 
		finally {
			this.textDocument = null!;
			this.settings = null!;
		}
	}

	private getCustomKeywordDescription(text:string, type:nodes.NodeType) :string {
		const customKey = this.settings.keywords.find(a => a.symbol === text && (!a.nodeType || nodes.NodeType[a.nodeType] === type));
		if (customKey && customKey.description) {
			if (customKey.description instanceof Array) {
				return customKey.description.join('\n\n');
			}
			return customKey.description;
		}
		return '';
	}

	private getMarkedStringForDeclaration(type: string, macroFile: nodes.Node, document:TextDocument, location:Location) : string {
		let text:string[] = [];
		const node = nodes.getNodeAtOffset(macroFile, document.offsetAt(location.range.start));
		if (node instanceof nodes.AbstractDeclaration){
			const name = node.getName();
			const address = node.getValue()?.getText();
			const valueType = node.valueType?.toString();
		
			text.push('```macro',`(${type}:${valueType}) ` + `@${name} `+` ${address}`, '```');
		}
		return text.join('\n');
	}

	private getMarkedStringForFunction(node: nodes.Ffunc) : string {
		const func:nodes.Ffunc = <nodes.Ffunc>node;
		const ident = func.getIdentifier()?.getText().toLocaleLowerCase();
		if (!ident){
			return '';
		}
		const signatureIndex = func.getData('signature');
		const signature = functionSignatures[ident][signatureIndex];
		let deliminator = '';
		let first = true;
		let text:string[] = [];
		let ftext:string[] = [];
		text.push('```macro');
		ftext.push('(function) ' + ident);

		if (signature) {
			for (const element of signature.param) {

				if (element._bracket){
					deliminator = '';
					ftext.push(element._bracket);
				}
				else if (element._escape){
					deliminator = '';
					ftext.push(element._escape);
				}

				if (element._param) {

					// Space if the first part is a parameter 
					// e.g setvnvar[name] -> setvn var[name]
					if (first) {
						ftext.push(' ');
					}

					for (const param of element._param) {
						if (signature.delimiter) {
							ftext.push(deliminator);
						}
						ftext.push(Object.keys(param)[0]);
						deliminator = signature.delimiter + ' ';
					}
				}
				first = false;
			}
		}
		text.push(ftext.join(''));
		text.push('```');
		text.push('','***','');
		text.push(signature.description);
		return text.join('\n');
	}

	private getRange(node: nodes.Node) {
		return Range.create(this.textDocument.positionAt(node.offset), this.textDocument.positionAt(node.end));
	}	

}
