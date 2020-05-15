/*---------------------------------------------------------------------------------------------
* Copyright (c) 2020 Simon Waelti
* Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
'use strict';

import * as nodes from '../parser/macroNodes';

import { TextDocument, MacroFileProvider } from '../MacroLanguageTypes';
import { Rules, Rule } from './lintRules';

const _0 = '0'.charCodeAt(0);
const _9 = '9'.charCodeAt(0);
const _dot = '.'.charCodeAt(0);

const MAX_CONDITIONALS = 4

export class LintVisitor implements nodes.IVisitor {

	static entries(macrofile: nodes.Node, document: TextDocument, fileProvider: MacroFileProvider): nodes.IMarker[] {
		const visitor = new LintVisitor(macrofile, fileProvider);
		macrofile.acceptVisitor(visitor);
		return visitor.getEntries();
	}

	private declarations:Map<string,nodes.AbstractDeclaration> = new Map<string,nodes.AbstractDeclaration>()
	private sequenceNumbers:FunctionMap<nodes.Function> = new FunctionMap();
	private labelList:FunctionMap<nodes.Function> = new FunctionMap();
	private duplicateList: string[] = [];
	private imports: string[] = [];

	private rules: nodes.IMarker[] = [];
	private functionList = new Array<string>();

	private constructor(private macrofile: nodes.Node, private fileProvider: MacroFileProvider) { }

	public getEntries(filter: number = (nodes.Level.Warning | nodes.Level.Error)): nodes.IMarker[] {
		return this.rules.filter(entry => {
			return (entry.getLevel() & filter) !== 0;
		});
	}

	public addEntry(node: nodes.Node, rule: Rule, details?: string): void {
		const entry = new nodes.Marker(node, rule, rule.defaultValue, details);
		this.rules.push(entry);
	}

	public visitNode(node: nodes.Node): boolean {
		switch (node.type) {
			case nodes.NodeType.MacroFile:
				return this.visitGlobalScope(<nodes.MacroFile>node);
			case nodes.NodeType.Include:
				return this.visitIncludes(<nodes.Include>node);
			case nodes.NodeType.Symbol:
				return this.visitSymbols(<nodes.Symbol>node);
			case nodes.NodeType.Variable:
				return this.visitVariables(<nodes.Variable>node);
			case nodes.NodeType.label:
				return this.visitLabels(<nodes.Label>node);
			case nodes.NodeType.VariableDef:
				return this.visitDeclarations(<nodes.VariableDeclaration>node, true);
			case nodes.NodeType.labelDef:
				return this.visitDeclarations(<nodes.LabelDeclaration>node, true);
			case nodes.NodeType.Function:
				return this.visitFunction(<nodes.Function>node);
			case nodes.NodeType.Statement:
				return this.visitStatement(<nodes.NcStatement>node);
			/*case nodes.NodeType.Parameter:
				return this.visitParameter(<nodes.NcParameter>node);*/
			case nodes.NodeType.SequenceNumber:
				return this.visitSequenceNumber(<nodes.SequenceNumber>node);		
			case nodes.NodeType.Assignment:
				return this.visitAssignment(<nodes.Assignment>node);
			case nodes.NodeType.If:
				return this.visitIfStatement(<nodes.ConditionalStatement>node);	
			case nodes.NodeType.While:
				return this.visitWhileStatement(<nodes.ConditionalStatement>node);
		}
		return true;
	}

	private visitIncludes(node: nodes.Include) : boolean {
		let uri = node.getChild(0);
		if (!uri) {
			return false;
		}

		if (this.imports.indexOf(uri?.getText()) > -1){
			this.addEntry(node, Rules.DuplicateDeclarations);
		}
		else{
			this.imports.push(uri.getText());
			let declaration = this.fileProvider?.get(uri.getText());
			
			if (declaration) {
				(<nodes.Node>declaration?.macrofile).accept(candidate => {
					let found = false;
					if (candidate.type === nodes.NodeType.VariableDef || candidate.type === nodes.NodeType.labelDef) {
						const count = this.duplicateList.length;
						this.visitDeclarations(candidate, false);
						found = true;
					}
					return !found;
				});
			}
			else {
				this.addEntry(node, Rules.IncludeNotFound);
			}
		}
		return false;
	}

	private visitGlobalScope(node: nodes.Node) : boolean {
		for (const element of node.getChildren()) {
			if (element.type === nodes.NodeType.Symbol){
				this.addEntry(element, Rules.IllegalStatement);
			}
		}
		return true;
	}

	private visitFunction(node: nodes.Function): boolean {

		let ident = node.getIdentifier();
		let number:string | undefined;
		if (ident) {
			if (ident instanceof nodes.Variable){
				let nr = (<nodes.Variable>ident).declaration?.getValue()?.getText();
				if (nr){
					number = nr;
				}
			}
			else {
				number = ident?.getText();
			}
			if (number && this.functionList.indexOf(number) === -1) {
				this.functionList.push(number);
			}
			else{
				this.addEntry(ident, Rules.DuplicateFunction);
			}
		}
		return true;
	}	

	private visitSymbols(node: nodes.Symbol) : boolean {

		// Check references
		if (!this.declarations.has(node.getText())) {
			if (!this.isNumeric(node.getText())) {
				this.addEntry(node, Rules.UnknownSymbol);
			}
		}
		return true;
	}

	private visitVariables(node: nodes.Variable) : boolean {
		if (node.findAParent(nodes.NodeType.VariableDef)) {	
			this.addEntry(node, Rules.IllegalStatement);
		}

		if (this.duplicateList.indexOf(node.getName()) != -1) {
			this.addEntry(node, Rules.DuplicateDeclarations);
		}

		return true;
	}

	private visitLabels(node: nodes.Label) : boolean {
		if (node.getParent()?.type !== nodes.NodeType.Function){
			return true;
		}

		let value = node.declaration?.value?.getText();
		if (value){
			let func = <nodes.Function>node.findAParent(nodes.NodeType.Function);
			let a = this.labelList.get(func);
			let index = a?.indexOf(value);
			if (index !== undefined && index > -1){
				this.addEntry(node, Rules.DuplicateLabel);
			} 
			else {
				this.labelList.add(func, value);
				const seq = this.sequenceNumbers.get(func)?.indexOf(value);
				if (seq !== undefined && seq !== -1) {
					this.addEntry(node, Rules.DuplicateLabelSequence);
				}
			}
		}
		return true;
	}

	/**
	 * 
	 * @param node 
	 * @param local if true execute some checks only for the current file 
	 */
	private visitDeclarations(node: nodes.Node, local:boolean) : boolean {
		// scan local declarations
		let def = <nodes.AbstractDeclaration>node;
		let ident = def.getName();

		if (ident){
			if (this.declarations.has(ident)) {
				this.duplicateList.push(ident);
				if (local) {
					this.addEntry(def, Rules.DuplicateDeclarations);
				}
			}
			
			if (local){
				const value = def.getValue()?.getText();
				for (const element of this.declarations.values()){
					if ((def.valueType ===  nodes.ValueType.Address 
						|| def.valueType ===  nodes.ValueType.Nc 
						|| def.valueType ===  nodes.ValueType.Numeric) 
						&& (def.type ===  element.type &&  element.getValue()?.getText() === value)) {
						this.addEntry(def, Rules.DuplicateAddress);
					}
				}
			}
			
			if (node.type === nodes.NodeType.VariableDef) {
				this.declarations.set(ident, <nodes.VariableDeclaration>node);
			}
			else if (node.type === nodes.NodeType.labelDef) {
				this.declarations.set(ident, <nodes.LabelDeclaration>node);
			}
		}
		return true;
	}

	private visitStatement(node: nodes.NcStatement): boolean {
		for (const statement of node.getChildren()) {
			if (!statement.findAParent(nodes.NodeType.VariableDef)) {
				if (statement.type === nodes.NodeType.Parameter || statement.type === nodes.NodeType.Code) {
					if (statement.getText().length <= 1){
						this.addEntry(statement, Rules.IncopleteParameter);
					}
				}
			}
	
		}
		return true;
	}

	private visitSequenceNumber(node: nodes.SequenceNumber): boolean {

		const number = node.getNumber();
		if (number) {
			const n = number.getText().substr(1, number.getText().length);
			const func = <nodes.Function>node.findAParent(nodes.NodeType.Function);
			const nList = this.sequenceNumbers.get(func);
			const index = nList?.indexOf(n);
			if (index !== undefined && index > -1){
				this.addEntry(number, Rules.DuplicateSequence);
			} 
			else {
				this.sequenceNumbers.add(func, n);
				const label = this.labelList.get(func)?.indexOf(n);
				if (label !== undefined && label !== -1) {
					this.addEntry(number, Rules.DuplicateLabelSequence);
				}
			}
		}
		return true;
	}

	private visitAssignment(node: nodes.Assignment): boolean {
		if (node.getVariable() instanceof nodes.Variable){
			const variable = <nodes.Variable>node.getVariable();
			if (variable.declaration?.valueType === nodes.ValueType.Constant){
				this.addEntry(variable, Rules.AssignmentConstant);
			}
		}
		return true;
	}
	
	private visitIfStatement(node: nodes.ConditionalStatement): boolean {
		/**
		 * Check the logic operators of a conitional expression.
		 * Operators (|| and && ) can not mixed up e.g. [1 EQ #var || 2 EQ #var && 3 EQ #var]
		 * Max number of statements  MAX_CONDITIONALS
		 */
		let conditional = node.getConditional();
		let count = 1;
		if (conditional) {
			let first = conditional.logic?.getText();
			while (conditional?.getNext()) {
				if (++count > MAX_CONDITIONALS){
					this.addEntry(conditional, Rules.TooManyConditionals);
					break;
				}
				
				const op = conditional.getNext()?.logic;
				if (!op) {
					break;
				}
				if (op.getText() != first) {
					this.addEntry(op, Rules.MixedConditionals);
				}
				conditional = conditional.getNext();
			}
		}
		return true;
	}

	private visitWhileStatement(node: nodes.ConditionalStatement): boolean {
		// No logic operators allowed
		const conditional = node.getConditional();
		if (conditional &&  conditional.logic) {
			this.addEntry(conditional, Rules.IllegalStatement);
		}
		return true;
	}

	private isNumeric(text:string) : boolean {
		let isNumber = (ch:number) => {
			return ch >= _0 && ch <= _9 || ch ===_dot;
		};
		let len = 0;
		for (; len < text.length; len++) {
			let c = text.charCodeAt(len);
			if (!isNumber(text.charCodeAt(len))){
				return false;
			}
		}
		return true; 
	}
}

class FunctionMap<T extends nodes.Node> {
	private elements:Map<T, string[]> = new Map<T,string[]>();
	public add(key:T, value:string){
		if (!this.elements.has(key)){
			this.elements.set(key, new Array<string>());
		}
		this.elements.get(key)?.push(value);
	}

	public get(key:T) : string[] | undefined {
		return this.elements.get(key);
	}
}
