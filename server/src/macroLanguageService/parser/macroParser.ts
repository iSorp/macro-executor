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

	private isNcCode(ch:number): boolean {
		if (ch >= 'a'.charCodeAt(0) && ch <= 'z'.charCodeAt(0) || ch >= 'A'.charCodeAt(0) && ch <= 'Z'.charCodeAt(0)) { 
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


		const symbol = this.create(nodes.Symbol);
		symbol.referenceTypes = [nodes.ReferenceType.Variable];

		if (!this.accept(TokenType.Symbol)){
			return this.finish(node, ParseError.IdentifierExpected);
		}
		node.setSymbol(symbol);

		const value = this.createNode(nodes.NodeType.DeclarationValue);
		if (node.setValue(this.parseNumeric())){
			node.valueType = nodes.ValueType.Numeric;
		}
		else if (this.accept(TokenType.Hash)){
			if (node.setValue(this.parseNumeric())){
				node.valueType = nodes.ValueType.MacroValue;
			}
			else{
				return this.finish(node, ParseError.AddressExpected);
			}
		}
		else if (this.token.text.toLocaleLowerCase().charAt(0) === 'm'){
			node.valueType = nodes.ValueType.MFunc; 
			if (!this.acceptUnquotedString()){
				return this.finish(node, ParseError.AddressExpected);
			}
		}
		else if (this.isNcCode(this.token.text.charCodeAt(0))){
			node.valueType = nodes.ValueType.Address; 
			if (!this.acceptUnquotedString()){
				return this.finish(node, ParseError.AddressExpected);
			}
		}
		else{
			if (!this.acceptUnquotedString()){
				return this.finish(node, ParseError.AddressExpected);
			}
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

		if (node.setValue(this.parseString())){
			node.valueType = nodes.ValueType.String;
		}
		else if (node.setValue(this.parseNumeric())){
			node.valueType = nodes.ValueType.Numeric;
		} 
		else {
			return this.finish(node, ParseError.AddressExpected);
		}
		return this.finish(node);
	}

	private parseString() : nodes.Node | null{

		
		if (!this.peek(TokenType.String) && !this.peek(TokenType.BadString)) {
			return null;
		}
		
		const node = this.createNode(nodes.NodeType.String);
		if (this.accept(TokenType.BadString)){
			return this.finish(node, ParseError.RightParenthesisExpected);
		}
		
		this.consumeToken();

		if (this.accept(TokenType.BadString)){
			return this.finish(node, ParseError.InvalidStatement);
		}

		return this.finish(node);
	}

	private parseNumeric() : nodes.Node | null{
		if (!this.peek(TokenType.Symbol) || isNaN(Number(this.token.text))) {
			return null;
		}
		
		let node = this.createNode(nodes.NodeType.NumericValue);
		if (!this.acceptUnquotedString()) {
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

		const node = this.createNode(nodes.NodeType.DefFile);

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

		if (this._isFunction() || this.peek(TokenType.Dollar) || this.peek(TokenType.AT) || this.peek(TokenType.GTS)) {
			return null;
		}
		let sequence = this._parseSequenceNumber();
		let statement = this._parseControlStatement(this._parseFunctionBody.bind(this))
			|| this._parseMacroStatement()
			|| this._parseNcStatement()
			|| this.parseUnexpected();

		if (sequence && statement){
			sequence.addChild(statement);
			return sequence;
		}
		return sequence || statement;
	}

	private parseUnexpected() : nodes.Node | null{

		let node = this.create(nodes.Node);
		if (this.peekOneOf([TokenType.Delim, TokenType.BracketL, 
			TokenType.BracketR, TokenType.Hash,
			TokenType.AT, TokenType.GTS, 
			TokenType.Ffunc])) {
			this.finish(node, ParseError.UnexpectedToken);	
			this.consumeToken();
			return node;
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
	public _parseSequenceNumber() : nodes.NcStatement | null {

		if (!this.peekRegExp(TokenType.Symbol, /n\d+/i) || this.declarations.has(this.token.text)) {
			return null;
		}
		let node = this.create(nodes.SequenceNumber);
		this.consumeToken();
		return this.finish(node);
	}

	public _parseNcStatement() : nodes.NcStatement | null {
		
		if (!this.peek(TokenType.Symbol) && !this.peek(TokenType.Address) && !this.peek(TokenType.AddressPartial)){
			return null;
		}

		const node = this.create(nodes.NcStatement);
		while (true) {
			let child = this.parseString() || this._parseNcStatementInternal();
			if (child){
				node.addChild(child);
			}
			else {break;}
		}
		this.finish(node);

		return node;
	}

	public _parseNcStatementInternal() : nodes.Node | null {
		
		if (this.peek(TokenType.NewLine) || this.peek(TokenType.EOF)) {
			return null;
		}
		
		// Symbol declaration found eg. CALL
		if (this.declarations.has(this.token.text)) {
			return this._parseDeclarationType();
		}

		// Expression
		// TODO expression only after a parameter
		if (this.peek(TokenType.Hash) || this.peek(TokenType.BracketL) || this.peekDelim('+') || this.peekDelim('-')) {
			let node = this._parseBinaryExpr();
			if (!node){
				let error = this.createNode(nodes.NodeType.Undefined);
				return this.finish(error, ParseError.InvalidStatement);
			}
			else{
				return node;
			}
		}

		let mark = this.mark();
		let hasNumber = false;
		let isComplete = false;
		this.scanner.stream.goBackTo(this.scanner.pos()-this.token.text.length);
		let start = this.scanner.stream.pos();
		let isNcParam = this.isNcCode(this.scanner.stream.peekChar(0));
		let isNcCode = this.token.text.toLocaleLowerCase().charAt(0) === 'g' || this.token.text.toLocaleLowerCase().charAt(0) === 'm';

		// A-Z
		if (isNcParam) {
			if (this.token.len > 1) {
				this.scanner.stream.advance(1);
				// Check NC-Code number
				hasNumber = 0 < this.scanner.stream.advanceWhileChar((ch) =>  ch >= scanner._0 && ch <= scanner._9 || ch === scanner._DOT);
				// Check NC-Code Address e.g G04.1
				isComplete = !(this.scanner.stream.peekChar(-1) === '.'.charCodeAt(0));
			}
		}

		//  NC-Code/Parameter e.g: G01, P01
		if (isNcParam && hasNumber) {	
			let code:nodes.Node;
			if (isNcCode){
				code = this.create(nodes.NcCode);
			}
			else{
				code = this.create(nodes.NcParameter);
			}
			let len = this.scanner.pos() - start;
			this.token = { type: this.token.type, offset: start, len: this.scanner.pos() - start, text: this.scanner.substring(start, len)};
			this.consumeToken();
			return this.finish(code);		
		}

		this.restoreAtMark(mark);


		//  NC-Code/Parameter e.g:  e.g: G[1], P[1], P#1
		if (isNcParam && !hasNumber && this.token.len === 1) {
			let code:nodes.Node;
			if (isNcCode){
				code = this.create(nodes.NcCode);
			}
			else{
				code = this.create(nodes.NcParameter);
			}

			this.consumeToken();

			// NC-Code/Parameter Value e.g: #[1]
			if (this.peek(TokenType.Hash) || this.peek(TokenType.BracketL) || this.peekDelim('+') || this.peekDelim('-')) {
				let expression = this._parseBinaryExpr();
				code.addChild(expression);
				return this.finish(code);
			}
			// NC-Code/Parameter Value e.g: some symbol
			else if (this.peek(TokenType.Symbol)){
				let symbol = this.create(nodes.Symbol);
				this.consumeToken();
				code.addChild(this.finish(symbol));
				return this.finish(code);
			}
			else {
				// error no prameter
				return this.finish(code, ParseError.ParameterExpected);
			}
		}

		// Symbol which was not declarated
		if (this.peek(TokenType.Symbol)) {
			let symbol = this.create(nodes.Symbol);
			this.consumeToken();
			return this.finish(symbol);
		}



		G01 C-365.F#v01

		IF [ypos LE 1] THEN
			IF [ypos EQ 0] THEN ypos = 6
			IF [ypos EQ 1] THEN ypos = 7
		ENDIF
	 	ELSE                   ypos = 2

		let node = this.create(nodes.Node);
		this.finish(node, ParseError.UnexpectedToken);
		this.consumeToken();
		return node;
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

		if (this.peek(TokenType.Symbol)) {
			let declaration = this.declarations.get(this.token.text);
			if (!declaration || declaration.valueType !== nodes.ValueType.MacroValue){
				return null;
			}
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

		const node = this.create(nodes.IfStatement);
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
			const node = this.create(nodes.ThenTermStatement);
			this.consumeToken(); // then
			this._parseBody(node, this.parseIfThenSingleLineStatement.bind(this), false);
			
			if (this.acceptKeyword('else')) {
				// ELSE term
				if (this.peek(TokenType.Symbol) || this.peek(TokenType.Hash)) {
					const elseNode = this.create(nodes.ElseStatement);
					this._parseBody(elseNode, this.parseIfThenSingleLineStatement.bind(this), false);
					node.setElseClause(elseNode);
				} 
				else {
					const elseNode = this.create(nodes.ElseStatement);
					this._parseBody(node, parseStatement);
					node.setElseClause(elseNode);
					
					if (!this.acceptKeyword('endif')) {
						return this.finish(node, ParseError.EndifExpected);
					}
				}
			}
			else{
				this.acceptKeyword('endif');
			}
			
			return this.finish(node);
		} 
		else {
			this.restoreAtMark(pos);
			const node = this.create(nodes.ThenEndifStatement);
			this.consumeToken(); // then

			this._parseBody(node, parseStatement);

			let lastChild = node.getChild(node.getChildren().length-1);
			if (lastChild?.type === nodes.NodeType.ThenTerm){
				if (!this.acceptKeyword('endif')) {
					return this.finish(node, ParseError.EndifExpected);
				}
			}

			if (this.acceptKeyword('else')) {
				const elseNode = this.create(nodes.ElseStatement);
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
	public _parseAddressExpression(): nodes.BinaryExpression | null {
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
	public _parseBinaryExpr(preparsedLeft?: nodes.BinaryExpression, preparsedOper?: nodes.Node): nodes.BinaryExpression | null {

		let node = <nodes.BinaryExpression>this.create(nodes.BinaryExpression);
	
		node.setOperator(this._parseUnaryOperator()); 
		this.accept(TokenType.Hash);

		if (!this.peek(TokenType.BracketL)){
			if (!node.setLeft((<nodes.Node>preparsedLeft || this._parseTerm()))) {
				//return this.finish(node, ParseError.TermExpected);
				return null;
			}

			if (!node.setOperator(preparsedOper || this._parseBinaryOperator())) {
				return this.finish(node);
			}

			this.accept(TokenType.Hash);
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

		if (node.setExpression(this._parseDeclarationType() || this._parseFfunc() || this._parseAddress() || this._parseSymbol())) {
			return <nodes.Term>this.finish(node);
		}
		return null;
	}

	public _parseDeclarationType(): nodes.Node | null {

		if (!this.peek(TokenType.Symbol)) {
			return null;
		}

		let declaration = this.declarations.get(this.token.text);
		if (declaration instanceof nodes.VariableDeclaration){
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

		if (!this.peek(TokenType.Symbol)){
			return null;
		}

		const node = <nodes.Variable>this.create(nodes.Variable);
	
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

		/*		else if (this.isNcCode(this.token.text.charCodeAt(0))){
	node.valueType = nodes.ValueType.Address; 
	if (!this.acceptUnquotedString()){
		return this.finish(node, ParseError.AddressExpected);
	}
}*/



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
				let expression = this._parseAddressExpression();
				if (node.addChild(expression)){
					return this.finish(node);
				}
			}
			this.restoreAtMark(mark); 
		}
		else if (this.peekRegExp(TokenType.Symbol, /(^[a-z]\d+$)/i)){
			this.consumeToken();
			return this.finish(node);
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
		if (this.peekKeyword('||') || this.peekKeyword('&&')
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
