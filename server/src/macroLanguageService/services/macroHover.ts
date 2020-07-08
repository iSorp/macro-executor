/*---------------------------------------------------------------------------------------------
* Copyright (c) 2020 Simon Waelti
* Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
'use strict';

import * as nodes from '../parser/macroNodes';
import { MacroNavigation } from './macroNavigation';
import { getComment } from '../parser/macroScanner';
import { TextDocument, Range, Position, Location, Hover, MarkedString, MarkupContent, 
	MacroFileProvider, functionSignatures, GCodeDescription as CodeDescription, LanguageSettings 
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
			//const node = nodes.getNodeAtOffset(macroFile, offset);
			const nodepath = nodes.getNodePath(macroFile, offset);
		
			let declaration = null;
			const location = navigation.findDefinition(document, position, macroFile);
			if (location){
				declaration = this.fileProvider?.get(location.uri);
			}

			for (let i = 0; i < nodepath.length; i++) {
				const node = nodepath[i];
	
				if (location && declaration) {
					let type = '';
					if (node.type === nodes.NodeType.Symbol) {
						if (node.parent?.type === nodes.NodeType.Label) {
							type = 'label';
						} 
						else if (node.parent?.type === nodes.NodeType.Variable) {
							type = 'symbol';
						} 
						else if (node.parent?.type === nodes.NodeType.Function) {
							type = 'function';
						} 
						const text = this.getMarkedStringForDeclaration(type, <nodes.Node>declaration!.macrofile, declaration!.document, location);
						const custom = this.getCustomKeywordDescription(node);
						hover = this.buildHover(node, text, custom);
					}	
				}
				else if (node.type === nodes.NodeType.Ffunc) {
					const text = this.getMarkedStringForFunction(<nodes.Ffunc>node);
					const custom = this.getCustomKeywordDescription(node);
					hover = this.buildHover(node, text, custom);
				}
				else if (node.type === nodes.NodeType.Code) {
					const custom = this.getCustomKeywordDescription(node);
					const desc = CodeDescription[node.getText()];
					const description = custom ? '\n' + custom : desc ? '\n' + desc : '';
					let text:MarkupContent = {
						kind: MarkupKind.Markdown,
						value: '#### ' + node.getText() + description
					};
					hover = {
						contents: text,
						range: this.getRange(node),
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

	private buildHover(node:nodes.Node, ...args: string[]) : Hover {
		let value  = '';
		for (const arg of args){
			value += value ? '\n' + arg : arg;
		}
		return {
			contents:[
				{
					language: 'macro',
					value: value
				},
			],
			range: this.getRange(node)
		};
	}

	private getCustomKeywordDescription(node:nodes.Node) :string {
		const customKey = this.settings.keywords.find(a => RegExp('^'+a.symbol+'$').test(node.getText()));
		if (customKey?.description){
			return customKey.description;
		}
		return '';
	}

	private getMarkedStringForDeclaration(type: string, macroFile: nodes.Node, document:TextDocument, location:Location) : string {
		const node = <nodes.AbstractDeclaration>nodes.getNodeAtOffset(macroFile, document.offsetAt(location.range.start));		
		const comment = getComment(document.offsetAt(location.range.start), document.getText()).trim();
		const name = node.getName();
		const address = node.getValue()?.getText();
		const valueType = node.valueType?.toString();
		
		let text = '';
		text += `(${type}:${valueType}) ` + `@${name} `+` ${address}`;

		if (comment){
			text += '\n\n' + `${comment}`;
		}
		return text;
	}

	private getMarkedStringForFunction(node: nodes.Ffunc) : string {
		const func:nodes.Ffunc = <nodes.Ffunc>node;
		const ident = func.getIdentifier()?.getText().toLocaleLowerCase();
		if (!ident){
			return '';
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
		return  text;
	}

	private getRange(node: nodes.Node) {
		return Range.create(this.textDocument.positionAt(node.offset), this.textDocument.positionAt(node.end));
	}	

}
