/*---------------------------------------------------------------------------------------------
* Copyright (c) 2020 Simon Waelti
* Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
'use strict';

import * as nodes from '../parser/macroNodes';
import { MacroNavigation } from './macroNavigation';
import { MultiLineStream } from '../parser/macroScanner';
import { TextDocument, Range, Position, Location, Hover, MarkedString, MarkupContent, 
	MacroFileProvider } from '../MacroLanguageTypes';

export class MacroHover {

	constructor(private fileProvider?: MacroFileProvider | undefined) { }

	public doHover(document: TextDocument, position: Position, macroFile: nodes.MacroFile): Hover | null {
		function getRange(node: nodes.Node) {
			return Range.create(document.positionAt(node.offset), document.positionAt(node.end));
		}	
		
		let navigation = new MacroNavigation(this.fileProvider);
		let hover: Hover | null = null;

		const offset = document.offsetAt(position);
		const node = nodes.getNodeAtOffset(macroFile, offset);

		let declaration = null;
		const location = navigation.findDefinition(document, position, macroFile);
		if (location){
			declaration = this.fileProvider?.get(location.uri);
		}

		if (node) {
			if (location && declaration){
				if (node.type === nodes.NodeType.Symbol) {
					if (node.parent?.type === nodes.NodeType.label) {
						let text = this.getMarkedStringForDeclaration('label', <nodes.Node>declaration!.macrofile, declaration!.document, location);
						hover = {
							contents: text,
							range: getRange(node)
						};
					} 
					else if (node.parent?.type === nodes.NodeType.Variable) {
						let text = this.getMarkedStringForDeclaration('variable', <nodes.Node>declaration!.macrofile, declaration!.document, location);
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
		}
		return hover;
	}


	/**
	 * Gets the comment of a declaration node
	 * @param document 
	 * @param location 
	 */
	private getComment(document:TextDocument, location:Location) {
		let stream = new MultiLineStream(document.getText());
		stream.goBackTo(document.offsetAt(location.range.start));
		stream.advanceWhileChar(a => a !== '/'.charCodeAt(0) && a !== '\n'.charCodeAt(0));
		let start = stream.pos();
		stream.advance(1);
		if (stream.peekChar() === '*'.charCodeAt(0)){
			stream.advanceWhileChar(a => a !== '\n'.charCodeAt(0));
		}
		let end = stream.pos();
		return document.getText().substr(start, end-start); 
	}	

	private getMarkedStringForDeclaration(type: string, macroFile: nodes.Node, document:TextDocument, location:Location) : MarkedString {
		let node = <nodes.AbstractDeclaration>nodes.getNodeAtOffset(macroFile, document.offsetAt(location.range.start));		
		let comment = this.getComment(document, location).trim();
		let name = node.getName();
		let address = node.getValue()?.getText();
		let valueType = node.valueType?.toString();

		let text = '';
		if (comment){
			text += `${comment}`+'\n';
		}
		text += `(${type}:${valueType}) ` + `@${name} `+` ${address}`;

		return {
			language: 'macro',
			value: text
		};
	}

}
