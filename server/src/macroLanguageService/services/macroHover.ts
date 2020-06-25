/*---------------------------------------------------------------------------------------------
* Copyright (c) 2020 Simon Waelti
* Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
'use strict';

import * as nodes from '../parser/macroNodes';
import { MacroNavigation } from './macroNavigation';
import { getComment } from '../parser/macroScanner';
import { TextDocument, Range, Position, Location, Hover, MarkedString, MarkupContent, 
	MacroFileProvider, functionSignatures } from '../macroLanguageTypes';

export class MacroHover {

	constructor(private fileProvider: MacroFileProvider) { }

	public doHover(document: TextDocument, position: Position, macroFile: nodes.MacroFile): Hover | null {
		function getRange(node: nodes.Node) {
			return Range.create(document.positionAt(node.offset), document.positionAt(node.end));
		}	

		let navigation = new MacroNavigation(this.fileProvider);
		let hover: Hover | null = null;

		const offset = document.offsetAt(position);
		//const node = nodes.getNodeAtOffset(macroFile, offset);
		const nodepath = nodes.getNodePath(macroFile, offset);
		
		let declaration = null;
		const location = navigation.findDefinition(document, position, macroFile);
		if (location){
			declaration = this.fileProvider?.get(location.uri);
		}

		for (let i = 0; i < nodepath.length; i++) {
			const node = nodepath[i];

			if (location && declaration){
				if (node.type === nodes.NodeType.Symbol) {
					if (node.parent?.type === nodes.NodeType.Label) {
						let text = this.getMarkedStringForDeclaration('label', <nodes.Node>declaration!.macrofile, declaration!.document, location);
						hover = {
							contents: text,
							range: getRange(node)
						};
					} 
					else if (node.parent?.type === nodes.NodeType.Variable) {
						let text = this.getMarkedStringForDeclaration('symbol', <nodes.Node>declaration!.macrofile, declaration!.document, location);
						hover = {
							contents: text,
							range: getRange(node)
						};
					} 
					else if (node.parent?.type === nodes.NodeType.Function) {
						let text = this.getMarkedStringForDeclaration('function', <nodes.Node>declaration!.macrofile, declaration!.document, location);
						hover = {
							contents: text,
							range: getRange(node)
						};
					} 
				}
			}
			else if (node.type === nodes.NodeType.SequenceNumber 
				|| node.type === nodes.NodeType.Statement) {
				hover = {
					contents: node.getText(),
					range: getRange(node)
				};
			}			
			else if (node.type === nodes.NodeType.Ffunc) {
				let text = this.getMarkedStringForFunction(<nodes.Ffunc>node);
				hover = {
					contents: text,
					range: getRange(node),

				};
			}
		}
		return hover;
	}

	private getMarkedStringForDeclaration(type: string, macroFile: nodes.Node, document:TextDocument, location:Location) : MarkedString {
		let node = <nodes.AbstractDeclaration>nodes.getNodeAtOffset(macroFile, document.offsetAt(location.range.start));		
		let comment = getComment(document.offsetAt(location.range.start), document.getText()).trim();
		let name = node.getName();
		let address = node.getValue()?.getText();
		let valueType = node.valueType?.toString();

		let text = '';
		text += `(${type}:${valueType}) ` + `@${name} `+` ${address}`;

		if (comment){
			text += '\n\n' + `${comment}`;
		}

		return {
			language: 'macro',
			value: text
		};
	}

	private getMarkedStringForFunction(node: nodes.Ffunc) : MarkedString {
		const func:nodes.Ffunc = <nodes.Ffunc>node;
		const ident = func.getIdentifier()?.getText().toLocaleLowerCase();
		if (!ident){
			return {
				language: 'macro',
				value: ''
			};
		}
		const signatureIndex = func.getData('signature');
		const signature = functionSignatures[ident][signatureIndex];
		let text = '(function) ' + ident;
		let deliminator = '';
		let first = true;
		if (signature) {
			for (const element of signature.param) {

				if (element._bracket){
					deliminator = '';
					text += element._bracket;
				}
				else if (element._escape){
					deliminator = '';
					text += element._escape;
				}

				if (element._param) {

					// Space if the first part is a parameter 
					// e.g setvnvar[name] -> setvn var[name]
					if (first) {
						text += ' ';
					}

					for (const param of element._param) {
						if (signature.delimiter) {
							text += deliminator;
						}
						const key = Object.keys(param)[0];
						text +=  key;
						deliminator = signature.delimiter + ' ';
					}
				}
				first = false;
			}
		}
		text += '\n\n' + signature.description;
		return {
			language: 'macro',
			value: text
		};
	}

}
