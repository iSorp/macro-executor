/*---------------------------------------------------------------------------------------------
* Copyright (c) 2020 Simon Waelti
* Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
'use strict';

import * as nodes from '../parser/macroNodes';

import { 
	TextDocument, 
	MacroFileProvider, 
} from '../macroLanguageTypes';
import { 
	LintConfiguration, 
	Rules,
	Rule 
} from './lintRules';

const MAX_CONDITIONALS = 4;
const MAX_WHILE_DEPTH = 3;
const MAX_IF_DEPTH = 10;

export class LintVisitor implements nodes.IVisitor {

	static entries(macrofile: nodes.Node, document: TextDocument, fileProvider: MacroFileProvider, settings: LintConfiguration): nodes.IMarker[] {
		const visitor = new LintVisitor(fileProvider, settings);
		macrofile.acceptVisitor(visitor);
		visitor.completeValidations();
		return visitor.getEntries();
	}

	private definitions:Map<string,nodes.AbstractDefinition> = new Map<string,nodes.AbstractDefinition>();
	private sequenceList:FunctionMap<nodes.Program, nodes.SequenceNumber> = new FunctionMap();
	private gotoList:FunctionMap<nodes.Program, nodes.GotoStatement> = new FunctionMap();
	private duplicateList: string[] = [];
	private imports: string[] = [];

	private rules: nodes.IMarker[] = [];
	private functionList = new Array<string>();

	private constructor(private fileProvider: MacroFileProvider, private settings: LintConfiguration) { }

	public getEntries(filter: number = (nodes.Level.Warning | nodes.Level.Error)): nodes.IMarker[] {
		return this.rules.filter(entry => {
			return (entry.getLevel() & filter) !== 0;
		});
	}

	public addEntry(node: nodes.Node, rule: Rule, details?: string): void {
		const entry = new nodes.Marker(node, rule, this.settings.getRule(rule), details);
		this.rules.push(entry);
	}

	private completeValidations() {

		// Check GOTO number occurrence
		for (const tuple of this.gotoList.elements) {
			const func = tuple[0];
			const gotoStatements = tuple[1];
			const sequences = this.sequenceList.get(func);
			for (const node of gotoStatements) {
				const jumpLabel = node.getLabel();
				if (jumpLabel) {
					const number = Number(jumpLabel.getNonSymbolText());
					if (!number) {
						continue;
					}

					if (sequences && sequences.some(a => {
						return a.value === number;
					})) {
						continue;
					}
					else {
						this.addEntry(jumpLabel, Rules.SeqNotFound);
					}
				}
			}
		}
	}

	public visitNode(node: nodes.Node): boolean {
		switch (node.type) {
			case nodes.NodeType.MacroFile:
				return this.visitGlobalScope(<nodes.MacroFile>node);
			case nodes.NodeType.Include:
				return this.visitIncludes(<nodes.Include>node);
			case nodes.NodeType.Symbol:
				return this.visitSymbols(<nodes.Symbol>node);
			case nodes.NodeType.SymbolDef:
				return this.visitDefinition(<nodes.SymbolDefinition>node, true);
			case nodes.NodeType.LabelDef:
				return this.visitDefinition(<nodes.LabelDefinition>node, true);
			case nodes.NodeType.Program:
				return this.visitFunction(<nodes.Program>node);
			case nodes.NodeType.Parameter:
				return this.visitParameter(<nodes.Parameter>node);
			case nodes.NodeType.Goto:
				return this.visitGoto(<nodes.GotoStatement>node);
			case nodes.NodeType.SequenceNumber:
				return this.visitSequenceNumber(<nodes.SequenceNumber>node);		
			case nodes.NodeType.NNAddress:
				return this.visitNNAddress(node);		
			case nodes.NodeType.Assignment:
				return this.visitAssignment(<nodes.Assignment>node);
			case nodes.NodeType.If:
				return this.visitIfStatement(<nodes.IfStatement>node);	
			case nodes.NodeType.While:
				return this.visitWhileStatement(<nodes.WhileStatement>node);
			case nodes.NodeType.BlockDel:
				return this.visitBlockDel(<nodes.BlockDel>node);
		}
		return true;
	}

	private visitIncludes(node: nodes.Include) : boolean {
		let uri = node.getChild(0);
		if (!uri) {
			return false;
		}

		if (this.imports.indexOf(uri?.getText()) > -1){
			this.addEntry(node, Rules.DuplicateInclude);
		}
		else {
			this.imports.push(uri.getText());
			let declaration = this.fileProvider?.get(uri.getText());
			
			if (declaration) {
				(<nodes.Node>declaration?.macrofile).accept(candidate => {
					let found = false;
					if (candidate.type === nodes.NodeType.SymbolDef || candidate.type === nodes.NodeType.LabelDef) {
						this.visitDefinition(candidate, false);
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
		return true;
	}

	private visitFunction(node: nodes.Program): boolean {

		const ident = node.getIdentifier();
		if (ident) {
			const number = ident.getNonSymbolText();
			if (this.functionList.indexOf(number) === -1) {
				this.functionList.push(number);
			}
			else {
				this.addEntry(ident, Rules.DuplicateFunction);
			}
		}
		return true;
	}

	private visitSymbols(node: nodes.Symbol) : boolean {

		if (node.getParent()?.type === nodes.NodeType.SymbolRoot || node.getParent()?.type === nodes.NodeType.SymbolDef) {
			return false;
		}

		if (this.duplicateList.indexOf(node.getText()) !== -1) {
			this.addEntry(node, Rules.DuplicateDeclaration);
		}

		// Check references
		if (!this.definitions.has(node.getText())) {
			this.addEntry(node, Rules.UnknownSymbol);
		}
		
		return true;
	}

	private visitGoto(node: nodes.GotoStatement) : boolean {
		const func = <nodes.Program>node.findAParent(nodes.NodeType.Program);
		if (func) {
			this.gotoList.add(func, node);
		}
		return true;
	}

	/**
	 * 
	 * @param node 
	 * @param local if true execute some checks only for the current file 
	 */
	private visitDefinition(node: nodes.Node, local:boolean) : boolean {
		// scan local declarations
		let def = <nodes.AbstractDefinition>node;
		let ident = def.getName();

		if (ident) {
			if (this.definitions.has(ident)) {
				this.duplicateList.push(ident);
				if (local) {
					this.addEntry(def, Rules.DuplicateDeclaration);
				}
			}
			
			if (local) {
				const value = def.getValue()?.getText();
				for (const element of this.definitions.values()) {
					if ((def.type ===  nodes.NodeType.Address 
						|| def.type ===  nodes.NodeType.Numeric) 
						&& (def.type ===  element.type &&  element.getValue()?.getText() === value)) {
						this.addEntry(def, Rules.DuplicateAddress);
					}
				}
			}
			
			if (node.type === nodes.NodeType.SymbolDef) {
				this.definitions.set(ident, <nodes.SymbolDefinition>node);
			}
			else if (node.type === nodes.NodeType.LabelDef) {
				this.definitions.set(ident, <nodes.LabelDefinition>node);
			}
		}
		return true;
	}

	/*private visitStatement(node: nodes.NcStatement): boolean {
		for (const statement of node.getChildren()) {
			if (!statement.findAParent(nodes.NodeType.SymbolDef)) {
				if (statement.type === nodes.NodeType.Parameter || statement.type === nodes.NodeType.Code) {
					if (!statement.hasChildren()) {
						this.addEntry(statement, Rules.IncompleteParameter);
					}
				}
			}
		}
		return true;
	}*/

	private visitParameter(node: nodes.Parameter): boolean {
		if (!node.findAParent(nodes.NodeType.SymbolDef)) {
			if (!node.hasChildren()) {
				this.addEntry(node, Rules.IncompleteParameter);
			}
		}
		return true;
	}

	private visitSequenceNumber(node: nodes.SequenceNumber): boolean {

		const number = node.getNumber();
		if (number) {
			const func = <nodes.Program>node.findAParent(nodes.NodeType.Program);
			const list = this.sequenceList.get(func);
			const duplicate = list?.some(a => {
				if (a.value === node.value) {
					if (a.symbol?.type !== number.symbol?.type) {
						this.addEntry(number, Rules.DuplicateLabelSequence);
					}
					else {
						if (number.symbol instanceof nodes.Label) {
							this.addEntry(number, Rules.DuplicateLabel);
						}
						else {
							this.addEntry(number, Rules.DuplicateSequence);
						}
					}
					return true;
				}
				return false;
			});
			if (!duplicate) {
				this.sequenceList.add(func, node);
			}
		}
		return true;
	}

	private inG10 = false;
	private visitNNAddress(node: nodes.Node): boolean  {
		this.inG10 = false;
		const parent = node.findAParent(nodes.NodeType.Program);
		for (let child of parent.getChildren()) {
			if (child.type === nodes.NodeType.SequenceNumber){
				child = child.getChild(1);
			}
			if (child && child.type === nodes.NodeType.Statement) {
				if (child.getNonSymbolText().toLocaleLowerCase().includes('g10')) {
					this.inG10 = true;
				}

				if (child.getNonSymbolText().toLocaleLowerCase().includes('g11')) {
					if (this.inG10) {
						return false;
					}
				}
			}
		}
		this.addEntry(node, Rules.UnsuitableNNAddress);
		return true;
	}

	private visitAssignment(node: nodes.Assignment): boolean {
		if (node.getLeft() instanceof nodes.Variable) {
			const body = (<nodes.Variable>node.getLeft()).getBody();
			if (body.symbol?.attrib === nodes.ValueAttribute.Constant) {
				this.addEntry(body, Rules.AssignmentConstant);
			}
		}
		return true;
	}
	
	private visitIfStatement(node: nodes.IfStatement): boolean {
		/**
		 * Check the logic operators of a conitional expression.
		 * Operators (|| and && ) can not mixed up e.g. [1 EQ #var || 2 EQ #var && 3 EQ #var]
		 * Max number of statements  MAX_CONDITIONALS
		 */
		let conditional = node.getConditional();
		let count = 1;	
		if (conditional) {
			const first = conditional.logic?.getNonSymbolText();
			while (conditional?.getNext()) {
				if (++count > MAX_CONDITIONALS){
					this.addEntry(conditional, Rules.TooManyConditionals);
					break;
				}
				
				const op = conditional.getNext()?.logic;
				if (!op) {
					break;
				}
				if (op.getNonSymbolText() !== first) {
					this.addEntry(op, Rules.MixedConditionals);
				}
				conditional = conditional.getNext();
			}
		}

		// check level from in to out
		let level = 0;
		const path = nodes.getNodePath(node, node.offset);
		for (let i = path.length-1; i > -1; i--) {
			const element = path[i];
			if (element.type === nodes.NodeType.If) {
				++level;
				if (level > MAX_IF_DEPTH) {
					this.addEntry(node, Rules.NestingTooDeep);
					return false;
				}
			}
		}
		return true;
	}

	private visitWhileStatement(node: nodes.WhileStatement): boolean {

		let depth = 0;
		let doNumber:number = 0;
		// Check no logic operators allowed
		const conditional = node.getConditional();
		if (conditional && conditional.logic) {
			this.addEntry(conditional, Rules.WhileLogicOperator);
		}

		// Check DO END label/number agreement
		if (node.dolabel && node.endlabel) {
			if (node.dolabel?.getNonSymbolText() !== node.endlabel?.getNonSymbolText()) {
				this.addEntry(node.dolabel, Rules.DoEndNumberNotEqual);
				this.addEntry(node.endlabel, Rules.DoEndNumberNotEqual);
			}

			if (Number(node.dolabel.getNonSymbolText())) {
				doNumber = Number(node.dolabel.getNonSymbolText());
				if (doNumber && doNumber > MAX_WHILE_DEPTH) {
					this.addEntry(node.dolabel, Rules.DoEndNumberTooBig);
				}

				const endNumber = Number(node.endlabel.getNonSymbolText());
				if (endNumber && endNumber > MAX_WHILE_DEPTH) {
					this.addEntry(node.endlabel, Rules.DoEndNumberTooBig);
				}
			}
		}

		const path = nodes.getNodePath(node, node.offset);
		for (let i = path.length-1; i > -1; i--) {
			const element = path[i];
			if (element.type !== nodes.NodeType.While) {
				continue;
			}

			const child = <nodes.WhileStatement>element;
			
			// Check while depth
			if (depth >= MAX_WHILE_DEPTH) {
				this.addEntry(node, Rules.NestingTooDeep);
				return false;
			}

			// Check duplicate DO number
			if (depth > 0) {
				if (doNumber === Number(child.dolabel?.getNonSymbolText())) {
					this.addEntry(child.dolabel!, Rules.DuplicateDoEndNumber);
				}
			}
			++depth;
		}
		return true;
	}

	private visitBlockDel(node: nodes.BlockDel): boolean {
		const number = Number(node.getNumber().getNonSymbolText());
		if (number < 1 || number > 9) {
			this.addEntry(node, Rules.BlockDelNumber);
		}
		return true;
	}
}

class FunctionMap<T extends nodes.Node, V> {
	public elements:Map<T, V[]> = new Map<T, V[]>();
	public add(key:T, value:V) {
		if (!this.elements.has(key)) {
			this.elements.set(key, new Array<V>());
		}
		this.elements.get(key)?.push(value);
	}

	public get(key:T) : V[] | undefined {
		return this.elements.get(key);
	}
}
