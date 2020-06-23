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
	public valueType: nodes.ValueType = nodes.ValueType.Undefinded;
	public node: nodes.Node;

	constructor(name: string, node: nodes.Node, refType: nodes.ReferenceType, valueType:nodes.ValueType = nodes.ValueType.Undefinded) {
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

	private addSymbol(node: nodes.Node, name: string, refType: nodes.ReferenceType, valueType: nodes.ValueType | undefined = undefined): void {
		if (node.offset !== -1) {
			const current = this.scope;
			if (current) {
				current.addSymbol(new Symbol(name, node, refType, valueType));
			}
		}
	}

	public visitNode(node: nodes.Node): boolean {
		switch (node.type) {
			case nodes.NodeType.VariableDef:
				const variable = (<nodes.VariableDeclaration>node);
				this.addSymbol(node, variable.getName(), nodes.ReferenceType.Variable, variable.valueType);
				return true;
			case nodes.NodeType.labelDef:
				const label = (<nodes.VariableDeclaration>node);
				this.addSymbol(node, label.getName(), nodes.ReferenceType.Label, label.valueType);
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

	public findSymbols(referenceType: nodes.ReferenceType, valueTypes:nodes.ValueType[] | undefined = undefined): SymbolContext[] {
		let scope = this.global;
		const result: SymbolContext[] = [];
		const names: { [name: string]: boolean } = {};	
		let index = 0;
		while (scope){
			const symbols = scope.getSymbols();
			const symbolFound:Symbol[] = [];
			for (let i = 0; i < symbols.length; i++) {
				const symbol = symbols[i];
				if (valueTypes){
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

	private internalFindSymbol(node: nodes.Node, referenceTypes: nodes.ReferenceType[]): Symbol | null {
		let scopeNode: nodes.Node | undefined = node;

		if (!scopeNode) {
			return null;
		}

		const name = node.getText();
		let scope = this.global; // only global scope available

		if (scope) {
			for (let index = 0; index < referenceTypes.length; index++) {
				const type = referenceTypes[index];
				const symbol = scope.getSymbol(name, type);
				if (symbol) {
					return symbol;
				}
			}
		}
		return null;
	}

	private evaluateReferenceTypes(node: nodes.Node): nodes.ReferenceType[] | null {
		if (node instanceof nodes.Symbol) {
			const referenceTypes = (<nodes.Symbol>node).referenceTypes;
			if (referenceTypes) {
				return referenceTypes;
			}
		}
		return null;
	}

	public findSymbolFromNode(node: nodes.Node): Symbol | null {
		if (!node) {
			return null;
		}

		const referenceTypes = this.evaluateReferenceTypes(node);
		if (referenceTypes) {
			return this.internalFindSymbol(node, referenceTypes);
		}
		return null;
	}

	public matchesSymbol(node: nodes.Node, symbol: Symbol): boolean {
		if (!node) {
			return false;
		}

		if (!node.matches(symbol.name)) {
			return false;
		}

		const referenceTypes = this.evaluateReferenceTypes(node);
		if (!referenceTypes || referenceTypes.indexOf(symbol.refType) === -1) {
			return false;
		}

		const nodeSymbol = this.internalFindSymbol(node, referenceTypes);
		return nodeSymbol === symbol;
	}
}