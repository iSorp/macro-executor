/*---------------------------------------------------------------------------------------------
 *	Copyright (c) 2020 Simon Waelti
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { integer } from 'vscode-languageserver';

export enum ReferenceType {
	Undefined 	= 1 << 0,
	Label 		= 1 << 1,
	Symbol 		= 1 << 2,
	Variable 	= 1 << 3,
	Program 	= 1 << 4,
	Sequence 	= 1 << 5,
	Code 		= 1 << 6,
	Address 	= 1 << 7,
	JumpLabel 	= 1 << 8,
}

export enum ValueAttribute {
	None,
	Constant,
	Signed,
	GCode,
	MCode,
	Parameter,
	Program
}

export function getNodeAtOffset(node: Node, offset: number, ignoreNode: NodeType = null): Node | null {

	let candidate: Node | null = null;
	if (!node || offset < node.offset || offset > node.end) {
		return null;
	}

	// Find the shortest node at the position
	node.accept((node) => {
		if (ignoreNode && node.type === ignoreNode) {
			return false;
		}

		if (node.offset === -1 && node.length === -1) {
			return true;
		}
		if (node.offset <= offset && node.end >= offset) {
			if (!candidate) {
				candidate = node;
			} else if (node.length <= candidate.length || node.offset >= candidate.offset + candidate.length) {
				candidate = node;
			}
			return true;
		}
		return false;
	});
	return candidate;
}

export function getNodePath(node: Node, offset: number): Node[] {

	let candidate = getNodeAtOffset(node, offset);
	const path: Node[] = [];

	while (candidate) {
		path.unshift(candidate);
		candidate = candidate.parent;
	}

	return path;
}

export interface ITextProvider {
	(offset: number, length: number): string;
}

export class Node {

	public parent: Node | null;

	public offset: number;
	public length: number;
	public progOffset: number;
	public progLength: number;

	public symbol: Symbol | Label;

	public get end() { return this.offset + this.length; }

	public options: { [name: string]: any; } | undefined;

	public textProvider: ITextProvider | undefined; // only set on the root node
	public textProviderProg: ITextProvider | undefined; // only set on the root node

	private children: Node[] | undefined;
	private issues: IMarker[] | undefined;

	private nodeType: NodeType | undefined;

	constructor(offset: number = -1, len: number = -1, progOffset: number = -1, progLen: number = -1, nodeType?: NodeType) {
		this.parent = null;
		this.offset = offset;
		this.length = len;
		this.progOffset = progOffset;
		this.progLength = progLen;
		if (nodeType) {
			this.nodeType = nodeType;
		}
	}

	public set type(type: NodeType) {
		this.nodeType = type;
	}

	public get type(): NodeType {
		return this.nodeType || NodeType.Undefined;
	}

	public getTextProvider(): ITextProvider {
		let node: Node | null = this;
		while (node && !node.textProvider) {
			node = node.parent;
		}
		if (node) {
			return node.textProvider!;
		}
		return () => { return 'unknown'; };
	}

	public getTextProviderProg(): ITextProvider {
		let node: Node | null = this;
		while (node && !node.textProviderProg) {
			node = node.parent;
		}
		if (node) {
			return node.textProviderProg!;
		}
		return () => { return 'unknown'; };
	}

	public getText(): string {
		return this.getTextProvider()(this.offset, this.length);
	}

	public getNonSymbolText(): string {
		return this.getTextProviderProg()(this.progOffset, this.progLength);
	}

	public matches(str: string): boolean {
		return this.length === str.length && this.getTextProvider()(this.offset, this.length) === str;
	}

	public startsWith(str: string): boolean {
		return this.length >= str.length && this.getTextProvider()(this.offset, str.length) === str;
	}

	public endsWith(str: string): boolean {
		return this.length >= str.length && this.getTextProvider()(this.end - str.length, str.length) === str;
	}

	public accept(visitor: IVisitorFunction): void {
		if (visitor(this) && this.children) {
			for (const child of this.children) {
				child.accept(visitor);
			}
		}
	}

	public removeChildren() {
		this.children = [];
	}

	public acceptVisitor(visitor: IVisitor): void {
		this.accept(visitor.visitNode.bind(visitor));
	}

	public setParent(node: Node): Node {
		const idx = this.parent.children.indexOf(this);
		node.attachTo(this.parent, idx);
		node.adoptChild(this);
		return node;
	}

	public adoptChild(node: Node, index: number = -1): Node {
		if (node.parent && node.parent.children) {
			const idx = node.parent.children.indexOf(node);
			if (idx >= 0) {
				node.parent.children.splice(idx, 1);
			}
		}
		node.parent = this;
		let children = this.children;
		if (!children) {
			children = this.children = [];
		}
		if (index !== -1) {
			children.splice(index, 0, node);
		} else {
			children.push(node);
		}
		return node;
	}

	public attachTo(parent: Node, index: number = -1): Node {
		if (parent) {
			parent.adoptChild(this, index);
		}
		return this;
	}

	public collectIssues(results: any[]): void {
		if (this.issues) {
			results.push.apply(results, this.issues);
		}
	}

	public addIssue(issue: IMarker): void {
		if (!this.issues) {
			this.issues = [];
		}
		this.issues.push(issue);
	}

	public hasIssue(rule: IRule): boolean {
		return Array.isArray(this.issues) && this.issues.some(i => i.getRule() === rule);
	}

	public isErroneous(recursive: boolean = false): boolean {
		if (this.issues && this.issues.length > 0) {
			return true;
		}
		return recursive && Array.isArray(this.children) && this.children.some(c => c.isErroneous(true));
	}

	public setNode(field: keyof this, node: Node | null, index: number = -1): boolean {
		if (node) {
			node.attachTo(this, index);
			(<any>this)[field] = node;
			return true;
		}
		return false;
	}

	public addChild(node: Node | null): node is Node {
		if (node) {
			if (!this.children) {
				this.children = [];
			}
			node.attachTo(this);
			this.updateOffsetAndLength(node);
			return true;
		}
		return false;
	}

	private updateOffsetAndLength(node: Node): void {
		if (node.offset < this.offset || this.offset === -1) {
			this.offset = node.offset;
		}
		const nodeEnd = node.end;
		if ((nodeEnd > this.end) || this.length === -1) {
			this.length = nodeEnd - this.offset;
		}
	}

	public hasChildren(): boolean {
		return !!this.children && this.children.length > 0;
	}

	public getChildren(): Node[] {
		return this.children ? this.children.slice(0) : [];
	}

	public getChild(index: number): Node | null {
		if (this.children && index < this.children.length) {
			return this.children[index];
		}
		return null;
	}

	public addChildren(nodes: Node[]): void {
		for (const node of nodes) {
			this.addChild(node);
		}
	}

	public findFirstChildBeforeOffset(offset: number): Node | null {
		if (this.children) {
			let current: Node | null = null;
			for (let i = this.children.length - 1; i >= 0; i--) {
				// iterate until we find a child that has a start offset smaller than the input offset
				current = this.children[i];
				//if (current.offset <= offset) {
				if (current.offset < offset) {
					return current;
				}
			}
		}
		return null;
	}

	public findChildAtOffset(offset: number): Node | null {
		if (this.children) {
			let current: Node | null = null;
			for (let i = this.children.length - 1; i >= 0; i--) {
				// iterate until we find a child that has a start offset smaller than the input offset
				current = this.children[i];
				if (current.offset === offset) {
					return current;
				}
			}
		}
		return null;
	}

	public encloses(candidate: Node): boolean {
		return this.offset <= candidate.offset && this.offset + this.length >= candidate.offset + candidate.length;
	}

	public getChildIndex(): integer | null {
		if (this.parent.children) {
			let current: Node | null = null;
			for (let i = 0; i < this.parent.children.length; i++) {
				current = this.parent.children[i];
				if (current.offset === this.offset && current.length === this.length) {
					return i;
				}
			}
		}
		return null;
	}

	public getLastSibling(): Node | null {
		if (this.parent.hasChildren()) {
			const index = this.getChildIndex();
			if (index !== null) {
				return this.parent.getChild(index - 1);
			}
		}
		return null;
	}

	public getNextSibling(): Node | null {
		if (this.parent.hasChildren()) {
			const index = this.getChildIndex();
			if (index !== null) {
				return this.parent.getChild(index + 1);
			}
		}
		return null;
	}

	public getParent(): Node | null {
		return this.parent;
	}

	public findParent(type: NodeType): Node | null {
		let result: Node | null = this;
		while (result && result.type !== type) {
			result = result.parent;
		}
		return result;
	}

	public findAParent(...types: NodeType[]): Node | null {
		let result: Node | null = this;
		while (result && !types.some(t => result!.type === t)) {
			result = result.parent;
		}
		return result;
	}

	public setData(key: string, value: any): void {
		if (!this.options) {
			this.options = {};
		}
		this.options[key] = value;
	}

	public getData(key: string): any {
		if (!this.options || !this.options.hasOwnProperty(key)) {
			return null;
		}
		return this.options[key];
	}
}

export interface NodeConstructor<T> {
	new(offset: number, len: number, progOffset: number, progLen: number): T;

}

export interface IRule {
	id: string;
	message: string;
}

export enum Level {
	Error 	= 1,
	Warning = 2,
	Info 	= 3,
	Hint 	= 4,
	Ignore 	= 5
}

export interface IMarker {
	getNode(): Node;
	getMessage(): string;
	getOffset(): number;
	getLength(): number;
	getRule(): IRule;
	getLevel(): Level;
}

export class Marker implements IMarker {

	private node: Node;
	private rule: IRule;
	private level: Level;
	private message: string;
	private offset: number;
	private length: number;

	constructor(node: Node, rule: IRule, level: Level, message?: string, offset: number = node.offset, length: number = node.length) {
		this.node = node;
		this.rule = rule;
		this.level = level;
		this.message = message || rule.message;
		this.offset = offset;
		this.length = length;
	}

	public getRule(): IRule {
		return this.rule;
	}

	public getLevel(): Level {
		return this.level;
	}

	public getOffset(): number {
		return this.offset;
	}

	public getLength(): number {
		return this.length;
	}

	public getNode(): Node {
		return this.node;
	}

	public getMessage(): string {
		return this.message;
	}
}

export interface IVisitor {
	visitNode: (node: Node) => boolean;
}

export interface IVisitorFunction {
	(node: Node): boolean;
}

export class ParseErrorCollector implements IVisitor {

	static entries(node: Node): IMarker[] {
		const visitor = new ParseErrorCollector();
		node.acceptVisitor(visitor);
		return visitor.entries;
	}

	public entries: IMarker[];

	constructor() {
		this.entries = [];
	}

	public visitNode(node: Node): boolean {

		if (node.isErroneous()) {
			node.collectIssues(this.entries);
		}
		return true;
	}
}

export enum NodeType {
	Undefined,
	MacroFile,
	DefFile,
	SymbolRoot,
	Include,
	StringLiteral,
	Program,
	SymbolDef,
	LabelDef,
	Symbol,
	Ffunc,
	Fcmd,
	Numeric,
	If,
	Then,
	ThenTerm,
	ElseTerm,
	Goto,
	Else,
	While,
	Label,
	Variable,
	Address,
	String,
	Term,
	Assignment,
	ConditionalExpression,
	BinaryExpression,
	Operator,
	Identifier,
	ControlStatement,
	FuncParam,
	Statement,
	Code,
	Parameter,
	SequenceNumber,
	NNAddress,
	BlockSkip,
	BlockDel,
}

export class Reference extends Node {

	public referenceTypes: ReferenceType;

	constructor(offset: number, length: number, progOffset: number, progLength: number) {
		super(offset, length, progOffset, progLength);
	}

	public addReferenceType(...referenceTypes: ReferenceType[]) {
		for (const ref of referenceTypes) {
			this.referenceTypes |= ref;
			if (this.symbol) {
				this.symbol.referenceTypes |= ref;
			}
		}
	}

	public hasReferenceType(referenceType: ReferenceType): boolean {
		return !!(this.referenceTypes & referenceType);
	}
}

export class DefReference extends Reference {

	public attrib: ValueAttribute = ValueAttribute.None;

	constructor(offset: number, length: number, progOffset: number, progLength: number, private definition: AbstractDefinition) {
		super(offset, length, progOffset, progLength);
		if (definition) {
			this.attrib = definition.attrib;
		}
	}

	public get valueType(): NodeType | undefined {
		return this.definition?.value?.type;
	}

	public get defType(): NodeType | undefined {
		return this.definition?.type;
	}

	public getNonSymbolText(): string {
		return this.definition?.value?.getText();
	}
}

export class MacroFile extends Node {

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.MacroFile;
	}
}

export enum Data {
	Path 		= 'path',		// Path for include node	
	Includes 	= 'includes',	// Data contains an array of all included uris
}

export class Include extends Node {

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.Include;
	}
}

export class NcStatement extends Node {

	constructor(offset: number, length: number, progOffset: number, progLength: number) {
		super(offset, length, progOffset, progLength);
	}

	public get type(): NodeType {
		return NodeType.Statement;
	}
}

export enum CodeType {
	G = 'g',
	M = 'm'
}

export class NcCode extends Reference {

	public codeType?: CodeType;

	constructor(offset: number, length: number, progOffset: number, progLength: number) {
		super(offset, length, progOffset, progLength);
		this.referenceTypes = ReferenceType.Code;
	}

	public get type(): NodeType {
		return NodeType.Code;
	}
}

export class Parameter extends Reference {

	constructor(offset: number, length: number, progOffset: number, progLength: number) {
		super(offset, length, progOffset, progLength);
		this.referenceTypes = ReferenceType.Symbol;
	}

	public get type(): NodeType {
		return NodeType.Parameter;
	}
}

export class SequenceNumber extends Reference {

	public number?: Node;

	constructor(offset: number, length: number, progOffset: number, progLength: number) {
		super(offset, length, progOffset, progLength);
		this.referenceTypes = ReferenceType.Sequence;
	}

	public get type(): NodeType {
		return NodeType.SequenceNumber;
	}

	public setNumber(node: Node | null): node is Node {
		return this.setNode('number', node, 0);
	}

	public getNumber(): Node | undefined {
		return this.number;
	}

	public get value() : number | undefined {
		return Number(this.number.getNonSymbolText());
	}
}

export class BodyDeclaration extends Node {

	constructor(offset: number, length: number, progOffset: number, progLength: number) {
		super(offset, length, progOffset, progLength);
	}
}

export class Program extends BodyDeclaration {
	public identifier?: Node;

	constructor(offset: number, length: number, progOffset: number, progLength: number) {
		super(offset, length, progOffset, progLength);
	}

	public get type(): NodeType {
		return NodeType.Program;
	}

	public setIdentifier(node: Node | null): node is Node {
		return this.setNode('identifier', node, 0);
	}

	public getIdentifier(): Node | undefined {
		return this.identifier;
	}

	public getName(): string {
		return this.identifier ? this.identifier.getText() : '';
	}
}

export class Symbol extends DefReference {

	public identifier: Node;

	constructor(offset: number, length: number, progOffset: number, progLength: number, definition?: AbstractDefinition) {
		super(offset, length, progOffset, progLength, definition);
		this.setIdentifier(new Node(offset, length));
		this.referenceTypes = ReferenceType.Symbol;
	}

	public get type(): NodeType {
		return NodeType.Symbol;
	}

	public setIdentifier(node: Node | null): node is Node {
		return this.setNode('identifier', node, 0);
	}

	public getText(): string {
		return this.identifier.getText();
	}
}

export class Label extends DefReference {

	public identifier: Node;

	constructor(offset: number, length: number, progOffset: number, progLength: number, definition?: AbstractDefinition) {
		super(offset, length, progOffset, progLength, definition);
		this.setIdentifier(new Node(offset, length));
		this.referenceTypes = ReferenceType.Label;
	}

	public get type(): NodeType {
		return NodeType.Label;
	}

	public setIdentifier(node: Node | null): node is Node {
		return this.setNode('identifier', node, 0);
	}

	public getText(): string {
		return this.identifier.getText();
	}
}

export class Numeric extends Reference {

	constructor(offset: number, length: number, progOffset: number, progLength: number) {
		super(offset, length, progOffset, progLength);
	}

	public get type(): NodeType {
		return NodeType.Numeric;
	}
}

export class Variable extends Reference {

	public body?: Node;

	constructor(offset: number, length: number, progOffset: number, ProgLength: number) {
		super(offset, length, progOffset, ProgLength);
		this.referenceTypes = ReferenceType.Variable;
	}

	public get type(): NodeType {
		return NodeType.Variable;
	}

	public setBody(node: Node | null): node is Node {
		return this.setNode('body', node, 0);
	}

	public getBody(): Node | undefined {
		return this.body;
	}

	public getValue(): string {
		return this.body ? this.body.getText() : '';
	}
}

export class Address extends Reference {

	constructor(offset: number, length: number, progOffset: number, progLength: number) {
		super(offset, length, progOffset, progLength);
		this.referenceTypes = ReferenceType.Address;
	}

	public get type(): NodeType {
		return NodeType.Address;
	}
}

export class Ffunc extends Node {

	public identifier?: Node;

	constructor(offset: number, length: number, progOffset: number, progLength: number) {
		super(offset, length, progOffset, progLength);
	}

	public get type(): NodeType {
		return NodeType.Ffunc;
	}

	public setIdentifier(node: Node | null): node is Node {
		return this.setNode('identifier', node, 0);
	}

	public getIdentifier(): Node | undefined {
		return this.identifier;
	}
}

export class Fcmd extends Ffunc {

	constructor(offset: number, length: number, progOffset: number, progLength: number) {
		super(offset, length, progOffset, progLength);
	}

	public get type(): NodeType {
		return NodeType.Fcmd;
	}
}

export class BlockDel extends Node {

	public number?: Numeric;

	constructor(offset: number, length: number, progOffset: number, progLength: number) {
		super(offset, length, progOffset, progLength);
	}

	public get type(): NodeType {
		return NodeType.BlockDel;
	}

	public setNumber(number: Numeric | null): number is Numeric {
		return this.setNode('number', number);
	}

	public getNumber(): Numeric | undefined {
		return this.number;
	}
}

export class GotoStatement extends BodyDeclaration {

	public label?: Node;

	constructor(offset: number, length: number, progOffset: number, progLength: number) {
		super(offset, length, progOffset, progLength);
	}

	public get type(): NodeType {
		return NodeType.Goto;
	}

	public setLabel(label: Node | null): label is Node {
		return this.setNode('label', label);
	}

	public getLabel(): Node | undefined {
		return this.label;
	}
}

export class IfEndifStatement extends BodyDeclaration {

	public elseClause?: BodyDeclaration;

	constructor(offset: number, length: number, progOffset: number, progLength: number) {
		super(offset, length, progOffset, progLength);
	}

	public get type(): NodeType {
		return NodeType.Then;
	}

	public setElseClause(elseClause: BodyDeclaration | null): elseClause is BodyDeclaration {
		return this.setNode('elseClause', elseClause);
	}
}

export class ThenTermStatement extends IfEndifStatement {

	constructor(offset: number, length: number, progOffset: number, progLength: number) {
		super(offset, length, progOffset, progLength);
	}

	public get type(): NodeType {
		return NodeType.ThenTerm;
	}
}

export class ElseStatement extends BodyDeclaration {
	constructor(offset: number, length: number, progOffset: number, progLength: number) {
		super(offset, length, progOffset, progLength);
	}

	public get type(): NodeType {
		return NodeType.Else;
	}
}

export class ElseTermStatement extends ElseStatement {
	constructor(offset: number, length: number, progOffset: number, progLength: number) {
		super(offset, length, progOffset, progLength);
	}

	public get type(): NodeType {
		return NodeType.ElseTerm;
	}
}

export class ConditionalStatement extends BodyDeclaration {
	public contitional?: ConditionalExpression;

	constructor(offset: number, length: number, progOffset: number, progLength: number) {
		super(offset, length, progOffset, progLength);
	}

	public setConditional(node: ConditionalExpression | null): node is ConditionalExpression {
		return this.setNode('contitional', node, 0);
	}

	public getConditional(): ConditionalExpression | undefined {
		return this.contitional;
	}
}

export class IfStatement extends ConditionalStatement {
	constructor(offset: number, length: number, progOffset: number, progLength: number) {
		super(offset, length, progOffset, progLength);
	}

	public get type(): NodeType {
		return NodeType.If;
	}
}

export class WhileStatement extends ConditionalStatement {
	public dolabel?: Node;
	public endlabel?: Node;

	constructor(offset: number, length: number, progOffset: number, progLength: number) {
		super(offset, length, progOffset, progLength);
	}

	public get type(): NodeType {
		return NodeType.While;
	}

	public setDoLabel(label: Node | null): label is Node {
		return this.setNode('dolabel', label);
	}

	public setEndLabel(label: Node | null): label is Node {
		return this.setNode('endlabel', label);
	}
}

export class ConditionalExpression extends Node {

	public left?: BinaryExpression;
	public right?: BinaryExpression;
	public next?: ConditionalExpression;
	public condition?: Node;
	public logic?: Node;

	constructor(offset: number, length: number, progOffset: number, progLength: number) {
		super(offset, length, progOffset, progLength);
	}

	public get type(): NodeType {
		return NodeType.ConditionalExpression;
	}

	public setLeft(left: BinaryExpression | null): left is BinaryExpression {
		return this.setNode('left', left);
	}

	public getLeft(): BinaryExpression | undefined {
		return this.left;
	}

	public setRight(right: BinaryExpression | null): right is BinaryExpression {
		return this.setNode('right', right);
	}

	public getRight(): BinaryExpression | undefined {
		return this.right;
	}

	public setNext(next: ConditionalExpression | null): next is ConditionalExpression {
		return this.setNode('next', next);
	}

	public getNext(): ConditionalExpression | undefined {
		return this.next;
	}

	public setConditionalOp(value: Node | null): value is Node {
		return this.setNode('condition', value);
	}

	public getConditionalOp(): Node | undefined {
		return this.condition;
	}

	public setLogicOp(value: Node | null): value is Node {
		return this.setNode('logic', value);
	}

	public getLogicOp(): Node | undefined {
		return this.logic;
	}
}

export class BinaryExpression extends Node {

	public left?: Node;
	public right?: Node;
	public operator?: Node;

	constructor(offset: number, length: number, progOffset: number, progLength: number) {
		super(offset, length, progOffset, progLength);
	}

	public get type(): NodeType {
		return NodeType.BinaryExpression;
	}

	public setLeft(left: Node | null): left is Node {
		return this.setNode('left', left);
	}

	public getLeft(): Node | undefined {
		return this.left;
	}

	public setRight(right: Node | null): right is Node {
		return this.setNode('right', right);
	}

	public getRight(): Node | undefined {
		return this.right;
	}

	public setOperator(value: Node | null): value is Node {
		return this.setNode('operator', value);
	}

	public getOperator(): Node | undefined {
		return this.operator;
	}
}

export class Term extends Node {

	public operator?: Node;
	public expression?: Node;

	constructor(offset: number, length: number, progOffset: number, progLength: number) {
		super(offset, length, progOffset, progLength);
	}

	public get type(): NodeType {
		return NodeType.Term;
	}

	public setOperator(value: Node | null): value is Node {
		return this.setNode('operator', value);
	}

	public getOperator(): Node | undefined {
		return this.operator;
	}

	public setExpression(value: Node | null): value is Node {
		return this.setNode('expression', value);
	}

	public getExpression(): Node | undefined {
		return this.expression;
	}
}

export class Assignment extends Node {

	public left?: Node;
	public right?: Node;

	constructor(offset: number, length: number, progOffset: number, progLength: number) {
		super(offset, length, progOffset, progLength);
	}

	public get type(): NodeType {
		return NodeType.Assignment;
	}

	public setLeft(value: Node | null): value is Node {
		return this.setNode('left', value);
	}

	public getLeft(): Node | undefined {
		return this.left;
	}

	public setRight(value: Node | null): value is Node {
		return this.setNode('right', value);
	}

	public getRight(): Node | undefined {
		return this.right;
	}
}

export class AbstractDefinition extends Node {

	public identifier?: Node;
	public value?: Node;
	public attrib: ValueAttribute = ValueAttribute.None;

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public setIdentifier(node: Node | null): node is Symbol {
		return this.setNode('identifier', node, 0);
	}

	public getIdentifier(): Node | undefined {
		return this.identifier;
	}

	public getName(): string {
		return this.identifier ? this.identifier.getText() : '';
	}

	public setValue(node: Node | null): node is Node {
		return this.setNode('value', node, 0);
	}

	public getValue(): Node | undefined {
		return this.value;
	}
}

export class LabelDefinition extends AbstractDefinition {

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.LabelDef;
	}
}

export class SymbolDefinition extends AbstractDefinition {

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.SymbolDef;
	}
}