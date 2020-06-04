/*---------------------------------------------------------------------------------------------
*	Copyright (c) 2020 Simon Waelti
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
import * as scanner from './macroScanner';
import { TokenType, Scanner, IToken } from './macroScanner';
import * as nodes from './macroNodes';
import { ParseError, MacroIssueType } from './macroErrors';
import { TextDocument, MacroFileProvider } from '../MacroLanguageTypes';


export interface IMark {
	prev?: IToken;
	curr: IToken;
	pos: number;
}

export class Parser {
	
	private scanner: Scanner = new Scanner();
	private textProvider?: nodes.ITextProvider;
	private token: IToken;
	private prevToken?: IToken;
	private lastErrorToken?: IToken;
	private declarations:Map<string,nodes.AbstractDeclaration> = new Map<string,nodes.AbstractDeclaration>()
	private includes:string[] = []

	constructor(private fileProvider: MacroFileProvider) {
		this.token = { type: TokenType.EOF, offset: -1, len: 0, text: '' };
		this.prevToken = undefined;
	}

	private isNcCode(ch:number): boolean {
		if (ch >= scanner._a && ch <= scanner._z || ch >= scanner._A && ch <= scanner._Z) { 
			return true;
		}
		return false;
	}
	
	public peekSymbol(text: string): boolean {
		return TokenType.Symbol === this.token.type && text.length === this.token.text.length && text === this.token.text.toLowerCase();
	}

	public peekKeyword(text: string): boolean {
		return text.length === this.token.text.length && text === this.token.text.toLowerCase();
	}

	public peekDelim(text: string): boolean {
		return TokenType.Delim === this.token.type && text === this.token.text;
	}

	public peek(type: TokenType): boolean {
		return type === this.token.type;
	}

	public peekOneOf(tokens: TokenType[]): boolean {
		for (const token of tokens) {
			if (token === this.token.type) {
				return true;
			}
		}
		return false;
	}

	public peekRegExp(type: TokenType, regEx: RegExp): boolean {
		if (type !== this.token.type) {
			return false;
		}
		return regEx.test(this.token.text);
	}

	public hasWhitespace(): boolean {
		return !!this.prevToken && (this.prevToken.offset + this.prevToken.len !== this.token.offset);
	}

	public consumeToken(): void {
		this.prevToken = this.token;
		this.token = this.scanner.scan();
	}

	public mark(): IMark {
		return {
			prev: this.prevToken,
			curr: this.token,
			pos: this.scanner.pos()
		};
	}

	public restoreAtMark(mark: IMark): void {
		this.prevToken = mark.prev;
		this.token = mark.curr;
		this.scanner.goBackTo(mark.pos);
	}

	public try(func: () => nodes.Node | null): nodes.Node | null {
		const pos = this.mark();
		const node = func();
		if (!node) {
			this.restoreAtMark(pos);
			return null;
		}
		return node;
	}

	public hasKeywords(keywords: string[]): boolean {
		let mark = this.mark();
		for (const keyword of keywords) {
			if (keyword.length === this.token.text.length && keyword === this.token.text.toLowerCase()) {
				this.consumeToken();
			}
			else {
				this.restoreAtMark(mark);
				return false;
			}
		}
		this.restoreAtMark(mark);
		return true;
	}
		
	public acceptOneKeyword(keywords: string[]): boolean {
		for (const keyword of keywords) {
			if (keyword.length === this.token.text.length && keyword === this.token.text.toLowerCase()) {
				this.consumeToken();
				return true;
			}
		}
		return false;
	}

	public accept(type: TokenType) {
		if (type === this.token.type) {
			this.consumeToken();
			return true;
		}
		return false;
	}

	public acceptIdent(text: string): boolean {
		if (this.peekSymbol(text)) {
			this.consumeToken();
			return true;
		}
		return false;
	}

	public acceptKeyword(text: string) {
		if (this.peekKeyword(text)) {
			this.consumeToken();
			return true;
		}
		return false;
	}

	public acceptDelim(text: string) {
		if (this.peekDelim(text)) {
			this.consumeToken();
			return true;
		}
		return false;
	}

	public acceptRegexp(regEx: RegExp): boolean {
		if (regEx.test(this.token.text)) {
			this.consumeToken();
			return true;
		}
		return false;
	}

	public _parseRegexp(regEx: RegExp): nodes.Node {
		let node = this.createNode(nodes.NodeType.Identifier);
		do { } while (this.acceptRegexp(regEx));
		return this.finish(node);
	}

	protected acceptUnquotedString(): boolean {
		const pos = this.scanner.pos();
		this.scanner.goBackTo(this.token.offset);
		const unquoted = this.scanner.scanUnquotedString();
		if (unquoted) {
			this.token = unquoted;
			this.consumeToken();
			return true;
		}
		this.scanner.goBackTo(pos);
		return false;
	}

	public _processNewLines() {
		while (this.acceptRegexp(/(\n)+/i)) {
			if (this.token.type === TokenType.EOF) {
				break;
			}
		}
	}

	public resync(resyncTokens: TokenType[] | undefined, resyncStopTokens: TokenType[] | undefined): boolean {
		while (true) {
			if (resyncTokens && resyncTokens.indexOf(this.token.type) !== -1) {
				this.consumeToken();
				return true;
			} else if (resyncStopTokens && resyncStopTokens.indexOf(this.token.type) !== -1) {
				return true;
			} else {
				if (this.token.type === TokenType.EOF) {
					return false;
				}
				this.token = this.scanner.scan();
			}
		}
	}

	public createNode(nodeType: nodes.NodeType): nodes.Node {
		return new nodes.Node(this.token.offset, this.token.len, nodeType);
	}

	public create<T>(ctor: nodes.NodeConstructor<T>): T {
		return new ctor(this.token.offset, this.token.len);
	}

	public finish<T extends nodes.Node>(node: T, error?: MacroIssueType, resyncTokens?: TokenType[], resyncStopTokens?: TokenType[]): T {
		// parseNumeric misuses error for boolean flagging (however the real error mustn't be a false)
		// + nodelist offsets mustn't be modified, because there is a offset hack in rulesets for smartselection
		if (!(node instanceof nodes.Nodelist)) {
			if (error) {
				this.markError(node, error, resyncTokens, resyncStopTokens);
			}
			// set the node end position
			if (this.prevToken) {
				// length with more elements belonging together
				const prevEnd = this.prevToken.offset + this.prevToken.len;
				node.length = prevEnd > node.offset ? prevEnd - node.offset : 0; // offset is taken from current token, end from previous: Use 0 for empty nodes
			}

		}
		return node;
	}

	public markError<T extends nodes.Node>(node: T, error: MacroIssueType, resyncTokens?: TokenType[], resyncStopTokens?: TokenType[]): void {
		if (this.token !== this.lastErrorToken) { // do not report twice on the same token
			node.addIssue(new nodes.Marker(node, error, nodes.Level.Error, undefined, this.token.offset, this.token.len));
			this.lastErrorToken = this.token;
		}
		if (resyncTokens || resyncStopTokens) {
			this.resync(resyncTokens, resyncStopTokens);
		}
	}


	//#region utils
	private _parseString() : nodes.Node | null{

		
		if (!this.peek(TokenType.String) && !this.peek(TokenType.BadString)) {
			return null;
		}
		
		const node = this.createNode(nodes.NodeType.String);
		if (this.accept(TokenType.BadString)){
			return this.finish(node, ParseError.Badstring);
		}
		
		this.consumeToken();

		if (this.accept(TokenType.BadString)){
			return this.finish(node, ParseError.InvalidStatement);
		}

		return this.finish(node);
	}

	private _parsePart(startIndex:number, condition: (ch: number) => boolean) : scanner.IToken {
		this.scanner.goBackTo(this.token.offset);
		this.scanner.stream.advance(startIndex);
		const start = this.mark();
		
		this.scanner.stream.advanceWhileChar(condition);
		
		const len = this.scanner.pos() - start.pos;
		const part = { 
			type: this.token.type, 
			offset: start.pos, 
			len: this.scanner.pos() - start.pos, 
			text: this.scanner.substring(start.pos, len)};
		return part;
	}

	private _parseNumeric(integer:boolean = false) : nodes.Node | null{
		if (!this.peek(TokenType.Symbol) || isNaN(Number(this.token.text))) {
			return null;
		}

		if (integer && this.peekRegExp(TokenType.Symbol, /\d*\.\d*/)) {
			return null;
		}
		
		let node = this.createNode(nodes.NodeType.NumericValue);
		if (!this.acceptUnquotedString()) {
			return this.finish(node, ParseError.AddressExpected);
		}
		
		return this.finish(node);
	}
	//#endregion

	//#region handle declaraions	
	private _resolveIncludes(node:nodes.Include) {
		let path = node.getData(nodes.Data.Path);
		if (!path) {
			return;
		}

		if (path.split('.').pop()?.toLocaleLowerCase() !== 'def'){
			this.markError(node, ParseError.DefinitionExpected);
			return; 
		}

		let declaration = this.fileProvider?.get(path);
		if (declaration) {
			this.includes.push(declaration.document.uri);
			(<nodes.Node>declaration?.macrofile).accept(candidate => {
				let found = false;
				if (candidate.type === nodes.NodeType.VariableDef || candidate.type === nodes.NodeType.labelDef) {
					this._visitDeclarations(candidate);
					found = true;
				}
				return !found;
			});
		}
	}

	private _visitDeclarations(node: nodes.Node) : boolean{
		// scan local declarations
		let def = (<nodes.AbstractDeclaration>node);
		let name = def.getName();
		if (name){
			if (node.type === nodes.NodeType.VariableDef) {
				this.declarations.set(name, <nodes.VariableDeclaration>node);
			}
			else if (node.type === nodes.NodeType.labelDef) {
				this.declarations.set(name, <nodes.LabelDeclaration>node);
			}
		}
		return true;
	}
	//#endregion

	//#region Definitions

	public _parseVariableDeclaration(): nodes.VariableDeclaration | null {

		if (!this.peek(TokenType.AT)) {
			return null;
		}
		const node = <nodes.VariableDeclaration>this.create(nodes.VariableDeclaration);	
		this.scanner.goBackTo(this.token.offset +1 ); // Separate @
		this.accept(TokenType.AT);


		const symbol = this.create(nodes.Symbol);
		symbol.referenceTypes = [nodes.ReferenceType.Variable];
		const isUpperCase = this.token.text === this.token.text.toUpperCase();

		if (!this.accept(TokenType.Symbol)){
			return this.finish(node, ParseError.IdentifierExpected);
		}
		node.setSymbol(symbol);

		const value = this.createNode(nodes.NodeType.DeclarationValue);
		
		// Declarations:
		// @var 	1
		// @var 	#1
		// @var 	#1+[1+[1+1]]
		// @var 	G04
		// @var 	G04 P1
		// @var 	G04 P[#1+1]
		// @var 	&A
		
		if (this.peekDelim('+') || this.peekDelim('-')) {
			this.consumeToken();
			if (node.setValue(this._parseNumeric())){
				if (isUpperCase){
					node.valueType = nodes.ValueType.Constant;
				}
				else {
					node.valueType = nodes.ValueType.Numeric;
				}
			}
			else{
				return this.finish(node, ParseError.NumberExpected);
			}
		}		
		else if (this.accept(TokenType.Hash)){
			if (node.setValue(this._parseNumeric(true))) {
				node.valueType = nodes.ValueType.MacroValue;
			}
			else{
				return this.finish(node, ParseError.IntegerExpected);
			}
		}
		else if (this.peek(TokenType.Hash) || this.peek(TokenType.BracketL)) {
			if (node.setValue(this._parseBinaryExpr())){
				if (isUpperCase){
					node.valueType = nodes.ValueType.Constant;
				}
				else {
					node.valueType = nodes.ValueType.Numeric;
				}
			}
			else{
				return this.finish(node, ParseError.NumberExpected);
			}
		}
		else if (node.setValue(this._parseNumeric())) {
			if (isUpperCase){
				node.valueType = nodes.ValueType.Constant;
			}
			else {
				node.valueType = nodes.ValueType.Numeric;
			}
		} 
		// #X_addr 	X000.1
		else if (this.peekRegExp(TokenType.Symbol, /\b(?![mg])[a-z]\d+(\.\d)?\b/i)) {

			node.valueType = nodes.ValueType.Address; 
			const statement = this._parseNcStatement();
			node.addChild(statement);
		}
		// @DELAY 	G04P
		else if (this.peekRegExp(TokenType.Symbol, /\b([gm]\s*\d+\s*)([a-z])?/i) || this.peek(TokenType.Ampersand)) {

			node.valueType = nodes.ValueType.NcCode; 
			const statement = this._parseNcStatement();
			node.addChild(statement);
		}
		else {
			return this.finish(node, ParseError.AddressExpected, [TokenType.NewLine]);
		}
		this.finish(value);
		node.setValue(value);

		return this.finish(node);
	}

	public _parseLabelDeclaration(): nodes.LabelDeclaration | null {

		if (!this.peek(TokenType.GTS)) {
			return null;
		}
		const node = this.create(nodes.LabelDeclaration);		
		this.scanner.goBackTo(this.token.offset +1 ); // Separate >
		this.accept(TokenType.GTS);

		const symbol = this.create(nodes.Symbol);
		symbol.referenceTypes = [nodes.ReferenceType.Label];

		if (!this.accept(TokenType.Symbol)) {
			return this.finish(node, ParseError.IdentifierExpected);
		}
		node.setSymbol(symbol);

		if (node.setValue(this._parseString())){
			node.valueType = nodes.ValueType.String;
		}
		else if (node.setValue(this._parseNumeric())){
			node.valueType = nodes.ValueType.Numeric;
		} 
		else {
			return this.finish(node, ParseError.AddressExpected);
		}
		return this.finish(node);
	}

	private setLocalDeclaration(node:nodes.VariableDeclaration | null) {
		if (node){
			let text:string;
			let symbol = node.getSymbol();
			if (symbol && this.textProvider){
				text = this.textProvider(symbol.offset, symbol.length);
				this.declarations.set(text, node);
			}
		}
	}

	//#endregion

	// #region Global scope 
	public parseMacroFile(textDocument: TextDocument): nodes.MacroFile {
		this.declarations.clear();
		this.includes = [];
		const versionId = textDocument.version;
		const text = textDocument.getText();
		this.textProvider = (offset: number, length: number) => {
			if (textDocument.version !== versionId) {
				throw new Error('Underlying model has changed, AST is no longer valid');
			}
			return text.substr(offset, length);
		};
		let type = textDocument.uri.split('.').pop()?.toLocaleLowerCase() ;
		if (type === 'def'){
			return this.internalParse(text, this._parseDefFile, this.textProvider);
		}
		else if (type === 'lnk'){
			return this.internalParse(text, this._parseLnkFile, this.textProvider);
		}
		else  {
			return this.internalParse(text, this._parseMacroFile, this.textProvider);
		}	

		return this.createNode(nodes.NodeType.Undefined);
	}

	public internalParse<T extends nodes.Node, U extends T>(input: string, parseFunc: () => U, textProvider?: nodes.ITextProvider): U {
		this.scanner.setSource(input);
		this.token = this.scanner.scan();
		const node: U = parseFunc.bind(this)();
		if (node) {
			if (textProvider) {
				node.textProvider = textProvider;
			} else {
				node.textProvider = (offset: number, length: number) => { return input.substr(offset, length); };
			}
		}
		return node;
	}

	public _parseLnkFile(): nodes.MacroFile {
		const node = this.createNode(nodes.NodeType.DefFile);
		let hasMatch = false;
		do {		
			do {
				let child = null;	
				hasMatch = false;
				child = this._parseLinkNode();
				if (child){
					node.addChild(child);
					hasMatch = true;
				}
			} while (hasMatch);
	
			if (this.peek(TokenType.EOF)) {
				break;
			}

			this.consumeToken();
	
		} while (!this.peek(TokenType.EOF));
		return this.finish(node);
	}

	public _parseLinkNode() : nodes.LinkNode | null {
		let node = this.create(nodes.LinkNode);

		if (!this.peekKeyword('file')){
			return null;
		}

		this.consumeToken();

		if (!this.acceptDelim('=')) {
			this.finish(node, ParseError.EqualExpected, [TokenType.NewLine]);
		}

		if (this.peek(TokenType.Symbol)){
			let file = this.create(nodes.Node);
			this.acceptUnquotedString();
			node.setFile(this.finish(file));
		}else{
			this.finish(node, ParseError.EqualExpected, [TokenType.NewLine]);
		}
	
		return this.finish(node);	
	}

	public _parseDefFile(): nodes.MacroFile {
		const node = this.createNode(nodes.NodeType.DefFile);
		let hasMatch = false;
		do {		
			do {
				let child = null;	
				hasMatch = false;
				if (this.peekKeyword('$nolist')) {
					if (this.token.text !== '$NOLIST'){
						return this.finish(node, ParseError.UnknownKeyword, [TokenType.NewLine]);
					}
					this.consumeToken();
				}

				child = this._parseVariableDeclaration() || this._parseLabelDeclaration();

				if (this.peekKeyword('$list')) {
					if (this.token.text !== '$LIST'){
						return this.finish(node, ParseError.UnknownKeyword, [TokenType.NewLine]);
					}
					this.consumeToken();
				}
				if (child){
					node.addChild(child);
					hasMatch = true;
				}
			} while (hasMatch);
	
			if (this.peek(TokenType.EOF)) {
				break;
			}

			let child = this._parseUnexpected();
			if (child){
				node.addChild(child);
				hasMatch = true;
			}
			this.consumeToken();
	
		} while (!this.peek(TokenType.EOF));
		return this.finish(node);
	}

	private _parseMacroFile(): nodes.MacroFile {
		
		const node = this.create(nodes.MacroFile);
		let hasMatch = false;
		do {		
			do {
				let child = null;	
				hasMatch = false;
	
				if (this.peek(TokenType.Dollar)) {
					child = this._parseIncludes();
				}
				else if (this.peek(TokenType.AT)) {
					child = this._parseVariableDeclaration();
					this.setLocalDeclaration(child);
				}
				else if (this.peek(TokenType.GTS)) {
					child = this._parseLabelDeclaration();
					this.setLocalDeclaration(child);
	
				} else if (this.peek(TokenType.Symbol)) {
					child = this._parseFunction();
				}

				if (child){
					node.addChild(child);
					hasMatch = true;
				}
			} while (hasMatch);
	
	
			if (this.peek(TokenType.EOF) || this.peekDelim('%')) {
				break;
			}

			let child = this._parseUnexpected();
			if (child){
				node.addChild(child);
				hasMatch = true;
			}
			else {
				this.consumeToken();
			}
		
		} while (!this.peek(TokenType.EOF));

		node.setData(nodes.Data.Includes, this.includes);
		return this.finish(node);
	}

	/**
	 * Parse includes starting with $
	 */
	private _parseIncludes() : nodes.Include | null {

		if (!this.peekKeyword('$include')) {
			return null;
		}

		const node = <nodes.Include>this.create(nodes.Include);

		// Check upper case
		if (this.token.text !== '$INCLUDE'){
			return this.finish(node, ParseError.UnknownKeyword, [TokenType.NewLine]);
		}

		this.consumeToken(); // $include

		const path = this.createNode(nodes.NodeType.StringLiteral);
		if (!this.acceptUnquotedString()) {
			return this.finish(node, ParseError.DefinitionExpected);
		}

		node.setData(nodes.Data.Path, this.prevToken?.text);
		node.addChild(this.finish(path));

		this.finish(node);
		
		// check includes and load all declarations
		this._resolveIncludes(node);

		return node; 
	}

	//#endregion

	// #region Function
	private _parseFunction(): nodes.Function | null {

		if (!this.token.text.toLocaleLowerCase().startsWith('o')) {
			return null;
		}

		const node = <nodes.Function>this.create(nodes.Function);

		// check if function has the form O1000
		if (!this.acceptKeyword('o')){
	
			// consume o
			this.token = this._parsePart(0, (ch) =>  ch === scanner._o || ch === scanner._O);
			this.consumeToken(); // O

			// check if a number exists
			this.token = this._parsePart(0, (ch) =>  ch >= scanner._0 && ch <= scanner._9);
			if (this.token.len <= 0){
				return null;
			}
		}

		let declaration = this.declarations.get(this.token.text);
		if (declaration) {
			if (!node.setIdentifier(this._parseVariable(declaration, nodes.ReferenceType.Function))) {
				this.markError(node, ParseError.FunctionIdentExpected, [TokenType.NewLine]);
			}
		}
		else if (!node.setIdentifier(this._parseSymbol([nodes.ReferenceType.Variable, nodes.ReferenceType.Function]))) {
			this.markError(node, ParseError.FunctionIdentExpected, [TokenType.NewLine]);
		}

		return this._parseBody(node, this._parseFunctionBody.bind(this));
	}

	/**
	 * Checks whether the end of the current function is reached 
	 */
	private _endOfFunction() : boolean {
		if (!this.token.text.toLocaleLowerCase().startsWith('o') || this.declarations.has(this.token.text)) {
			return false;
		}
		else {
			return true;
		}
	}

	private _parseFunctionBody(): nodes.Node | null {

		if (this._endOfFunction() || this.peek(TokenType.EOF) || this.peekDelim('%')) {
			return null;
		}

		const blockSkip = this._parseBlockSkip();
		
		// Sequence number and Label may leading a statement
		const declaration = this.declarations.get(this.token.text);
		let sequence:nodes.Node | null = null;
		if (!declaration){
			sequence = this._parseSequenceNumber();
		} 
		else if (declaration.type === nodes.NodeType.labelDef) {
			sequence = this._parseLabel(declaration);
		}

		const statement = this._parseControlStatement(this._parseFunctionBody.bind(this))
			|| this._parseMacroStatement()
			|| this._parseNcStatement()
			|| this._parseString()
			|| this._parseSymbol();

		// Form e.g: / N100 G01
		if (blockSkip) {
			if (statement) {
				if (sequence){
					sequence.addChild(statement);
				}
				else {
					blockSkip.addChild(statement);
				}
			}
			if (sequence) {
				blockSkip.addChild(sequence);
			}
			return blockSkip;
		}
		// Form e.g: N100 G01
		else if (sequence){
			if (statement) {
				sequence.addChild(statement);
			}
			return sequence;
		}
		// Form e.g: G01
		else if (statement){
			return statement;
		}

		// Variable and label declaration within a function
		const declaraionType = this._parseVariableDeclaration() || this._parseLabelDeclaration();
		if (declaraionType){
			this.setLocalDeclaration(declaraionType);
			return declaraionType;
		}
		return this._parseUnexpected();
	}

	private _parseConditionalControlBody(parseStatement: () => nodes.Node | null, terminalKeywords:string[]): nodes.Node | null {
		for (const key of terminalKeywords){
			if (this.peekKeyword(key)) {
				return null;
			}
		}
		return parseStatement();
	}

	//#endregion

	//#region Function helper
	private _parseBody<T extends nodes.BodyDeclaration>(node: T, parseStatement: () => nodes.Node | null, hasChildes=true): T {

		// check new line before statement
		if (this._needsLineBreakBefore(node) && !this.peek(TokenType.String) && !this.acceptRegexp(/(\n)+/i)) {
			this.markError(node, ParseError.NewLineExpected);
			this._parseRegexp(/./);
		}	
		this._processNewLines();

		let statement = parseStatement();
		while (node.addChild(statement)) {

			// check new line after statement
			if (this._needsLineBreakBefore(statement) && !this.peek(TokenType.String) && !this.acceptRegexp(/(\n)+/i)) {
				this.markError(node, ParseError.NewLineExpected);
				this.consumeToken();
			}	
			this._processNewLines();

			if (!hasChildes) {
				break;
			}
			statement = parseStatement();	
		}
		
		return this.finish(node);
	}
	
 	//#endregion
	
	//#region Statements
	private _parseSequenceNumber() : nodes.NcStatement | null {

		if (!this.peekRegExp(TokenType.Symbol, /n\d+/i)) {
			return null;
		}

		const node = this.create(nodes.SequenceNumber);		
		const number = this.create(nodes.Node);

 		// Separates N-Number from the rest of the statement
		this.token = this._parsePart(0, (ch) => ch === scanner._n || ch === scanner._N || ch >= scanner._0 && ch <= scanner._9);

 		this.consumeToken();
		node.setNumber(this.finish(number));
 		return this.finish(node);
	}

	private _parseBlockSkip() : nodes.Node | null {

		if (!this.peekDelim('/')) {
			return null;
		}

		const node = this.createNode(nodes.NodeType.BlockSkip);		
 		this.consumeToken();
 		return this.finish(node);
	}

	/**
	 * The NC Parser works as follows:
	 * 
	 * 1. first symbol needs to be a NC code or NC param
	 * 2. Parse a declarated symbol
	 * 3. Parse a NC code 
	 * 4. Parse a NC param 

	 * e.g: 
	 * - G01 G[#symbol] X1 Y-#[symbol]
	 * - CALL SUB_PROGRAM
	 * 
	 */
	private _parseNcStatement() : nodes.NcStatement | null {
		
		if (!this.peekOneOf([
			TokenType.Symbol, 
			TokenType.Ampersand]) || !Number.isNaN(Number(this.token.text))) {
			return null;
		}
		
		const node = this.create(nodes.NcStatement);

		// NC statement can not start with a value variable (#)
		const declaration = this.declarations.get(this.token.text);
		if (declaration && declaration?.valueType !== nodes.ValueType.Address && declaration?.valueType !== nodes.ValueType.NcCode) {
			return this.finish(node, ParseError.InvalidStatement, [TokenType.Symbol, TokenType.NewLine]);
		}

		while (true) {
			let child = this._parseString() || this._parseNcStatementInternal();
			if (child){
				node.addChild(child);
			}
			else {break;}
		}
		// An NC-statement node needs at least one child 
		if (node.hasChildren()){	
			return this.finish(node);
		}
		else {
			return null;
		}
	
	}

	private _parseNcStatementInternal() : nodes.Node | null {
		
		if (this.peek(TokenType.NewLine) || this.peek(TokenType.EOF)) {
			return null;
		}
		
		// Symbol declaration e.g. CALL
		if (this.declarations.has(this.token.text)) {
			return this._parseDeclarationType();
		}

		// Expression
		if (this.peek(TokenType.Hash) || this.peek(TokenType.BracketL) || this.peekDelim('+') || this.peekDelim('-')) {
			return this._parseBinaryExpr();
		}
		
		let mark = this.mark();
		
		this.scanner.stream.goBackTo(this.scanner.pos()-this.token.text.length);

		let hasNumber = false;
		const start = this.scanner.stream.pos();
		const isNcChar = this.isNcCode(this.scanner.stream.peekChar(0));
		const isNcCode = this.token.text.toLocaleLowerCase().charAt(0) === 'g' || this.token.text.toLocaleLowerCase().charAt(0) === 'm';

		// NC-Parameter character A-Z
		if (isNcChar) {
			if (this.token.len > 1) {
				this.scanner.stream.advance(1);
				this.scanner.stream.advanceWhileChar((ch) =>  ch === scanner._WSP);
				// Check NC-Code number
				hasNumber = 0 < this.scanner.stream.advanceWhileChar((ch) =>  ch >= scanner._0 && ch <= scanner._9 || ch === scanner._DOT);
			}
		}

		//  NC-Code/Parameter e.g: G01, P01
		if (isNcChar && hasNumber) {	
			let code:nodes.Node;
			if (isNcCode){
				code = this.create(nodes.NcCode);
			}
			else{
				code = this.create(nodes.NcParameter);
			}
			const len = this.scanner.pos() - start;
			this.token = { type: this.token.type, offset: start, len: this.scanner.pos() - start, text: this.scanner.substring(start, len)};
			this.consumeToken();
			return this.finish(code);		
		}

		this.restoreAtMark(mark);

		//  NC-Code/Parameter e.g:  e.g: G[1], P[1], P#1
		if (isNcChar && !hasNumber && this.token.len === 1 || this.peek(TokenType.Ampersand)) {
			let code:nodes.Node;
			if (isNcCode) {
				code = this.create(nodes.NcCode);
			}
			else {
				code = this.create(nodes.NcParameter);
			}
			

			if (this.accept(TokenType.Ampersand)){
				this.token = this._parsePart(0, (ch) =>  ch >= scanner._a && ch <= scanner._z || ch >= scanner._A && ch <= scanner._Z);
				if (this.token.len !== 1) {
					this.markError(code, ParseError.InvalidStatement, [TokenType.Symbol], [TokenType.NewLine]);
				}
			}

			this.consumeToken();

			// G01 v01 F 11    
			//-365.F    
			// check if parameter or numeric
			mark = this.mark();	
			this.acceptDelim('+') || this.acceptDelim('-'); 

			// NC-Code/Parameter Value e.g: #[1], #symbol
			if (this.peek(TokenType.Hash) || this.peek(TokenType.BracketL) || this.declarations.has(this.token.text)) {
				this.restoreAtMark(mark);
				code.addChild(this._parseBinaryExpr());
				return this.finish(code);
			}
			// NC-Code/Parameter numeric or partly numeric 
			// e.g: 360.F
			else if (this.peek(TokenType.Symbol)){
				const symbol = this.create(nodes.Symbol);
				// Parse numeric part
				this.token = this._parsePart(0, (ch) =>  ch >= scanner._0 && ch <= scanner._9 || ch === scanner._DOT);
				this.consumeToken();
				code.addChild(this.finish(symbol));
			}	
			return this.finish(code);		
		}

		if (!Number.isNaN(Number(this.token.text))){
			this._parseSymbol();
		}


		return null;
	}

	private _parseControlStatement(parseStatement: () => nodes.Node | null): nodes.Node | null {
		return this._parseIfStatement(parseStatement) 
		|| this._parseWhileStatement(parseStatement) 
		|| this._parseGotoStatement(parseStatement);
	}

	/**
	 * A macro statement is of the form #var = term
	 * @param test if true, return null on invalid left statement (left statement needs the form #var)
	 */
	private _parseMacroStatement(test:boolean = true): nodes.Assignment | null {

		if (!this. peek(TokenType.Symbol) && !this.peek(TokenType.Hash)) {
			return null;
		}

		const node = this.create(nodes.Assignment);	
		let declaration = this.declarations.get(this.token.text);
		if (this.peek(TokenType.Symbol)) {		
			if (!declaration || declaration.valueType !== nodes.ValueType.MacroValue) {
				if (test){
					return null;
				}
				else {
					return this.finish(node, ParseError.MacroVariableExpected, [TokenType.NewLine]);
				}
			}
		}

		// ##var is invalid
		if (this.peek(TokenType.Hash) && declaration && declaration.valueType === nodes.ValueType.MacroValue){
			return this.finish(node, ParseError.InvalidStatement, [TokenType.NewLine]);
		} 

		if (this.accept(TokenType.Hash)) {
			declaration = this.declarations.get(this.token.text);
			if (declaration && declaration.valueType === nodes.ValueType.MacroValue){
				return this.finish(node, ParseError.InvalidStatement, [TokenType.NewLine]);
			} 
		}
		
		if (this.peek(TokenType.BracketL)) {
			let expression = this._parseBinaryExpr();
			if (!node.setExpression(expression)) {
				return this.finish(node, ParseError.IdentifierExpected, [TokenType.NewLine]);
			}
		} 
		else if (!node.setVariable(this._parseVariable(declaration))) {
			return this.finish(node, ParseError.MacroVariableExpected, [TokenType.NewLine]);
		}

		if (this.peekDelim('=')) {
			this.consumeToken();

			// right side
			let expression = this._parseBinaryExpr();
			if (!expression){
				return this.finish(node, ParseError.TermExpected);	
			}
			node.setExpression(expression);
		}
		else {
			return this.finish(node, ParseError.EqualExpected, [], [TokenType.NewLine]);
		}

		return this.finish(node); 
	}
	//#endregion

	//#region Conditionals
	private _parseIfConditionalStatement(parseStatement: () => nodes.Node | null): nodes.Node | null {
		return this._parseThenStatement(parseStatement)
			|| this._parseGotoStatement(parseStatement);
	}

	private _parseIfStatement(parseStatement: () => nodes.Node | null): nodes.Node | null {
		if (!this.peekKeyword('if')) {
			return null;
		}

		const node = this.create(nodes.IfStatement);
		this.consumeToken(); // if

		if (!this.accept(TokenType.BracketL)) {
			this.markError(node, ParseError.LeftSquareBracketExpected, [], [TokenType.Symbol, TokenType.BracketR, TokenType.KeyWord, TokenType.NewLine]);
		}

		if (!node.setConditional(this._parseConditionalExpression())) {
			this.markError(node, ParseError.ExpressionExpected, [], [TokenType.KeyWord, TokenType.NewLine]);
		}

		if (!this.accept(TokenType.BracketR)) {
			this.markError(node, ParseError.RightSquareBracketExpected, [], [TokenType.KeyWord, TokenType.Symbol, TokenType.NewLine]);
		}

		if (!this.peekKeyword('then') && !this.peekKeyword('goto')) {
			return this.finish(node, ParseError.ThenGotoExpected, [TokenType.NewLine]);
		}

		if (!this._parseBody(node, () => this._parseIfConditionalStatement(parseStatement))) {
			return this.finish(node, ParseError.BodyExpected);
		}

		return this.finish(node);
	}

	private parseThenTermStatement(): nodes.Node | null {
		return this._parseMacroStatement(false);		
	}
	
	public _parseThenStatement(parseStatement: () => nodes.Node | null): nodes.Node | null {

		if (!this.peekKeyword('then')) {
			return null;
		}

		let pos = this.mark();
		this.consumeToken(); // then

		// IF [] THEN term
		if (this.peek(TokenType.Symbol) || this.peek(TokenType.Hash)) {
			this.restoreAtMark(pos);
			const node = this.create(nodes.ThenTermStatement);
			this.consumeToken(); // then
			this._parseBody(node, this.parseThenTermStatement.bind(this), false);
			
			if (this.acceptKeyword('else')) {
				// ELSE term
				if (this.peek(TokenType.Symbol) || this.peek(TokenType.Hash)) {
					const elseNode = this.create(nodes.ElseStatement);
					this._parseBody(elseNode, this.parseThenTermStatement.bind(this), false);
					node.setElseClause(elseNode);
				} 
				else {
					const elseNode = this.create(nodes.ElseStatement);
					this._parseBody(node, () => this._parseConditionalControlBody(parseStatement, ['endif']));
					node.setElseClause(elseNode);
					
					if (!this.acceptKeyword('endif')) {
						return this.finish(node, ParseError.EndifExpected);
					}
				}
			}
			else{
				this.acceptKeyword('endif'); // optional
			}
			
			return this.finish(node);
		} 
		else {
			this.restoreAtMark(pos);
			const node = this.create(nodes.IfEndifStatement);
			this.consumeToken(); // then

			this._parseBody(node, () => this._parseConditionalControlBody(parseStatement, ['else','endif']));

			let lastChild = node.getChild(node.getChildren().length-1);
			if (lastChild?.type === nodes.NodeType.ThenTerm){
				if (!this.acceptKeyword('endif')) {
					return this.finish(node, ParseError.EndifExpected);
				}
			}

			if (this.acceptKeyword('else')) {
				// ELSE term
				if (this.peek(TokenType.Symbol) || this.peek(TokenType.Hash)) {
					const elseNode = this.create(nodes.ElseStatement);
					this._parseBody(elseNode, this.parseThenTermStatement.bind(this), false);
					node.setElseClause(elseNode);
				} 
				else {
					// ELSE
					// ENDIF
					const elseNode = this.create(nodes.ElseStatement);
					this._parseBody(node, () => this._parseConditionalControlBody(parseStatement, ['endif']));
					node.setElseClause(elseNode);
					
					if (!this.acceptKeyword('endif')) {
						return this.finish(node, ParseError.EndifExpected);
					}
				}
			}
			else {
				if (!this.acceptKeyword('endif')) {
					this.finish(node, ParseError.EndifExpected);
				}
			}

			return this.finish(node);
		}
	}

	private _parseGotoStatement(parseStatement: () => nodes.Node | null): nodes.Node | null {

		if (!this.peekKeyword('goto')) {
			return null;
		}

		const node = <nodes.GotoStatement>this.create(nodes.GotoStatement);
		this.consumeToken(); // goto

		if (this.peek(TokenType.BracketL) || this.peek(TokenType.Hash) ){
			let expression = this._parseBinaryExpr();
			if (!node.setLabel(expression)) {
				this.markError(node, ParseError.ExpressionExpected, [TokenType.NewLine]);
			}
		}
		else if (this.peek(TokenType.Symbol)) {
			let symbol = this._parseDeclarationType() || this._parseSymbol();
			if (!node.setLabel(symbol)) {
				this.markError(node, ParseError.LabelExpected, [TokenType.NewLine]);
			}
		}
		else {
			this.markError(node, ParseError.LabelExpected, [TokenType.NewLine]);
		}

		return this.finish(node);
	}

	private _parseWhileStatement(parseStatement: () => nodes.Node | null): nodes.Node | null {
		if (!this.peekKeyword('while')) {
			return null;
		}

		const node = <nodes.WhileStatement>this.create(nodes.WhileStatement);
		this.consumeToken(); // while

		if (!this.accept(TokenType.BracketL)) {
			this.markError(node, ParseError.LeftSquareBracketExpected, [], [TokenType.Symbol, TokenType.BracketR, TokenType.KeyWord, TokenType.NewLine]);
		}

		if (!node.setConditional(this._parseConditionalExpression())) {
			this.markError(node, ParseError.ExpressionExpected, [], [TokenType.KeyWord, TokenType.Symbol, TokenType.NewLine]);
		}

		if (!this.accept(TokenType.BracketR)) {
			this.markError(node, ParseError.RightSquareBracketExpected, [], [TokenType.KeyWord, TokenType.Symbol, TokenType.NewLine]);
		}

		if (!this.acceptKeyword('do')) {
			this.markError(node, ParseError.DoExpected, [], [TokenType.Symbol, TokenType.NewLine]);
		}

		if (!node.setDoLabel(this._parseDeclarationType()) && !node.setDoLabel(this._parseSymbol())) {
			return this.finish(node, ParseError.LabelExpected, [TokenType.NewLine]);
		}

		this._parseBody(node, () => this._parseConditionalControlBody(parseStatement, ['end']));


		if (!this.acceptKeyword('end')) {
			this.markError(node, ParseError.UnexpectedToken, [TokenType.NewLine], [TokenType.KeyWord]);
			if (!this.acceptKeyword('end')) {
				return this.finish(node, ParseError.EndExpected, [TokenType.NewLine]);
			}
		}
		

		if (!node.setEndLabel(this._parseDeclarationType()) && !node.setEndLabel(this._parseSymbol())) {
			return this.finish(node, ParseError.LabelExpected, [TokenType.NewLine]);
		}

		return this.finish(node);
	}
	//#endregion

	//#region Expressions
	private _parseConditionalExpression(): nodes.Conditional | null {
		let node = this.create(nodes.Conditional);

		if (!node.setLeft(this._parseBinaryExpr())) {
			this.markError(node, ParseError.TermExpected);
		}

		if (node.setConditionalOp(this._parseConditionalOperator())) {
			if (!node.setRight(this._parseBinaryExpr())) {
				this.markError(node, ParseError.TermExpected);
			}
		}
		if (node.setLogicOp(this._parseLogicalOperator())){
			node.setNext(this._parseConditionalExpression());
		}		
		/*else if (!this.peek(TokenType.BracketR)) {
			this.markError(node, ParseError.OperatorExpected);
		}*/

		return this.finish(node);
	}

	private _parseAddressExpression(): nodes.BinaryExpression | null {
		let node = <nodes.BinaryExpression>this.create(nodes.BinaryExpression);	

		let expression = this._parseBinaryExpr();
		if (expression){
			node = this.finish(expression);
		}

		if (this.acceptDelim('.')) {
			expression = this._parseBinaryExpr();
			if (expression){
				node = this.finish(expression);
			}
			else{
				return this.finish(node, ParseError.TermExpected);
			}
		}

		return this.finish(node);
	}

	private _parseBinaryExpr(preparsedLeft?: nodes.BinaryExpression, preparsedOper?: nodes.Node): nodes.BinaryExpression | null {

		let node = this.create(nodes.BinaryExpression);
	
		node.setOperator(this._parseUnaryOperator()); 
		if (this.hasKeywords(['#','['])) {
			this.accept(TokenType.Hash);
		}
		if (!this.peek(TokenType.BracketL)){
			if (!node.setLeft((preparsedLeft || this._parseTerm()))) {
				//return this.finish(node, ParseError.TermExpected);
				return null;
			}

			// if no operator exists we have the form e.g: [true]
			if (!node.setOperator(preparsedOper || this._parseBinaryOperator())) {
				return this.finish(node);
			}

			if (this.hasKeywords(['#','['])) {
				this.accept(TokenType.Hash);
			}
			if (!this.peek(TokenType.BracketL)){			
				if (!node.setRight(this._parseTerm())) {
					this.markError(node, ParseError.TermExpected, [], [TokenType.KeyWord, TokenType.BracketR, TokenType.NewLine] );
				}
			} 
		}
		
		if (this.accept(TokenType.BracketL)) {
			if (!node.addChild(this._parseBinaryExpr())){
				this.markError(node, ParseError.TermExpected, [], [TokenType.KeyWord, TokenType.BracketR, TokenType.NewLine] );
			}
			if (!this.accept(TokenType.BracketR)) {
				this.markError(node, ParseError.RightSquareBracketExpected, [], [TokenType.KeyWord, TokenType.NewLine]);
			}
		}

		node = this.finish(node);
		const operator = this._parseBinaryOperator();
		if (operator) {
			//node = <nodes.BinaryExpression>this._parseBinaryExpr(node, operator);
			node.addChild(this._parseBinaryExpr(node, operator));
		}

		return this.finish(node);
	}
	//#endregion

	//#region Terms

	private _parseTerm(): nodes.Term | null {
		let node = this.create(nodes.Term);

		node.setOperator(this._parseUnaryOperator());

		if (node.setExpression(this._parseDeclarationType() || this._parseFfunc() || this._parseAddress() || this._parseSymbol())) {
			return <nodes.Term>this.finish(node);
		}
		return null;
	}

	private _parseDeclarationType(): nodes.Node | null {

		if (!this.peek(TokenType.Symbol) && !this.peek(TokenType.Hash)) {
			return null;
		}

		let declaration = this.declarations.get(this.token.text);
		if (declaration instanceof nodes.VariableDeclaration || this.peek(TokenType.Hash)){
			return this._parseVariable(declaration);
		}
		else if (declaration instanceof nodes.LabelDeclaration) {
			return this._parseLabel(declaration);
		}
		return null;
	}

	/**
	 * Variable: #symbol; #[symbol]
	 */
	private _parseVariable(declaration:nodes.VariableDeclaration | undefined = undefined, 
		referenceType: nodes.ReferenceType | undefined=undefined): nodes.Variable | null {

		if (!this.peek(TokenType.Symbol) && !this.peek(TokenType.Hash)) {
			return null;
		}

		const node = <nodes.Variable>this.create(nodes.Variable);
		this.accept(TokenType.Hash);
		
		let referenceTypes = [nodes.ReferenceType.Variable];
		if (referenceType){
			referenceTypes.push(referenceType);
		}

		if (!node.setSymbol(this._parseSymbol(referenceTypes))){
			return this.finish(node, ParseError.IdentifierExpected);
		}

		if (declaration && declaration.valueType) {
			//node.setDeclarationType(declaration.valueType);
			//node.setDeclarationValue(declaration.value);
			node.declaration = declaration;
		}
		return this.finish(node);
	}

	private _parseLabel(declaration:nodes.LabelDeclaration | undefined = undefined): nodes.Label | null {

		if (!this.peek(TokenType.Symbol)) {
			return null;
		}

		const node = this.create(nodes.Label);
		if (!node.setSymbol(this._parseSymbol([nodes.ReferenceType.Label]))){
			return this.finish(node, ParseError.IdentifierExpected);
		}
		if (declaration){
			node.declaration = declaration;
		}

		return this.finish(node);
	}

	private _parseAddress() : nodes.Node | null {
		const node = <nodes.Address>this.create(nodes.Address);

		// Address e.g: R[1], R#1, R1.#[1]
		if (this.peekRegExp(TokenType.Symbol, /(^([a-z])(\d*\.)?$)/i)) {
			let mark = this.mark();
			this.consumeToken();
			if (this.peek(TokenType.BracketL) || this.peek(TokenType.Hash)){
				let expression = this._parseAddressExpression();
				if (node.addChild(expression)){
					return this.finish(node);
				}
			}
			this.restoreAtMark(mark); 
		}
		// Address  e.g: R100, R100.1
		else if (this.peekRegExp(TokenType.Symbol, /(^([a-z]\d+)(\.\d+)?$)/i)){
			this.consumeToken();
			return this.finish(node);
		}

		return null;
	}

	/**
	 * Function expression: e.g  SIN[1+1]
	 */
	private _parseFfunc(): nodes.Ffunc | null {
		const node = <nodes.Ffunc>this.create(nodes.Ffunc);
		if (!this.peek(TokenType.Ffunc)){
			return null;
		}

		// pow needs two arguments
		if (this.peekKeyword('pow')){
			this.consumeToken();
			if (!this.accept(TokenType.BracketL)){
				return this.finish(node, ParseError.LeftSquareBracketExpected, [TokenType.NewLine]);
			}
			let expression1 = this._parseBinaryExpr();
			if (!node.setParameter1(expression1)){
				return this.finish(node, ParseError.ParameterExpected, [TokenType.NewLine]);
			}
			if (!this.accept(TokenType.Comma)){
				this.finish(node, ParseError.ParameterExpected, [TokenType.BracketR, TokenType.NewLine]);
			}
			let expression2 = this._parseBinaryExpr();
			if (!node.setParameter2(expression2)){
				return this.finish(node, ParseError.ParameterExpected, [TokenType.BracketR, TokenType.NewLine]);
			}
		}
		// atan, prm optional 2 arguments
		else if (this.peekKeyword('atan') || this.peekKeyword('prm')){
			this.consumeToken();
			if (!this.accept(TokenType.BracketL)){
				return this.finish(node, ParseError.LeftSquareBracketExpected);
			}
			let expression = this._parseBinaryExpr();
			if (!node.setParameter1(expression)){
				return this.finish(node, ParseError.ParameterExpected);
			}
			if (this.accept(TokenType.Comma)){
				let expression = this._parseBinaryExpr();
				if (!node.setParameter2(expression)){
					return this.finish(node, ParseError.ParameterExpected, [TokenType.BracketR, TokenType.NewLine]);
				}
			}
		} 
		else {
			this.consumeToken();

			if (!this.accept(TokenType.BracketL)){
				this.finish(node, ParseError.LeftSquareBracketExpected, [TokenType.BracketR, TokenType.NewLine]);
			}

			let expression = this._parseBinaryExpr();
			if (!node.setParameter1(expression)){
				return this.finish(node, ParseError.ParameterExpected, [TokenType.BracketR, TokenType.NewLine]);
			}
		}

		if (!this.accept(TokenType.BracketR)){
			return this.finish(node, ParseError.RightSquareBracketExpected, [TokenType.NewLine]);
		}

		return this.finish(node);
	}

	private _parseSymbol(referenceTypes?: nodes.ReferenceType[]): nodes.Symbol | null {

		if (!this.peek(TokenType.Symbol)){
			return null;
		}

		const symbol = <nodes.Symbol>this.create(nodes.Symbol);
		if (referenceTypes) {
			symbol.referenceTypes = referenceTypes;
		}
		this.consumeToken();

		return this.finish(symbol);
	}

	//#endregion

	//#region Operators
	private _parseUnaryOperator(): nodes.Node | null {
		if (!this.peekDelim('+') && !this.peekDelim('-')) {
			return null;
		}
		const node = this.create(nodes.Node);
		this.consumeToken();
		return this.finish(node);
	}

	private _parseBinaryOperator(): nodes.Node | null {
		if (this.peekKeyword('and') || this.peekKeyword('or')
			|| this.peekKeyword('xor') || this.peekKeyword('mod')
			|| this.peekDelim('/') || this.peekDelim('*')
			|| this.peekDelim('+') || this.peekDelim('-')
		) {
			const node = this.createNode(nodes.NodeType.Operator);
			this.consumeToken();
			return this.finish(node);
		}
		else {
			return null;
		}
	}

	private _parseConditionalOperator(): nodes.Node | null {
		if (this.peekKeyword('eq') || this.peekKeyword('ne')
			|| this.peekKeyword('le') || this.peekKeyword('ge')
			|| this.peekKeyword('lt') || this.peekKeyword('gt')
		) {
			const node = this.createNode(nodes.NodeType.Operator);
			this.consumeToken();
			return this.finish(node);
		}
		else {
			return null;
		}
	}

	private _parseLogicalOperator(): nodes.Node | null {
		if (this.peekKeyword('||') || this.peekKeyword('&&')) {
			const node = this.createNode(nodes.NodeType.Operator);
			this.consumeToken();
			return this.finish(node);
		}
		else {
			return this._parseBinaryOperator();
		}
	}
	//#endregion

	private _needsLineBreakBefore(node: nodes.Node): boolean {
		switch (node.type) {
			case nodes.NodeType.Include:
				return true;
			case nodes.NodeType.Function:
				return true;
			case nodes.NodeType.While:
				return true;
			case nodes.NodeType.Assignment:
				return true;
			case nodes.NodeType.Goto:
				return true;
			/*case nodes.NodeType.ThenEndif:
				return true;*/
		}
		return false;
	}

	private _parseUnexpected() : nodes.Node | null {
	
		let node:nodes.Node;
		switch (this.token.type) {
			case TokenType.EOF:
			case TokenType.NewLine:
			case TokenType.Whitespace:
			case TokenType.String:	
				break;
			default:
				node = this.createNode(nodes.NodeType.Undefined);
				this.markError(node, ParseError.UnexpectedToken);
				this.consumeToken();
				return this.finish(node);
		}

		return null;
	}
}
