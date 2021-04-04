/*---------------------------------------------------------------------------------------------
* Copyright (c) 2020 Simon Waelti
* Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
'use strict';

import * as nodes from './macroNodes';

export class Scope {

	public parent: Scope | null;
	public children: Scope[];
	public uri?:string;

	private symbols: Symbol[];

	constructor() {
		this.symbols = [];
		this.parent = null;
		this.children = [];
	}

	public addChild(scope: Scope): void {
		this.children.push(scope);
		scope.setParent(this);
	}

	public setParent(scope: Scope): void {
		this.parent = scope;
	}

	public addSymbol(symbol: Symbol): void {
		this.symbols.push(symbol);
	}

	public getSymbol(name: string, type: nodes.ReferenceType): Symbol | null {
		for (let index = 0; index < this.symbols.length; index++) {
			const symbol = this.symbols[index];
			if (symbol.name === name && symbol.refType === type) {
				return symbol;
			}
		}
		return null;
	}

	public getSymbols(): Symbol[] {
		return this.symbols;
	}
}

export interface SymbolContext {
	symbols: Symbol[],
	uri?: string
}

export class Symbol {

	public name: string;
	public refType: nodes.ReferenceType;
	public valueType: nodes.NodeType;
	public node: nodes.Node;

	constructor(name: string, node: nodes.Node, refType: nodes.ReferenceType, valueType:nodes.NodeType = undefined) {
		this.name = name;
		this.node = node;
		this.refType = refType;
		this.valueType = valueType;
	}
}

export class ScopeBuilder implements nodes.IVisitor {

	public scope: Scope;

	constructor(scope: Scope) {
		this.scope = scope;
	}

	private addSymbol(node: nodes.Node, name: string, refType: nodes.ReferenceType, valueType: nodes.NodeType = undefined): void {
		if (node.offset !== -1) {
			const current = this.scope;
			if (current) {
				if (!current.getSymbol(name, refType)){
					current.addSymbol(new Symbol(name, node, refType, valueType));
				}
				
			}
		}
	}

	public visitNode(node: nodes.Node): boolean {

		switch (node.type) {
			case nodes.NodeType.SymbolDef:
				const symbol = (<nodes.SymbolDefinition>node);
				this.addSymbol(node, symbol.getName(), nodes.ReferenceType.Symbol, symbol.getValue().type);
				return false;
			case nodes.NodeType.LabelDef:
				const label = (<nodes.LabelDefinition>node);
				this.addSymbol(node, label.getName(), nodes.ReferenceType.Label, label.getValue().type);
				return false;
			case nodes.NodeType.SequenceNumber:
				const sequence = (<nodes.SequenceNumber>node);
				this.addSymbol(node, sequence.getNumber()?.getText(), nodes.ReferenceType.Sequence);
				return true;
			case nodes.NodeType.Code:
				this.addSymbol(node, node.getText(), nodes.ReferenceType.Code);
				return true;
			case nodes.NodeType.Variable:
				const variable = (<nodes.Variable>node);
				this.addSymbol(node, variable.getText(), nodes.ReferenceType.Variable);	
				return true;		
			case nodes.NodeType.Address:
				this.addSymbol(node, node.getText(), nodes.ReferenceType.Address);
				return true;
		}
		return true;
	}
}

export class Symbols {

	private global: Scope;
	
	constructor(file: nodes.MacroFile, uri?:string) {
		this.global = new Scope();
		this.global.uri = uri;
		file.acceptVisitor(new ScopeBuilder(this.global));
	}

	public getScope() : Scope {
		return this.global;
	}

	public findSymbols(referenceType: nodes.ReferenceType, valueTypes:nodes.NodeType[] | undefined = undefined): SymbolContext[] {
		let scope = this.global;
		const result: SymbolContext[] = [];
		const names: { [name: string]: boolean } = {};	
		let index = 0;
		while (scope){
			const symbols = scope.getSymbols();
			const symbolFound:Symbol[] = [];
			for (let i = 0; i < symbols.length; i++) {
				const symbol = symbols[i];
				if (valueTypes) {
					if (symbol.refType === referenceType && valueTypes.indexOf(symbol.valueType) !== -1 && !names[symbol.name]) {
						symbolFound.push(symbol);
						names[symbol.name] = true;
					}
				}
				else {

					if (symbol.refType === referenceType && !names[symbol.name]) {
						symbolFound.push(symbol);
						names[symbol.name] = true;
					}
				}
			}
			result.push({
				symbols: symbolFound,
				uri:scope.uri
			});
			scope = this.global.children[index++];
		}

		return result;
	}

	private internalFindSymbol(node: nodes.Reference): Symbol | null {
		if (!node) {
			return null;
		}

		const name = node.getText();
		let scope = this.global; // only global scope available

		if (scope) {
			for (let value in nodes.ReferenceType) {
				let num = Number(value);
				if (isNaN(num)) {
					continue;
				}

				if (node.hasReferenceType(num)) {
					const symbol = scope.getSymbol(name, num);
					if (symbol) {
						return symbol;
					}
				}
			}
		}
		return null;
	}

	private evaluateReferenceTypes(node: nodes.Node): nodes.ReferenceType | null {
		
		const referenceTypes = (<nodes.Reference>node).referenceTypes;
		if (referenceTypes) {
			return referenceTypes;
		}
		
		return null;
	}

	public findSymbolFromNode(node: nodes.Node): Symbol | null {
		if (!node) {
			return null;
		}
		if (this.evaluateReferenceTypes(node)) {
			return this.internalFindSymbol(<nodes.Reference>node);
		}
		return null;
	}

	public matchesSymbol(node: nodes.Node, symbol: Symbol): boolean {
		if (!node) {
			return false;
		}

		if (node.getText() !== symbol.name) {
			return false;
		}

		if (node instanceof nodes.Reference) {
			if (!(<nodes.Reference>node).hasReferenceType(symbol.refType)) {
				return false;
			}
			const nodeSymbol = this.internalFindSymbol(<nodes.Reference>node);
			return nodeSymbol === symbol;
		}
		return false;
	}
}