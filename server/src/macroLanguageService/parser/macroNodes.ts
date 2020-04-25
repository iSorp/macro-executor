/*---------------------------------------------------------------------------------------------
 *	Copyright (c) 2020 Simon Waelti
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

export enum NodeType {
	Undefined,
	DefFile,
	MacroFile,
	Include,
	StringLiteral,
	Declarations,
	Function,
	VariableDef,
	labelDef,
	Symbol,
	Ffunc,
	NumericValue,
	If,
	ThenEndif,
	ThenTerm,
	Goto,
	Else,
	While,
	label,
	Variable,
	Address,
	Term,
	Assignment,
	Condition,
	Expression,
	BinaryExpression,
	Operator,
	Identifier,
	IdentifierAddress,
	Statement,
	Parameter,
	Code,
	SequenceNumber,
}

export enum ReferenceType {
	Function,
	Label,
	Variable,
	Undefined
}

export function getNodeAtOffset(node: Node, offset: number): Node | null {

	let candidate: Node | null = null;
	if (!node || offset < node.offset || offset > node.end) {
		return null;
	}

	// Find the shortest node at the position
	node.accept((node) => {
		if (node.offset === -1 && node.length === -1) {
			return true;
		}
		if (node.offset <= offset && node.end >= offset) {
			if (!candidate) {
				candidate = node;
			} else if (node.length <= candidate.length) {
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
	public get end() { return this.offset + this.length; }

	public options: { [name: string]: any; } | undefined;

	public textProvider: ITextProvider | undefined; // only set on the root node

	private children: Node[] | undefined;
	private issues: IMarker[] | undefined;

	private nodeType: NodeType | undefined;

	constructor(offset: number = -1, len: number = -1, nodeType?: NodeType) {
		this.parent = null;
		this.offset = offset;
		this.length = len;
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

	private getTextProvider(): ITextProvider {
		let node: Node | null = this;
		while (node && !node.textProvider) {
			node = node.parent;
		}
		if (node) {
			return node.textProvider!;
		}
		return () => { return 'unknown'; };
	}

	public getText(): string {
		return this.getTextProvider()(this.offset, this.length);
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

	public acceptVisitor(visitor: IVisitor): void {
		this.accept(visitor.visitNode.bind(visitor));
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
				if (current.offset <= offset) {
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

	public getParent(): Node | null {
		let result = this.parent;
		while (result instanceof Nodelist) {
			result = result.parent;
		}
		return result;
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
	new(offset: number, len: number): T;
}

export class Nodelist extends Node {
	private _nodeList: void; 

	constructor(parent: Node, index: number = -1) {
		super(-1, -1);
		this.attachTo(parent, index);
		this.offset = -1;
		this.length = -1;
	}
}

export class DefFile extends Node {

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.DefFile;
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

export class Include extends Node {

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.Include;
	}

	public setMedialist(node: Node | null): node is Node {
		if (node) {
			node.attachTo(this);
			return true;
		}
		return false;
	}
}

export class IdentAddress extends Node {

	address?: string;
	addressType?: string | number | 'pmc' | 'cnc'; 

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.IdentifierAddress;
	}
}

export class NcStatement extends Node {

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.Statement;
	}
}

export class NcCode extends Node {

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.Code;
	}
}

export class NcParameter extends Node {

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.Parameter;
	}
}

export class SequenceNumber extends Node {

	number?: Number;

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.SequenceNumber;
	}
}

export class BodyDeclaration extends Node {

	constructor(offset: number, length: number) {
		super(offset, length);
	}
}

export class Function extends BodyDeclaration {
	public identifier?: Symbol;
	public parameters?: Nodelist;

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.Function;
	}

	public setIdentifier(node: Symbol | null): node is Symbol {
		return this.setNode('identifier', node, 0);
	}

	public getIdentifier(): Symbol | undefined {
		return this.identifier;
	}

	public getName(): string {
		return this.identifier ? this.identifier.getText() : '';
	}

	public getParameters(): Nodelist {
		if (!this.parameters) {
			this.parameters = new Nodelist(this);
		}
		return this.parameters;
	}
}

export class Symbol extends Node {

	public referenceTypes?: ReferenceType[] = [ReferenceType.Undefined];

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.Symbol;
	}

	public getName(): string {
		return this.getText();
	}
}

export class Label extends Symbol {

	public symbol?: Symbol;

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.label;
	}

	public setSymbol(node: Symbol | null): node is Symbol {
		return this.setNode('symbol', node, 0);
	}

	public getSymbol(): Symbol | undefined {
		return this.symbol;
	}

	public getName(): string {
		return this.symbol ? this.symbol.getName() : '';
	}
}

export class Variable extends Symbol {

	public expression?: Expression;
	public symbol?: Symbol;

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.Variable;
	}

	public setExpression(node: Expression | null): node is Expression {
		return this.setNode('expression', node, 0);
	}

	public getExpression(): Expression | undefined {
		return this.expression;
	}
	
	public setSymbol(node: Symbol | null): node is Symbol {
		return this.setNode('symbol', node, 0);
	}

	public getSymbol(): Symbol | undefined {
		return this.symbol;
	}

	public getName(): string {
		return this.symbol ? this.symbol.getName() : '';
	}
}

export class Address extends Symbol {

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.Address;
	}
}

export class Ffunc extends Node {

	public parameter?:BinaryExpression;

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.Ffunc;
	}

	public setParameter(node: BinaryExpression | null): node is BinaryExpression {
		return this.setNode('parameter', node, 0);
	}

	public getParameter(): BinaryExpression | undefined {
		return this.parameter;
	}
}

export class GotoStatement extends BodyDeclaration {

	public label?:Node;
	
	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.Goto;
	}

	public setLabel(label: Node | null): label is Label {
		return this.setNode('label', label);
	}
}

export class ThenEndifStatement extends BodyDeclaration {

	public elseClause?: BodyDeclaration;

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.ThenEndif;
	}

	public setElseClause(elseClause: BodyDeclaration | null): elseClause is BodyDeclaration {
		return this.setNode('elseClause', elseClause);
	}
}

export class ThenTermStatement extends ThenEndifStatement {

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.ThenTerm;
	}
}

export class ElseStatement extends BodyDeclaration {
	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.Else;
	}
}

export class ElseTermStatement extends ElseStatement {
	constructor(offset: number, length: number) {
		super(offset, length);
	}
}

export class IfStatement extends BodyDeclaration {
	public contitional?: Conditional;

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.If;
	}

	public setConditional(node: Conditional | null): node is Conditional {
		return this.setNode('contitional', node, 0);
	}
}

export class WhileStatement extends BodyDeclaration {

	public conditional?: Conditional;
	public dolabel?:Node;
	public endlabel?:Node;

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.While;
	}

	public setConditional(node: Conditional | null): node is Conditional {
		return this.setNode('conditional', node, 0);
	}

	public setDoLabel(label: Node | null): label is Node {
		return this.setNode('dolabel', label);
	}

	public setEndLabel(label: Node | null): label is Node {
		return this.setNode('endlabel', label);
	}
}

export class Conditional extends Node {

	public left?: Node;
	public right?: Node;
	public condition?: Node;

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.Condition;
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
		return this.setNode('condition', value);
	}

	public getOperator(): Node | undefined {
		return this.condition;
	}
}

export class Expression extends Node {

	private _expression: void; 

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.Expression;
	}
}

export class BinaryExpression extends Node {

	public left?: Node;
	public right?: Node;
	public operator?: Node;

	constructor(offset: number, length: number) {
		super(offset, length);
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

	constructor(offset: number, length: number) {
		super(offset, length);
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

	public variable?: Symbol;
	public expression?: Node;

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.Assignment;
	}

	public setVariable(value: Node | null): value is Node {
		return this.setNode('variable', value);
	}

	public getVariable(): Node | undefined {
		return this.variable;
	}

	public setExpression(value: Node | null): value is Node {
		return this.setNode('expression', value);
	}

	public getExpression(): Node | undefined {
		return this.expression;
	}
}

export class AbstractDeclaration extends Node {

	public symbol?: Symbol;
	public address?: IdentAddress;

	constructor(offset: number, length: number) {
		super(offset, length);
	}


	public setSymbol(node: Symbol | null): node is Symbol {
		return this.setNode('symbol', node, 0);
	}

	public getSymbol(): Symbol | undefined {
		return this.symbol;
	}

	public setAddress(node: IdentAddress | null): node is IdentAddress {
		return this.setNode('address', node, 0);
	}

	public getAddress(): IdentAddress | undefined {
		return this.address;
	}

	public getName(): string {
		return this.symbol ? this.symbol.getName() : '';
	}
}

export class LabelDeclaration extends AbstractDeclaration {

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.labelDef;
	}
}

export class VariableDeclaration extends AbstractDeclaration {

	constructor(offset: number, length: number) {
		super(offset, length);
	}

	public get type(): NodeType {
		return NodeType.VariableDef;
	}
}

export interface IRule {
	id: string;
	message: string;
}

export enum Level {
	Ignore = 1,
	Warning = 2,
	Error = 4
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
