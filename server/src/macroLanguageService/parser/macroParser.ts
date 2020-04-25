/*---------------------------------------------------------------------------------------------
*	Copyright (c) 2020 Simon Waelti
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
import * as scanner from './macroScanner';
import { TokenType, Scanner, IToken, MultiLineStream } from './macroScanner';
import * as nodes from './macroNodes';
import { ParseError, MacroIssueType } from './macroErrors';
import { TextDocument, MacroFileProvider } from '../MacroLanguageTypes';

const _NWL = '\n'.charCodeAt(0);
const _EQS = '='.charCodeAt(0);
const _SPC = ' '.charCodeAt(0);

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

	private imports:string[] = [];
	private declarations:Map<string,nodes.AbstractDeclaration> = new Map<string,nodes.AbstractDeclaration>()

	constructor(private fileProvider?: MacroFileProvider) {
		this.token = { type: TokenType.EOF, offset: -1, len: 0, text: '' };
		this.prevToken = undefined;
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

	public _processWhiteSpaces() {
		while (this.acceptRegexp(/(\s)+/i)) {
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

	public parseMacroFile(textDocument: TextDocument): nodes.MacroFile {
		const versionId = textDocument.version;
		const text = textDocument.getText();
		this.textProvider = (offset: number, length: number) => {
			if (textDocument.version !== versionId) {
				throw new Error('Underlying model has changed, AST is no longer valid');
			}
			return text.substr(offset, length);
		};
		return this.internalParse(text, this._parseMacroFile, this.textProvider);
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

	//#region handle declaraions	
	private resolveIncludes(node:nodes.Include) {
		let uri = node.getData('uri');
		if (!uri) {return;}

		this.imports.push(uri);
		let declaration = this.fileProvider?.get(uri);

		if (declaration) {
			(<nodes.Node>declaration?.macrofile).accept(candidate => {
				let found = false;
				if (candidate.type === nodes.NodeType.VariableDef || candidate.type === nodes.NodeType.labelDef) {
					this.visitDeclarations(candidate);
					found = true;
				}
				return !found;
			});
		}
	}

	private visitDeclarations(node: nodes.Node) : boolean{
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


		const symbol = <nodes.Symbol>this.create(nodes.Symbol);
		symbol.referenceTypes = [nodes.ReferenceType.Variable];

		if (!this.accept(TokenType.Symbol)){
			return this.finish(node, ParseError.IdentifierExpected);
		}
		node.setSymbol(symbol);

		const nr = <nodes.IdentAddress>this.create(nodes.IdentAddress);
		if (!this.acceptUnquotedString()){
			return this.finish(node, ParseError.AddressExpected);
		}
		node.setAddress(nr);

		return this.finish(node);
	}

	public _parseLabelDeclaration(): nodes.LabelDeclaration | null {

		if (!this.peek(TokenType.GTS)) {
			return null;
		}
		const node = <nodes.LabelDeclaration>this.create(nodes.LabelDeclaration);		
		this.scanner.goBackTo(this.token.offset +1 ); // Separate >
		this.accept(TokenType.GTS);

		const symbol = <nodes.Symbol>this.create(nodes.Symbol);
		symbol.referenceTypes = [nodes.ReferenceType.Label];

		if (!this.accept(TokenType.Symbol) || isNaN(Number(this.token.text))) {
			return this.finish(node, ParseError.IdentifierExpected);
		}
		node.setSymbol(symbol);

		const nr = <nodes.IdentAddress>this.create(nodes.IdentAddress);
		if (!this.acceptUnquotedString()){
			return this.finish(node, ParseError.AddressExpected);
		}
		node.setAddress(nr);

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
	/*
					child = this._parseIncludes() 
				|| this._parseDefFile() 
				|| this._parseVariableDefinition() 
				|| this._parseLabelDefinition() 
				|| this._parseFunction()
				|| this._parseSymbol();

				*/


	public _parseMacroFile(): nodes.MacroFile {
		
		const node = this.create(nodes.MacroFile);
		let hasMatch = false;
		do {		
			do {
				let child = null;	
				hasMatch = false;
	
				if (this.peek(TokenType.Dollar)) {
					child = this._parseIncludes() || this._parseDefFile();
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
	
	
			if (this.peek(TokenType.EOF)) {
				break;
			}
	
			this.consumeToken();
	
		} while (!this.peek(TokenType.EOF));
		return this.finish(node);
	}

	/**
	 * Parse includes starting with $
	 */
	public _parseDefFile() : nodes.Node | null {
	
		this.acceptKeyword('$nolist');

		const node = <nodes.Node>this.create(nodes.Node);

		while (true){
			this._processNewLines();
			let def = this._parseVariableDeclaration() || this._parseLabelDeclaration();
			if (def){
				node.addChild(def);
			}
			else {break;}
		}

		this.acceptKeyword('$list');

		return this.finish(node);
	}

	/**
	 * Parse includes starting with $
	 */
	public _parseIncludes() : nodes.Include | null {

		if (!this.peekKeyword('$include')) {
			return null;
		}

		const node = <nodes.Include>this.create(nodes.Include);
		this.consumeToken(); // $include

		const uri = this.createNode(nodes.NodeType.StringLiteral);
		if (!this.acceptUnquotedString()) {
			return this.finish(node, ParseError.DefinitionExpected);
		}
		node.setData('uri', this.prevToken?.text);
		node.addChild(this.finish(uri));

		this.finish(node);
		
		// check includes and load all declarations
		this.resolveIncludes(node);

		return node; 
	}

	//#endregion

	// #region Function
	public _parseFunction(): nodes.Function | null {

		if (!this.peekKeyword('o')) {
			return null;
		}

		const node = <nodes.Function>this.create(nodes.Function);
		this.consumeToken();

		if (!this.peek(TokenType.Symbol)) {
			this.markError(node, ParseError.IdentifierExpected);
		}
		node.setIdentifier(this._parseSymbol([nodes.ReferenceType.Variable, nodes.ReferenceType.Function]));

		return this._parseBody(node, this._parseFunctionBody.bind(this));
	}

	private _isFunction() : boolean {
		if (!this.peekKeyword('o')) {
			return false;
		}
		let mark = this.mark();
		this.consumeToken();
		let ret = false;
		if (this.accept(TokenType.Symbol) && this.accept(TokenType.NewLine)){
			ret = true;
		}
		this.restoreAtMark(mark);
		return ret;
	}

	public _parseFunctionBody(): nodes.Node | null {

		if (this._isFunction()) {
			return null;
		}

		let node = this._parseControlStatement(this._parseFunctionBody.bind(this))
			|| this._parseMacroStatement()
			|| this._parseNcStatement()
			|| this.parseUnexpected();

		return node;
	}

	private parseUnexpected() : nodes.Node | null{

		let node = this.create(nodes.Node);
		if (this.peekOneOf([TokenType.Delim, TokenType.BracketL, 
			TokenType.BracketR, TokenType.Hash,
			TokenType.AT, TokenType.GTS, 
			TokenType.LogigOr, TokenType.LogigAnd, TokenType.Ffunc])) {
			this.consumeToken();
			return this.finish(node, ParseError.UnexpectedToken);
		}

		return null;
	}

	//#endregion

	//#region Function helper
	public _parseBody<T extends nodes.BodyDeclaration>(node: T, parseStatement: () => nodes.Node | null, hasChildes=true): T {

		// check new line before statement
		if (this._needsLineBreakBefore(node) && !this.acceptRegexp(/(\n)+/i)) {
			this.markError(node, ParseError.NewLineExpected);
			this._parseRegexp(/./);
		}	
		this._processNewLines();

		let statement = parseStatement();
		while (node.addChild(statement)) {

			// check new line after statement
			if (this._needsLineBreakBefore(statement) && !this.acceptRegexp(/(\n)+/i)) {
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
	public _parseNcStatement() : nodes.NcStatement | null {
		
		if (!this.peek(TokenType.Symbol) && !this.peek(TokenType.Address) && !this.peek(TokenType.AddressPartial)){
			return null;
		}
		const node = <nodes.NcStatement>this.create(nodes.NcStatement);
		node.addChild(this._parseNcStatementInternal());
		while (node.hasChildren) {
			let child = this._parseNcStatementInternal();
			if (child){
				node.getChild(node.getChildren().length-1)?.addChild(child);
			}
			else {break;}
		}
		return this.finish(node);
	}

	public _parseNcStatementInternal() : nodes.Node | null {
		
		function isNcCode(ch:number): boolean {
			if (ch >= 'a'.charCodeAt(0) && ch <= 'z'.charCodeAt(0) || ch >= 'A'.charCodeAt(0) && ch <= 'Z'.charCodeAt(0)) { 
				return true;
			}
			return false;
		}

		if (this.peek(TokenType.NewLine)) {
			return null;//this._parseNcStatementInternal(node);
		}

		// Symbol declaration found
		if (this.declarations.has(this.token.text)) {
			return this._parseDeclarationType();
		}
		
		// Expression
		if (this.peek(TokenType.Hash) || this.peek(TokenType.BracketL) || this.peekDelim('+') || this.peekDelim('-')) {
			return this._parseBinaryExpr();
		}
	
		let stream = new MultiLineStream(this.token.text);

		// NC-Code or undefined Symbol
		if (isNcCode(stream.peekChar())) {

			stream.advance(1);

			// Check NC-Code number
			let isNumber = 0 < stream.advanceWhileChar((ch) =>  ch >= scanner._0 && ch <= scanner._9 || ch === scanner._DOT);

			// Check NC-Code Address e.g G04.1
			let isIncomplete = stream.peekChar(-1) === '.'.charCodeAt(0);

			// NC Code with decimal point
			if (isNumber && isIncomplete) {
				let code = this.create(nodes.NcCode);
				this.consumeToken();
					
				stream = new MultiLineStream(this.token.text);
				if (stream.peekChar(0) >= scanner._0 && stream.peekChar(0) <= scanner._9){
					this.consumeToken();
					return this.finish(code);	
				}
				else{
					return this.finish(code, ParseError.NumberExpected);
				}
			}

			// Sequence number e.g N1000 or G-Code
			else if (isNumber && !isIncomplete) {
					
				stream.goBackTo(0);
				if (stream.peekChar(0) === 'n'.charCodeAt(0) || stream.peekChar(0) === 'N'.charCodeAt(0)) {
					let sequence = this.create(nodes.SequenceNumber);
					this.consumeToken();
					return this.finish(sequence);	
				}
				else {
					let code = this.create(nodes.NcCode);
					this.consumeToken();
					return this.finish(code);
				}				
			}

			// Parameter e.g P[1]
			if (!isNumber && this.token.len === 1) {
				let parameter = this.create(nodes.NcParameter);
				this.consumeToken();

				if (this.peek(TokenType.Hash) || this.peek(TokenType.BracketL) || this.peekDelim('+') || this.peekDelim('-')) {
					let expression = this._parseBinaryExpr();
					parameter.addChild(expression);
					return this.finish(parameter);
				}
				else {
					// error no prameter
					return this.finish(parameter, ParseError.ParameterExpected);
				}
			}

			// Symbol which was not declarated
			if (!isNumber && this.token.len > 1) {
				let symbol = this.create(nodes.Symbol);
				this.consumeToken();
				return this.finish(symbol);
			}
		}
		// Symbol was not declarated
		else if (this.peek(TokenType.Symbol)) {
			let symbol = this.create(nodes.Symbol);
			this.consumeToken();
			return this.finish(symbol);
		}
		
		return null;
	}

	public _parseControlStatement(parseStatement: () => nodes.Node | null): nodes.Node | null {
		return this._parseIfStatement(parseStatement) 
		|| this._parseWhileStatement(parseStatement) 
		|| this._parseGotoStatement(parseStatement);
	}

	public _parseMacroStatement(): nodes.Assignment | null {

		if (!this.peek(TokenType.Symbol) && !this.peek(TokenType.Hash)) {
			return null;
		}

		if (!this._isMacroStatement()){
			return null;
		}
		const node = <nodes.Assignment>this.create(nodes.Assignment);	

		this.accept(TokenType.Hash);

		if (this.peek(TokenType.BracketL)) {
			let expression = this._parseBinaryExpr();
			if (!node.setExpression(expression)) {
				return this.finish(node, ParseError.IdentifierExpected);
			}
		} 
		else if (!node.setVariable(this._parseVariable())) {
			return this.finish(node, ParseError.IdentifierExpected);
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
			return this.finish(node, ParseError.InvalidStatement, [TokenType.Symbol, TokenType.Delim]);
		}

		return this.finish(node); 
	}

	public _isMacroStatement() : boolean {
		if (!this.peek(TokenType.Symbol) && !this.peek(TokenType.Hash)) {
			return false;
		}
		let mark = this.mark();
		this.scanner.stream.goBackTo(this.token.offset);
		this.scanner.stream.advanceWhileChar((a) => a !== _EQS && a !== _NWL);
		if (this.scanner.stream.peekChar() === _SPC){
			this.scanner.stream.advanceWhileChar((a) => a === _SPC);
		}
		let ret = this.scanner.stream.peekChar() === _EQS;
		this.restoreAtMark(mark);
		return ret;
	}

	//#endregion

	//#region Conditionals
	public _parseIfConditionalStatement(parseStatement: () => nodes.Node | null): nodes.Node | null {
		return this._parseThenStatement(parseStatement)
			|| this._parseGotoStatement(parseStatement);
	}

	public _parseIfStatement(parseStatement: () => nodes.Node | null, 
		parseIfBodyStatement: (parseStatement: () => nodes.Node | null) => nodes.Node | null = this._parseIfConditionalStatement.bind(this)): nodes.Node | null {
		if (!this.peekKeyword('if')) {
			return null;
		}

		const node = <nodes.IfStatement>this.create(nodes.IfStatement);
		this.consumeToken(); // if

		if (!this.accept(TokenType.BracketL)) {
			return this.finish(node, ParseError.LeftSquareBracketExpected);
		}

		if (!node.setConditional(this._parseConditionalExpression())) {
			return this.finish(node, ParseError.ExpressionExpected);
		}

		if (!this.accept(TokenType.BracketR)) {
			return this.finish(node, ParseError.RightSquareBracketExpected);
		}

		if (!this.peekKeyword('then') && !this.peekKeyword('goto')) {
			return this.finish(node, ParseError.UnknownKeyword);
		}

		if (!this._parseBody(node, () => parseIfBodyStatement(parseStatement))){
			return this.finish(node, ParseError.BodyExpected);
		}

		return this.finish(node);
	}

	public parseIfThenSingleLineStatement(): nodes.Node | null {
		return this._parseMacroStatement();	
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
			const node = <nodes.ThenTermStatement>this.create(nodes.ThenTermStatement);
			this.consumeToken(); // then
			this._parseBody(node, this.parseIfThenSingleLineStatement.bind(this), false);
			if (this.acceptKeyword('else')) {
				// ELSE term
				if (this.peek(TokenType.Symbol)) {
					const elseNode = <nodes.BodyDeclaration>this.create(nodes.ElseStatement);
					this._parseBody(elseNode, this.parseIfThenSingleLineStatement.bind(this), false);
					node.setElseClause(elseNode);
				} 
				else {
					const elseNode = <nodes.BodyDeclaration>this.create(nodes.ElseStatement);
					this._parseBody(node, parseStatement);
					node.setElseClause(elseNode);
					
					if (!this.acceptKeyword('endif')) {
						return this.finish(node, ParseError.EndifExpected);
					}
				}
			}

			return this.finish(node);
		} 
		else {
			this.restoreAtMark(pos);
			const node = <nodes.ThenEndifStatement>this.create(nodes.ThenEndifStatement);
			this.consumeToken(); // then

			this._parseBody(node, parseStatement);
			if (this.acceptKeyword('else')) {
				const elseNode = <nodes.BodyDeclaration>this.create(nodes.ElseStatement);
				this._parseBody(node, parseStatement);
				node.setElseClause(elseNode);
			}

			if (!this.acceptKeyword('endif')) {
				return this.finish(node, ParseError.EndifExpected);
			}

			return this.finish(node);
		}
	}

	public _parseGotoStatement(parseStatement: () => nodes.Node | null): nodes.Node | null {

		if (!this.peekKeyword('goto')) {
			return null;
		}

		const node = <nodes.GotoStatement>this.create(nodes.GotoStatement);
		this.consumeToken(); // goto

		const label = <nodes.Label>this.create(nodes.Label);
	
		if (!this.peek(TokenType.Symbol)){
			this.markError(node, ParseError.LabelExpected);
		}

		if (!node.setLabel(this._parseDeclarationType()) && !node.setLabel(this._parseSymbol())) {
			this.markError(node, ParseError.LabelExpected);
		}

		return this.finish(node);
	}

	public _parseWhileStatement(parseStatement: () => nodes.Node | null): nodes.Node | null {
		if (!this.peekKeyword('while')) {
			return null;
		}

		const node = <nodes.WhileStatement>this.create(nodes.WhileStatement);
		this.consumeToken(); // while

		if (!this.accept(TokenType.BracketL)) {
			return this.finish(node, ParseError.LeftSquareBracketExpected);
		}

		if (!node.setConditional(this._parseConditionalExpression())) {
			return this.finish(node, ParseError.ExpressionExpected);
		}

		if (!this.accept(TokenType.BracketR)) {
			return this.finish(node, ParseError.RightSquareBracketExpected);
		}

		if (!this.acceptKeyword('do')) {
			return this.finish(node, ParseError.DoExpected);
		}

		if (!node.setDoLabel(this._parseDeclarationType()) && !node.setDoLabel(this._parseSymbol())) {
			this.markError(node, ParseError.LabelExpected);
		}

		this._parseBody(node, parseStatement);

		if (!this.acceptKeyword('end')) {
			return this.finish(node, ParseError.EndExpected);
		}

		if (!node.setEndLabel(this._parseDeclarationType()) && !node.setDoLabel(this._parseSymbol())) {
			this.markError(node, ParseError.LabelExpected);
		}


		return this.finish(node);
	}
	//#endregion

	//#region Expressions

	public _parseConditionalExpression(): nodes.Conditional | null {
		let node = <nodes.Conditional>this.create(nodes.Conditional);	

		if (!node.setLeft(this._parseBinaryExpr())){
			return this.finish(node, ParseError.TermExpected);
		}

		if (node.setOperator(this._parseConditionalOperator())){
			if (!node.setRight(this._parseBinaryExpr())) {
				return this.finish(node, ParseError.TermExpected);
			}
		}

		if (this._parseLogicalOperator()){
			let coOp = this._parseConditionalExpression();
			if (coOp){
				node = this.finish(coOp);
			}
		}

		return this.finish(node);
	}

	public _parseBinaryExpr(preparsedLeft?: nodes.BinaryExpression, preparsedOper?: nodes.Node): nodes.BinaryExpression | null {

		let node = <nodes.BinaryExpression>this.create(nodes.BinaryExpression);
	
		node.setOperator(this._parseUnaryOperator()); 
		this.accept(TokenType.Hash);

		if (!this.peek(TokenType.BracketL)){
			if (!node.setLeft((<nodes.Node>preparsedLeft || this._parseTerm()))) {
				//return this.finish(node);
				return null;
			}

			if (!node.setOperator(preparsedOper || this._parseBinaryOperator())) {
				return this.finish(node);
			}

			if (!this.peek(TokenType.BracketL)){
				if (!node.setRight(this._parseTerm())) {
					return this.finish(node, ParseError.TermExpected);
				}
			} 
		}
		
		if (this.accept(TokenType.BracketL)) {
			node.addChild(<nodes.BinaryExpression>this._parseBinaryExpr());
			if (!this.accept(TokenType.BracketR)) {
				return this.finish(node, ParseError.RightSquareBracketExpected);
			}
		}

		node = <nodes.BinaryExpression>this.finish(node);
		const operator = this._parseBinaryOperator();
		if (operator) {
			//node = <nodes.BinaryExpression>this._parseBinaryExpr(node, operator);
			node.addChild(this._parseBinaryExpr(node, operator));
		}

		return this.finish(node);
	}
	//#endregion

	//#region Terms

	public _parseTerm(): nodes.Term | null {
		let node = this.create(nodes.Term);

		node.setOperator(this._parseUnaryOperator());

		if (node.setExpression(this._parseDeclarationType() || this._parseFfunc() || this._parseAddress() || this._parseSymbol([nodes.ReferenceType.Undefined]))) {
			return <nodes.Term>this.finish(node);
		}
		return null;
	}

	public _parseDeclarationType(): nodes.Node | null {

		if (!this.peek(TokenType.Symbol) && !this.peek(TokenType.Hash)){
			return null;
		}

		let declaration = this.declarations.get(this.token.text);
		if (declaration instanceof nodes.VariableDeclaration || this.peek(TokenType.Hash)){
			return this._parseVariable();
		}
		else if (declaration instanceof nodes.LabelDeclaration){
			return this._parseLabel();
		}
		return null;
	}

	/**
	 * Variable: #symbol; #[symbol]
	 */
	public _parseVariable(): nodes.Variable | null {

		if (!this.peek(TokenType.Symbol) && !this.peek(TokenType.Hash)){
			return null;
		}

		const node = <nodes.Variable>this.create(nodes.Variable);
		this.accept(TokenType.Hash);

		if (!node.setSymbol(this._parseSymbol([nodes.ReferenceType.Variable]))){
			return this.finish(node, ParseError.IdentifierExpected);
		}
		
		return this.finish(node);
	}

	public _parseLabel(): nodes.Label | null {

		const node = this.create(nodes.Label);
		if (!node.setSymbol(this._parseSymbol([nodes.ReferenceType.Label]))){
			return this.finish(node, ParseError.IdentifierExpected);
		}
		return this.finish(node);
	}

	public _parseSymbol(referenceTypes?: nodes.ReferenceType[]): nodes.Symbol | null {

		// TODO if Reference type undefined, then try to find type:
		//
		// Adress: R100.0 is fixed
		// Symbol R100 is Address, Variable or NC Code
		// Symbol 100.0 is fixed
		// Symbol 100 is Number or Variable

	
		if (!this.peek(TokenType.Symbol)){
			return null;
		}

		const node = <nodes.Symbol>this.create(nodes.Symbol);
		if (referenceTypes) {
			node.referenceTypes = referenceTypes;
		}

		this.consumeToken();

		return this.finish(node);
	}

	public _parseAddress() : nodes.Node | null {
		const node = <nodes.Address>this.create(nodes.Address);

		// e.g: R100.0 [1]; R100.#[1] 	
		if (this.peek(TokenType.Address) || this.peek(TokenType.AddressPartial)) {

			if (this.accept(TokenType.Address)){
				if (this.peek(TokenType.Symbol)){
					let expression = this._parseSymbol();
					node.addChild(expression);
				}
				return this.finish(node);
			}		
			else if (this.accept(TokenType.AddressPartial)) {
				if (this.peek(TokenType.BracketL) || this.peek(TokenType.Hash) || this.peek(TokenType.Symbol)){
					let expression = this._parseBinaryExpr();
					node.addChild(expression);
				}
				else {
					return this.finish(node, ParseError.TermExpected, [TokenType.BracketL, TokenType.Hash]);
				} 
				return this.finish(node);
			}
		} 
		// e.g: R100.0  [1]; R100.#[1] 
		else if (this.peekRegExp(TokenType.Symbol, /(^[a-z]$)/i)){
			let mark = this.mark();
			this.consumeToken();
			if (this.peek(TokenType.BracketL) || this.peek(TokenType.Hash)){
				let expression = this._parseBinaryExpr();
				if (node.addChild(expression)){
					return this.finish(node);
				}
			}
			this.restoreAtMark(mark); 
		}
		return null;
	}

	public _parseFfunc(): nodes.Ffunc | null {
		const node = <nodes.Ffunc>this.create(nodes.Ffunc);
		if (!this.accept(TokenType.Ffunc)){
			return null;
		}

		if (!this.peek(TokenType.BracketL)){
			return this.finish(node, ParseError.LeftSquareBracketExpected);
		}

		// Parameter expression: e.g  SIN[1+1]
		let expression = this._parseBinaryExpr();
		if (!node.setParameter(expression)){
			return this.finish(node, ParseError.ExpressionExpected);
		}
		
		return this.finish(node);
	}

	//#endregion

	//#region Operators
	public _parseUnaryOperator(): nodes.Node | null {
		if (!this.peekDelim('+') && !this.peekDelim('-')) {
			return null;
		}
		const node = this.create(nodes.Node);
		this.consumeToken();
		return this.finish(node);
	}

	public _parseBinaryOperator(): nodes.Node | null {
		if (this.peekSymbol('and') || this.peekSymbol('or')
			|| this.peekSymbol('xor') || this.peekSymbol('mod')
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

	public _parseConditionalOperator(): nodes.Node | null {
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

	public _parseLogicalOperator(): nodes.Node | null {
		if (this.peek(TokenType.LogigOr) || this.peek(TokenType.LogigAnd)
		) {
			const node = this.createNode(nodes.NodeType.Operator);
			this.consumeToken();
			return this.finish(node);
		}
		else {
			return this._parseBinaryOperator();
		}
	}
	//#endregion

	public _needsLineBreakBefore(node: nodes.Node): boolean {
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
			case nodes.NodeType.ThenEndif:
				return true;
		}
		return false;
	}
}
