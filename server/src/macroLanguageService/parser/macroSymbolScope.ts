/*---------------------------------------------------------------------------------------------
* Copyright (c) 2020 Simon Waelti
* Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
'use strict';

import * as nodes from './macroNodes';

export class Scope {

	public parent: Scope | null;
	public children: Scope[];

	public offset: number;
	public length: number;

	private symbols: Symbol[];

	constructor(offset: number, length: number) {
		this.offset = offset;
		this.length = length;
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
			if (symbol.name === name && symbol.type === type) {
				return symbol;
			}
		}
		return null;
	}

	public getSymbols(): Symbol[] {
		return this.symbols;
	}
}

export class GlobalScope extends Scope {

	constructor() {
		super(0, Number.MAX_VALUE);
	}
}

export class Symbol {

	public name: string;
	public value: string | undefined;
	public type: nodes.ReferenceType;
	public node: nodes.Node;

	constructor(name: string, value: string | undefined, node: nodes.Node, type: nodes.ReferenceType) {
		this.name = name;
		this.value = value;
		this.node = node;
		this.type = type;
	}
}

export class ScopeBuilder implements nodes.IVisitor {

	public scope: Scope;

	constructor(scope: Scope) {
		this.scope = scope;
	}

	private addSymbol(node: nodes.Node, name: string, value: string | undefined, type: nodes.ReferenceType): void {
		if (node.offset !== -1) {
			const current = this.scope;
			if (current) {
				current.addSymbol(new Symbol(name, value, node, type));
			}
		}
	}

	public visitNode(node: nodes.Node): boolean {
		switch (node.type) {
			case nodes.NodeType.VariableDef:
				this.addSymbol(node, (<nodes.VariableDeclaration>node).getName(), void 0, nodes.ReferenceType.Variable);
				return true;
			case nodes.NodeType.labelDef:
				this.addSymbol(node, (<nodes.LabelDeclaration>node).getName(), void 0, nodes.ReferenceType.Label);
				return true;
		}
		return true;
	}
}

export class Symbols {

	private global: Scope;

	constructor(file: nodes.MacroFile) {
		this.global = new GlobalScope();
		file.acceptVisitor(new ScopeBuilder(this.global));
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
		if (!referenceTypes || referenceTypes.indexOf(symbol.type) === -1) {
			return false;
		}

		const nodeSymbol = this.internalFindSymbol(node, referenceTypes);
		return nodeSymbol === symbol;
	}
}