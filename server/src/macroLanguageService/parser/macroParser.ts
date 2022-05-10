/*---------------------------------------------------------------------------------------------
* Copyright (c) 2020 Simon Waelti
* Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

'use strict';
import { TokenType, IToken, Scanner } from './macroScanner';
import * as nodes from './macroNodes';
import { ParseError, MacroIssueType } from './macroErrors';
import {
	TextDocument, MacroFileProvider, FunctionSignature, 
	functionSignatures 
} from '../macroLanguageTypes';

interface IMark {
	prevParsedToken?: IParsedToken;
	parsedToken: IParsedToken;
	prog: string;
	prev?: IToken;
	curr: IToken;
	pos: number;
	defPos: number;
	def: nodes.AbstractDefinition;
	sym: nodes.Symbol | nodes.Label;
	symListLength: number;
	func: () => boolean;
}

export interface IParsedToken {
	text: string;
	offset: number;
	len: number;
}

export class Parser {
	
	private prevProgToken?: IParsedToken;
	private progToken: IParsedToken;
	private progString: string = '';

	private scanner = new Scanner();
	private defScanner = new Scanner(false);
	private token: IToken;
	private prevToken?: IToken;
	private lastErrorToken?: IToken;
	private definition: nodes.AbstractDefinition;
	private textProvider?: nodes.ITextProvider;
	private definitionMap:Map<string, nodes.AbstractDefinition> = new Map<string, nodes.AbstractDefinition>();
	private symbol: nodes.Symbol | nodes.Label;
	private symbolNodeList:nodes.Symbol[] | nodes.Label[] = [];
	private includes:string[] = [];	
	private subScanFunc: () => boolean = undefined;
	private noDefinitions = false;
	private acceptAnySymbol = false;

	constructor(private fileProvider: MacroFileProvider) {
		this.token = { type: TokenType.EOF, offset: -1, len: 0, text: '' };
		this.prevToken = undefined;
		this.progToken = { offset: -1, len: 0, text: '' };
		this.prevProgToken = undefined;
	}

	public peekKeyword(text: string): boolean {
		return text.length === this.token.text.length && text === this.token.text.toLowerCase();
	}

	public peekAnyKeyword(...keywords: string[]): boolean {
		for (const keyword of keywords) {
			if (this.peekKeyword(keyword)) {
				return true;
			}
		}
		return false;
	}

	public peekDelim(text: string): boolean {
		return TokenType.Delim === this.token.type && text === this.token.text;
	}

	public peek(type: TokenType): boolean {
		return type === this.token.type;
	}

	public peekAny(...tokens: TokenType[]): boolean {
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
		this.scan();
	}

	public addProgToken() {
		this.prevProgToken = this.progToken;
		this.progToken = {
			text: this.token.text,
			offset: this.progString.length,
			len: this.token.text.length,
		};
		this.progString += this.token.text;
	}

	public addSymbolNodes() : nodes.Node {
		const node = this.createNode(nodes.NodeType.SymbolRoot);
		for (const symbol of this.symbolNodeList) {
			node.addChild(symbol);
		}

		return this.finish(node);
	}

	private scanDefinition() {
		const tk = this.defScanner.scan();
		if (tk?.type !== TokenType.EOF) {
			// The token points to the symbol location
			tk.len = this.token.len;
			tk.offset = this.token.offset;
			this.token = tk;
			this.addProgToken();
			return true;
		}
		
		return false;
	}

	private scanNonSymbol() : boolean {
		const tk = this.scanner.scanNonSymbol();
		if (tk) {
			if (tk.type === TokenType.Symbol) {
				this.scanner.goBackTo(this.token.offset+this.token.len);
				return false;
			}
			else if (tk.type !== TokenType.EOF) {
				this.token = tk;
				this.addProgToken();
				return true;
			}
		}
		return false;
	}

	public scan(): IToken {

		if (this.subScanFunc?.call(this)) {
			return;
		}

		this.token = this.scanner.scan();
		this.definition = undefined;
		this.subScanFunc = undefined;
		this.symbol = undefined;

		if (this.token.type !== TokenType.Symbol || (this.token.type === TokenType.Symbol && this.acceptAnySymbol)) {
			this.addProgToken();
			return;
		}

		if (!this.noDefinitions) {
			const definition = this.definitionMap.get(this.token.text);
			if (definition) {
				const value = definition.getValue()?.getText();
				if (!value) {
					return;
				}

				let symbol: nodes.Symbol | nodes.Label;
				if (definition.type === nodes.NodeType.SymbolDef) {
					symbol = new nodes.Symbol(this.token.offset, this.token.len, -1, -1, definition);
				}
				else {
					symbol = new nodes.Label(this.token.offset, this.token.len, -1, -1, definition);
				}

				this.symbolNodeList.push(symbol);
				this.symbol = symbol;
				this.definition = definition;
				this.defScanner.setSource(value);
				this.subScanFunc = this.scanDefinition.bind(this);
				this.scanDefinition();

				return;
			}
		}
		
		// Scan non symbol tokens
		const pos = this.scanner.pos();
		this.scanner.goBackTo(this.token.offset);
		this.subScanFunc = this.scanNonSymbol.bind(this);
		if (!this.scanNonSymbol()) {
			this.scanner.goBackTo(pos);
			this.addProgToken();
		}
	}

	public mark(): IMark {
		return {
			prevParsedToken: this.prevProgToken,
			parsedToken: this.progToken,
			prog: this.progString,
			prev: this.prevToken,
			curr: this.token,
			pos: this.scanner.pos(),
			defPos: this.defScanner.pos(),
			def: this.definition,
			sym: this.symbol,
			symListLength: this.symbolNodeList.length,
			func: this.subScanFunc
		};
	}

	public restoreAtMark(mark: IMark): void {

		this.prevProgToken = mark.prevParsedToken;
		this.progToken = mark.parsedToken;
		this.progString = mark.prog;

		this.prevToken = mark.prev;
		this.token = mark.curr;
		this.scanner.goBackTo(mark.pos);
		this.definition = mark.def;
		this.symbol = mark.sym;
		this.symbolNodeList.splice(mark.symListLength);
		this.subScanFunc = mark.func;
		if (this.definition?.value) {
			this.defScanner.setSource(this.definition.value.getText());
			this.defScanner.goBackTo(mark.defPos);
		}
	}

	public try(func: () => nodes.Node | null): nodes.Node | null {
		const pos = this.mark();
		const node = func();
		if (!node || node.isErroneous(true)) {
			this.restoreAtMark(pos);
			return null;
		}
		return node;
	}

	public tryEol(func: () => nodes.Node | null) {
		const pos = this.mark();
		const node = this.try(func);
		if (node) {
			if (this.peekAny(TokenType.Whitespace, TokenType.NewLine, TokenType.EOF)) {
				return node;  
			}
		}
		this.restoreAtMark(pos);
		return null;
	}

	public hasKeywords(...keywords: string[]): boolean {
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
		
	public accept(type: TokenType) {
		if (type === this.token.type) {
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

	private acceptUnquotedString(): boolean {
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

	public processNewLines() {
		while (this.accept(TokenType.NewLine)) {}
	}

	public processWhiteSpaces() {
		while (this.accept(TokenType.Whitespace)) {}
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
				this.scan();
			}
		}
	}

	public createNode(nodeType: nodes.NodeType): nodes.Node {
		const node = new nodes.Node(this.token.offset, this.token.len, this.progToken.offset, this.progToken.len, nodeType);
		if (this.symbol) {
			if (node.offset === this.symbol.offset && node.length === this.symbol.length) {
				node.symbol = this.symbol;
			}
		}
		return node;
	}

	public create<T extends nodes.Node>(ctor: nodes.NodeConstructor<T>): T {
		const node = new ctor(this.token.offset, this.token.len, this.progToken.offset, this.progToken.len);
		if (this.symbol) {
			if (node.offset === this.symbol.offset && node.length === this.symbol.length) {
				node.symbol = this.symbol;
			}
		}
		return node;
	}

	public finish<T extends nodes.Node>(node: T, error?: MacroIssueType, resyncTokens?: TokenType[], resyncStopTokens?: TokenType[]): T {
		if (error) {
			this.markError(node, error, resyncTokens, resyncStopTokens);
		}
		// set the node end position
		if (this.prevToken) {
			// length with more elements belonging together
			const prevEnd = this.prevToken.offset + this.prevToken.len;
			node.length = prevEnd > node.offset ? prevEnd - node.offset : 0; // offset is taken from current token, end from previous: Use 0 for empty nodes
		}

		if (this.prevProgToken) {
			const prevEnd = this.prevProgToken.offset + this.prevProgToken.len;
			node.progLength = prevEnd > node.progOffset ? prevEnd - node.progOffset : 0;
		}
		
		return node;
	}

	public markError<T extends nodes.Node>(node: T, error: MacroIssueType, resyncTokens?: TokenType[], resyncStopTokens?: TokenType[]): void {
		if (this.token !== this.lastErrorToken) { // do not report twice on the same token
			if (this.symbol) {
				node.addIssue(new nodes.Marker(node, ParseError.SymbolError, nodes.Level.Error, undefined, this.token.offset, this.token.len));
			}

			if (this.token.type === TokenType.NewLine) {
				node.addIssue(new nodes.Marker(node, error, nodes.Level.Error, undefined, this.prevToken.offset + this.prevToken.len, 1));
			}
			else {
				node.addIssue(new nodes.Marker(node, error, nodes.Level.Error, undefined, this.token.offset, this.token.len));
			}

			this.lastErrorToken = this.token;
		}
		if (resyncTokens || resyncStopTokens) {
			this.resync(resyncTokens, resyncStopTokens);
		}
	}

	//#region handle definitions
	private resolveIncludes(path:string) {

		let definition = this.fileProvider?.get(path);
		if (definition) {
			this.includes.push(definition.document.uri);
			(<nodes.Node>definition?.macrofile).accept(candidate => {
				let found = false;
				if (candidate.type === nodes.NodeType.SymbolDef || candidate.type === nodes.NodeType.LabelDef) {
					this._visitDefinitions(candidate);
					found = true;
				}
				return !found;
			});
		}
	}
	
	private _visitDefinitions(node: nodes.Node) : boolean{
		// scan local definitions
		let def = (<nodes.AbstractDefinition>node);
		let name = def.getName();
		if (name) {
			if (node.type === nodes.NodeType.SymbolDef) {
				this.definitionMap.set(name, <nodes.SymbolDefinition>node);
			}
			else if (node.type === nodes.NodeType.LabelDef) {
				this.definitionMap.set(name, <nodes.LabelDefinition>node);
			}
		}
		return true;
	}
	//#endregion


	// #region Global scope 
	public parseMacroFile(textDocument: TextDocument): nodes.MacroFile {
		this.definitionMap.clear();
		this.symbolNodeList = [];
		this.includes = [];
		this.progString = '';
		const versionId = textDocument.version;
		const text = textDocument.getText();
		this.textProvider = (offset: number, length: number) => {
			if (textDocument.version !== versionId) {
				throw new Error(`Underlying model has changed, AST is no longer valid: \n ${textDocument.uri}`);
			}
			return text.substring(offset, offset+length);
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
	}

	public internalParse<T extends nodes.Node, U extends T>(input: string, parseFunc: () => U, textProvider?: nodes.ITextProvider): U {	
		this.scanner.setSource(input);
		this.scan();
		const node: U = parseFunc.bind(this)();
		const prog = this.progString;
		if (node) {
			if (textProvider) {
				node.textProvider = textProvider;
			} else {
				node.textProvider = (offset: number, length: number) => { return input.substring(offset, offset+length); };
			}

			node.textProviderProg = (offset: number, length: number) => {
				return prog.substring(offset, offset+length);
			};
		}
		return node;
	}

	public _parseDefFile(): nodes.MacroFile {
	
		const node = this.createNode(nodes.NodeType.DefFile);
		let hasMatch = false;
		do {		
			do {
				hasMatch = false;

				const child = this._parseControlCommands('$nolist', '$list') || this._parseSymbolDefinition() || this._parseLabelDefinition();
				if (child) {
					
					child.addChild(this._parseString());
				
					// check new line after statement
					if (this._needsLineBreakAfter(child) && !this.peekAny(TokenType.NewLine, TokenType.EOF)) {
						this.markError(child, ParseError.NewLineExpected);
					}
			
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

	public _parseLnkFile(): nodes.MacroFile {
		const node = this.createNode(nodes.NodeType.DefFile);
		let hasMatch = false;
		do {			
			if (this.peek(TokenType.EOF)) {
				break;
			}

			this.consumeToken();
	
		} while (!this.peek(TokenType.EOF));
		return this.finish(node);
	}

	public _parseMacroFile(): nodes.MacroFile {

		let node = this.create(nodes.MacroFile);
		let hasMatch = false;
		do {		
			do {
				let child = null;	
				hasMatch = false;
	
				if (this.peekAny(TokenType.Dollar, TokenType.AT, TokenType.GTS)) {
					child = this._parseMacroFileScope();
				}
				else if (this.peek(TokenType.Prog)) {
					child = this._parseProgram();
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
			if (child) {
				node.addChild(child);
				hasMatch = true;
			}
			else {
				this.consumeToken();
			}
		
		} while (!this.peek(TokenType.EOF));

		node.setData(nodes.Data.Includes, this.includes);
		node.addChild(this.addSymbolNodes());
		node = this.finish(node);
		return node;
	}

	public _parseMacroFileScope(): nodes.Node | null {
	
		let node:nodes.Node | null = null;
		if (this.peek(TokenType.Dollar)) {
			node = this._parseIncludes() || this._parseControlCommands('$eject');
		}
		else if (this.peek(TokenType.AT)) {
			node = this._parseSymbolDefinition();
			this._setLocalDefinition(<nodes.SymbolDefinition>node);
		}
		else if (this.peek(TokenType.GTS)) {
			node = this._parseLabelDefinition();
			this._setLocalDefinition(<nodes.LabelDefinition>node);

		} else if (this.peek(TokenType.Symbol)) {
			node = this._parseProgram();
		}

		node.addChild(this._parseString());

		// check new line after statement
		if (this._needsLineBreakAfter(node) && !this.peekAny(TokenType.NewLine, TokenType.EOF)) {
			this.markError(node, ParseError.NewLineExpected);
		}	

		return node;
	}

	/**
	 * Parse includes starting with $
	 */
	public _parseIncludes() : nodes.Include | null {

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

		node.addChild(this.finish(path));

		if (this.textProvider) {
			const pathstr = this.textProvider(path.offset, path.length);
			if (pathstr.split('.').pop()?.toLocaleLowerCase() === 'def') {
				this.resolveIncludes(pathstr);
			}
			else {
				this.markError(path, ParseError.DefinitionExpected);
			}
		}
		return this.finish(node); 
	}
	//#endregion

	//#region Definitions
	public _parseSymbolDefinition(): nodes.SymbolDefinition | null {

		if (!this.peek(TokenType.AT)) {
			return null;
		}
		const node = <nodes.SymbolDefinition>this.create(nodes.SymbolDefinition);	
		this.noDefinitions = true;
		this.acceptAnySymbol = true;
		this.accept(TokenType.AT);

		this.acceptAnySymbol = false;

		const symbol = this.create(nodes.Symbol);
		const isUpperCase = this.token.text === this.token.text.toUpperCase();

		if (!this.accept(TokenType.Symbol)) {
			return this.finish(node, ParseError.IdentifierExpected);
		}
		node.setIdentifier(symbol);

		this.processWhiteSpaces();
		this.scanner.ignoreWhitespace = false;

		let statement = this.tryEol(this._parseNumber.bind(this, false, true))
			|| this.tryEol(this._parseString.bind(this))
			|| this.tryEol(this._parseAddress.bind(this))		
			|| this.tryEol(this._parseNcParam.bind(this))	// Code, Param or Address	
			|| this.tryEol(this._parseNcStatement.bind(this))
			|| this.tryEol(this._parseSequenceNumber.bind(this))
			|| this.tryEol(this._parseMacroStatement.bind(this, false))
			|| this.tryEol(this._parseGotoStatement.bind(this));

		if (!statement) {
			if (!this.peekAny(TokenType.Whitespace, TokenType.NewLine, TokenType.EOF)) {
				statement = this.create(nodes.Node);
				while (!this.peekAny(TokenType.Whitespace, TokenType.NewLine, TokenType.EOF)) {
					this.consumeToken();
				}
				this.finish(statement);
			}
			else {
				this.markError(node, ParseError.AddressExpected, [], [TokenType.NewLine]);
			}
		}

		const pos = this.mark();
		this.processWhiteSpaces();
		if (!this.peekAny(TokenType.NewLine, TokenType.EOF, TokenType.String)) {
			this.markError(node, ParseError.InvalidStatement, [], [TokenType.NewLine]);
		}
		else {
			this.restoreAtMark(pos);
		}

		if (statement?.type === nodes.NodeType.Numeric && isUpperCase) {
			node.attrib = nodes.ValueAttribute.Constant;
		}

		this.scanner.ignoreWhitespace = true;
		this.noDefinitions = false;
		node.setValue(statement);
		this.finish(node);
		this.processWhiteSpaces();	
		return node;
	}

	public _parseLabelDefinition(): nodes.LabelDefinition | null {

		if (!this.peek(TokenType.GTS)) {
			return null;
		}
		const node = this.create(nodes.LabelDefinition);		

		this.noDefinitions = true;
		this.acceptAnySymbol = true;
		this.accept(TokenType.GTS);

		this.acceptAnySymbol = false;

		const label = this.create(nodes.Label);

		if (!this.accept(TokenType.Symbol)) {
			return this.finish(node, ParseError.IdentifierExpected);
		}
		node.setIdentifier(label);

		this.processWhiteSpaces();
		this.scanner.ignoreWhitespace = false;

		let statement = this.tryEol(this._parseNumber.bind(this, true))
			|| this.tryEol(this._parseString.bind(this)); 

		if (!statement) {
			if (!this.peekAny(TokenType.Whitespace, TokenType.NewLine, TokenType.EOF)) {
				statement = this.create(nodes.Node);
				while (!this.peekAny(TokenType.Whitespace, TokenType.NewLine, TokenType.EOF)) {
					this.consumeToken();
				}
				this.finish(statement);
			}
			else {
				this.markError(node, ParseError.AddressExpected, [], [TokenType.NewLine]);
			}
		}

		const pos = this.mark();
		this.processWhiteSpaces();
		if (!this.peekAny(TokenType.NewLine, TokenType.EOF, TokenType.String)) {
			this.markError(node, ParseError.InvalidStatement, [], [TokenType.NewLine]);
		}
		else {
			this.restoreAtMark(pos);
		}

		this.scanner.ignoreWhitespace = true;
		this.noDefinitions = false;
		node.setValue(statement);
		this.finish(node);
		this.processWhiteSpaces();	
		return node;
	}

	public _setLocalDefinition(node:nodes.AbstractDefinition | null) {
		if (node) {
			let text:string;
			let symbol = node.getIdentifier();
			if (symbol && this.textProvider) {
				text = this.textProvider(symbol.offset, symbol.length);
				node.textProvider = this.textProvider;
				this.definitionMap.set(text, node);
			}
		}
	}

	//#endregion

	// #region Program

	public _parseProgram(): nodes.Program | null {

		if (!this.peek(TokenType.Prog)) {
			return null;
		}

		const node = <nodes.Program>this.create(nodes.Program);
		this.consumeToken(); // O

		if (this.symbol) {
			this.symbol.attrib = nodes.ValueAttribute.Program;
		}
		
		if (!node.setIdentifier(this._parseUnknownSymbol(this._parseNumber(true, false, nodes.ReferenceType.Program)))) {
			this.markError(node, ParseError.FunctionIdentExpected, [], [TokenType.NewLine]);
		}

		node.addChild(this._parseString());

		return this._parseBody(node, this._parseProgramBody.bind(this));
	}

	public _parseProgramBodyStatement() : nodes.Node | null {
		return this._parseUnknownSymbol(this._parseControlStatement(this._parseProgramBody.bind(this))
			|| this._parseMacroStatement()
			|| this._parseNcStatement()
			|| this._parseString()
			|| this._parseFcommand()) 
			|| this._parseNNAddress();
	}

	public _parseProgramBody(): nodes.Node | null {

		// End of Program
		if (this.peek(TokenType.Prog) || this.peek(TokenType.EOF) || this.peekDelim('%')) {
			return null;
		}
		
		// blocksip, sequence number and Label may leading a statement
		let statement = this._parseBlockFunction();
		let sequence = this._parseSequenceNumber();

		statement ? statement.addChild(sequence) : statement = sequence;
		if (statement) {
			if (!this.peek(TokenType.NewLine)) {
				this._parseBody(statement,  this._parseProgramBodyStatement.bind(this), false);
			}
			return statement;
		}
		
		statement = this._parseProgramBodyStatement();
		if (statement) {
			return statement;
		}

		// Variable and label declaration within a function
		const declaraionType = this._parseSymbolDefinition() || this._parseLabelDefinition();
		if (declaraionType) {
			declaraionType.addChild(this._parseString());
			this._setLocalDefinition(declaraionType);
			return declaraionType;
		}
		return this._parseUnexpected();
	}

	public _parseConditionalControlBody(parseStatement: () => nodes.Node | null, terminalKeywords:string[]): nodes.Node | null {
		//this.processNewLines();
		for (const key of terminalKeywords){
			if (this.peekKeyword(key)) {
				return null;
			}
		}
		return parseStatement?.call(this);
	}

	//#endregion

	//#region Function helper
	public _parseBody<T extends nodes.BodyDeclaration>(node: T, parseStatement: () => nodes.Node | null, hasChildes=true): T {
		
		if (this._needsLineBreakBefore(node) && !this.peekAny(TokenType.NewLine, TokenType.EOF)) {
			this.markError(node, ParseError.NewLineExpected, [], [TokenType.NewLine]);
		}

		this.processNewLines();
		
		let statement = parseStatement?.call(this);
		while (node.addChild(statement)) {
			if (this._needsLineBreakAfter(statement) && !this.peekAny(TokenType.NewLine, TokenType.EOF)) {
				this.markError(statement, ParseError.NewLineExpected, [], [TokenType.NewLine]);
			}		
			if (!hasChildes) {
				this.finish(node);
				this.processNewLines();
				return node;
			}	
			this.processNewLines();
			statement = parseStatement?.call(this);
		}
		return this.finish(node);
	}
	
 	//#endregion
	
	//#region Statements
	/**
	 * e.g N100G01
	 */
	public _parseNNAddress() : nodes.Node | null {

		if (!this.peek(TokenType.NNAddress)) {
			return null;
		}

		const node = this.createNode(nodes.NodeType.NNAddress);
		this.consumeToken();

		if (this.peekAny(TokenType.Number, TokenType.Hash, TokenType.BracketL)) {
			if (!node.addChild(this._parseBinaryExpr())) {
				this.markError(node, ParseError.InvalidStatement);
			}
			if (this.peekAny(TokenType.Parameter)) {
				if (!node.addChild(this._parseAddress())) {
					this.markError(node, ParseError.TermExpected, [TokenType.NewLine]);
				}
			}
		}
		else {
			this.markError(node, ParseError.InvalidStatement);
		}


		return this.finish(node);
	}
	

	public _parseSequenceNumber() : nodes.Node | null {

		if (!this.peek(TokenType.Sequence) && !(this.peek(TokenType.Number) && this.symbol?.defType === nodes.NodeType.LabelDef)) {
			return null;
		}

		const node = this.create(nodes.SequenceNumber);
		this.accept(TokenType.Sequence);

		if (!node.setNumber(this._parseNumber(true, false, nodes.ReferenceType.JumpLabel, nodes.ReferenceType.Sequence))) {
			this.finish(node, ParseError.NumberExpected, [], [TokenType.NewLine]);
		}
 		return this.finish(node);
	}

	public _parseBlockFunction() : nodes.Node | null {

		if (!this.peekDelim('/')) {
			return null;
		}

		const nodeBs = this.createNode(nodes.NodeType.BlockSkip);		
		const nodeBd = this.create(nodes.BlockDel);
 		this.consumeToken();

		if (this.peek(TokenType.Number)) {
			nodeBd.setNumber(this._parseNumber(true));
			return this.finish(nodeBd);
		}

 		return this.finish(nodeBs);
	}

	public _parseControlCommands(...keywords:string[]) : nodes.Node {
		
		if (!this.peekAnyKeyword(...keywords)) {
			return;
		}

		const node = this.createNode(nodes.NodeType.ControlStatement);

		// Check upper case
		if (this.token.text !== this.token.text.toLocaleUpperCase()) {
			return this.finish(node, ParseError.UnknownKeyword, [TokenType.NewLine]);
		}

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
	public _parseNcStatement() : nodes.Node | null {
		
		if (!this.peekAny(TokenType.Parameter, TokenType.Ampersand)) {
			return null;
		}

		const node = this.create(nodes.NcStatement);
		let first = this.symbol !== undefined;
		while (true) {
			let child = this._parseString(true) || this._parseNcStatementInternal();
			if (child) {
				node.addChild(child);
				if (first && node.symbol) {
					first = false;
					if (child instanceof nodes.NcCode) {
						if (child.codeType === nodes.CodeType.G) {
							node.symbol.attrib = nodes.ValueAttribute.GCode;
						}
						else if (child.codeType === nodes.CodeType.M) {
							node.symbol.attrib = nodes.ValueAttribute.MCode;
						}
					}
					else {
						node.symbol.attrib = nodes.ValueAttribute.Parameter;
					}
				}
			}
			else {break;}
		}
		// An NC-statement node needs at least one child 
		if (node.hasChildren()) {	
			return this.finish(node);
		}
		else {
			return null;
		}
	}

	public _parseNcStatementInternal() : nodes.Node | null {
		
		if (this.peek(TokenType.NewLine) || this.peek(TokenType.EOF)) {
			return null;
		}

		return this._parseUnknownSymbol(this._parseNcCode() 
			|| this._parseNcParam() 
			|| this._parseNumber());
	}

	public _parseNcCode(): nodes.Node {
		
		if (!this.peek(TokenType.Parameter)) {
			return null;
		}

		// G,M Code
		const mark = this.mark();
		const node = this.create(nodes.NcCode);
		if (this.token.text.toLocaleLowerCase().charAt(0) === 'g') {
			node.codeType = nodes.CodeType.G;
		}
		else if (this.token.text.toLocaleLowerCase().charAt(0) === 'm') {
			node.codeType = nodes.CodeType.M;
		}
		else {
			return null;
		}

		this.consumeToken();
		if (this.peek(TokenType.Number)) {
			node.addChild(this._parseNumber());
			return this.finish(node);
		}
		else if (this.peek(TokenType.Hash)) {
			const variable = this._parseVariable();
			if (node.addChild(variable)){
				return this.finish(node);
			}
		}
		else if (this.peek(TokenType.BracketL)) {
			const expr = this._parseBinaryExpr();
			if (node.addChild(expr)){
				return this.finish(node);
			}
		}
		else if (node.addChild(this._parseUnknownSymbol(this._parseVariable() || this._parseNumber()))) {
			return this.finish(node);
		}
		this.restoreAtMark(mark); 

		return null;
	}

	public _parseNcParam(): nodes.Node {

		// NC Parameter
		if (!this.peek(TokenType.Parameter) && !this.peek(TokenType.Ampersand)) {
			return null;
		}

		const node = this.create(nodes.Parameter);

		// axis number command
		this.accept(TokenType.Ampersand); 
		
		this.consumeToken();

		this.acceptDelim('+') || this.acceptDelim('-'); 
	
		if (this.peek(TokenType.Number)) {
			node.addChild(this._parseNumber());
			return this.finish(node);
		}
		else if (this.peek(TokenType.Hash)) {
			const variable = this._parseVariable();
			if (node.addChild(variable)){
				return this.finish(node);
			}
		}
		else if (this.peek(TokenType.BracketL)) {
			const expr = this._parseBinaryExpr();
			if (node.addChild(expr)){
				return this.finish(node);
			}
		}
		else if (node.addChild(this._parseUnknownSymbol(this._parseVariable() || this._parseNumber()))) {
			return this.finish(node);
		}

		return this.finish(node);
	}

	public _parseControlStatement(parseStatement: () => nodes.Node | null): nodes.Node | null {
		return this._parseIfStatement(parseStatement) 
		|| this._parseWhileStatement(parseStatement) 
		|| this._parseGotoStatement();
	}

	public _parseMacroStatement(assignment_required:boolean = true): nodes.Node | null {

		if (!this.peek(TokenType.Hash)) {
			return null;
		}

		const node = this.create(nodes.Assignment);		
		const left = this._parseVariable();


		if (!this.acceptDelim('=')) {
			if (assignment_required) {
				this.markError(left, ParseError.EqualExpected);
			}
			return this.finish(left);
		}
		else {

			if (!node.setLeft(left)) {
				return this.finish(node, ParseError.MacroVariableExpected, [TokenType.NewLine]);
			}

			if (!node.setRight(this._parseBinaryExpr())) {
				return this.finish(node, ParseError.TermExpected, [TokenType.NewLine]);
			}

			node.addChild(this._parseString());

			return this.finish(node); 
		}
	}

	//#endregion

	//#region Conditionals

	public _parseIfConditionalStatement(parseStatement: () => nodes.Node | null): nodes.Node | null {
		return this._parseThenStatement(parseStatement)
			|| this._parseGotoStatement();
	}

	public _parseIfStatement(parseStatement: () => nodes.Node | null): nodes.Node | null {
		if (!this.peekKeyword('if')) {
			return null;
		}

		const node = this.create(nodes.IfStatement);
		this.consumeToken(); // if

		if (!node.setConditional(this._parseConditionalExpression())) {
			this.markError(node, ParseError.ExpressionExpected, [], [TokenType.KeyWord]);
		}

		if (!this.peekKeyword('then') && !this.peekKeyword('goto')) {
			return this.finish(node, ParseError.ThenGotoExpected, [TokenType.NewLine]);
		}

		if (!this._parseBody(node, this._parseIfConditionalStatement.bind(this, parseStatement), false)) {
			return this.finish(node, ParseError.BodyExpected);
		}
		
		return this.finish(node);
	}

	public _parseThenStatement(parseStatement: () => nodes.Node | null): nodes.Node | null {

		if (!this.acceptKeyword('then')) {
			return null;
		}

		// IF [] THEN term
		if (this.peek(TokenType.Symbol) || this.peek(TokenType.Hash)) {
			const thenNode = this.create(nodes.ThenTermStatement);
			this._parseBody(thenNode, this._parseMacroStatement.bind(this), false);

			if (this.acceptKeyword('else')) {
				// ELSE term
				if (this.peek(TokenType.Symbol) || this.peek(TokenType.Hash)) {
					const elseNode = this.create(nodes.ElseTermStatement);
					this._parseBody(elseNode, this._parseMacroStatement.bind(this), false);
					thenNode.setElseClause(elseNode);
				} 
				else {
					const elseNode = this.create(nodes.ElseStatement);
					this._parseBody(elseNode, this._parseConditionalControlBody.bind(this, parseStatement, ['endif']));
					thenNode.setElseClause(elseNode);
				
					if (!this.acceptKeyword('endif')) {
						this.markError(thenNode, ParseError.EndifExpected);
					}
				}
			}
			else {
				if (this.acceptKeyword('endif')) { // optional
					if (!this.peekAny(TokenType.NewLine, TokenType.EOF)) {
						this.markError(thenNode, ParseError.NewLineExpected);
					}
				} 
			}
			return this.finish(thenNode);
		} 
		else {
			const endIfNode = this.create(nodes.IfEndifStatement);
			this._parseBody(endIfNode, this._parseConditionalControlBody.bind(this, parseStatement, ['else','endif']));
			
			if (this.acceptKeyword('else')) {
			// ELSE term
				if (this.peek(TokenType.Symbol) || this.peek(TokenType.Hash)) {
					const elseNode = this.create(nodes.ElseTermStatement);
					elseNode.addChild(this._parseMacroStatement());
					endIfNode.setElseClause(elseNode);
					// check new line after statement
					if (this._needsLineBreakAfter(elseNode) && !this.peekAny(TokenType.NewLine, TokenType.EOF)) {
						this.markError(elseNode, ParseError.NewLineExpected);
					}	
				} 
				else {
					// ELSE
					// ENDIF
					const elseNode = this.create(nodes.ElseStatement);
					this._parseBody(elseNode, this._parseConditionalControlBody.bind(this, parseStatement, ['endif']));
					endIfNode.setElseClause(elseNode);
				
					if (!this.acceptKeyword('endif')) {
						this.markError(endIfNode, ParseError.EndifExpected);
					}
				}
			}
			else {
				if (!this.acceptKeyword('endif')) {
					this.markError(endIfNode, ParseError.EndifExpected);
				}
			}	
			return this.finish(endIfNode);
		}
	}

	public _parseGotoStatement(): nodes.Node | null {

		if (!this.peekKeyword('goto')) {
			return null;
		}

		const node = <nodes.GotoStatement>this.create(nodes.GotoStatement);
		this.consumeToken(); // goto

		if (this.peek(TokenType.BracketL) || this.peek(TokenType.Hash) ){
			const expression = this._parseBinaryExpr();
			if (!node.setLabel(expression)) {
				this.markError(node, ParseError.ExpressionExpected, [], [TokenType.NewLine]);
			}
		}
		else {
			if (!node.setLabel(this._parseUnknownSymbol(this._parseVariable() || this._parseNumber(true, false, nodes.ReferenceType.Sequence)))) 
			{
				this.markError(node, ParseError.LabelExpected, [], [TokenType.NewLine]);
			}
		}

		return this.finish(node);
	}

	public _parseWhileStatement(parseStatement: () => nodes.Node | null): nodes.Node | null {
		if (!this.peekKeyword('while')) {
			return null;
		}

		const node = <nodes.WhileStatement>this.create(nodes.WhileStatement);
		this.consumeToken(); // while

		if (!node.setConditional(this._parseConditionalExpression())) {
			this.markError(node, ParseError.ExpressionExpected, [], [TokenType.KeyWord, TokenType.Symbol, TokenType.NewLine]);
		}

		if (!this.acceptKeyword('do')) {
			this.markError(node, ParseError.DoExpected, [], [TokenType.Symbol, TokenType.NewLine]);
		}

		if (!node.setDoLabel(this._parseUnknownSymbol(this._parseNumber(true)))) {
			this.markError(node, ParseError.LabelExpected, [], [TokenType.NewLine]);
		}

		this._parseBody(node, this._parseConditionalControlBody.bind(this, parseStatement, ['end']));

		if (!this.acceptKeyword('end')) {
			return this.finish(node, ParseError.EndExpected, [], [TokenType.NewLine]);
		}
		
		if (!node.setEndLabel(this._parseUnknownSymbol(this._parseNumber(true)))) { 
			this.markError(node, ParseError.LabelExpected, [], [TokenType.NewLine]);
		}

		if (!this.peekAny(TokenType.NewLine, TokenType.EOF)) {
			this.markError(node, ParseError.NewLineExpected);
		}
	
		return this.finish(node);
	}


	public _parseUnknownSymbol(node: nodes.Node = null):nodes.Node | null {
		if (node) {
			return node;
		}
		return this._parseSymbol();
	}

	//#endregion

	//#region Expressions

	public _parseConditionalExpression(brackets: boolean = true) : nodes.ConditionalExpression | null {

		let node = this.create(nodes.ConditionalExpression);
		if (brackets && !this.accept(TokenType.BracketL)) {
			this.markError(node, ParseError.LeftSquareBracketExpected, [], [TokenType.Symbol, TokenType.BracketR, TokenType.KeyWord, TokenType.NewLine]);
		}

		node = this._parseConditionalExpressionInternal(node);

		if (brackets && !this.accept(TokenType.BracketR)) {
			this.markError(node, ParseError.RightSquareBracketExpected, [], [TokenType.KeyWord, TokenType.Symbol, TokenType.NewLine]);
		}

		return this.finish(node);
	}

	public _parseConditionalExpressionInternal(preparsed?: nodes.ConditionalExpression): nodes.ConditionalExpression | null {

		let node = preparsed ?? this.create(nodes.ConditionalExpression);

		if (!node.setLeft(this._parseBinaryExpr())) {
			return this.finish(node, ParseError.ExpressionExpected, [], [TokenType.KeyWord, TokenType.NewLine, TokenType.BracketR]);
		}

		if (node.setConditionalOp(this._parseConditionalOperator())) {
			if (!node.setRight(this._parseBinaryExpr())) {
				this.markError(node, ParseError.TermExpected);
			}
		}
		if (node.setLogicOp(this._parseLogicalOperator())) {

			if (!node.setNext(this._parseConditionalExpressionInternal())) {
				this.markError(node, ParseError.TermExpected);
			}
		}		

		return this.finish(node);
	}

	public _parseBinaryExpr(preparsedLeft?: nodes.BinaryExpression, preparsedOper?: nodes.Node): nodes.BinaryExpression | null {

		let node = this.create(nodes.BinaryExpression);
	
		node.setOperator(this._parseUnaryOperator()); 
		if (this.hasKeywords('#','[')) {
			this.accept(TokenType.Hash);
		}
		if (!this.peek(TokenType.BracketL)) {
			if (!node.setLeft((preparsedLeft || this._parseTerm()))) {
				//return this.finish(node, ParseError.TermExpected);
				return null;
			}


			if (!node.setOperator(preparsedOper || this._parseBinaryOperator())) {
				return this.finish(node);
			}

			if (this.hasKeywords('#','[')) {
				this.accept(TokenType.Hash);
			}
			if (!this.peek(TokenType.BracketL)){			
				if (!node.setRight(this._parseTerm())) {
					this.markError(node, ParseError.TermExpected, [TokenType.NewLine], [TokenType.KeyWord, TokenType.BracketR]);
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
			node.addChild(this._parseBinaryExpr(node, operator));
		}

		return this.finish(node);
	}
	//#endregion

	//#region Terms

	public _parseTerm(): nodes.Node | null {
		const node = this.create(nodes.Term);
		node.setOperator(this._parseUnaryOperator());
		if (node.setExpression(this._parseUnknownSymbol(
			this._parseVariable() 
			|| this._parseFfunc() 
			|| this._parseAddress() 
			|| this._parseNumber()))) {
			return <nodes.Term>this.finish(node);
		}
		return null;
	}

	/**
	 * Variable: symbol, #symbol, #1000, #[, #<
	 */
	public _parseVariable(): nodes.Node | null {

		if (!this.peek(TokenType.Hash)) {
			return null;
		}

		const node = <nodes.Variable>this.create(nodes.Variable);
		this.consumeToken();
		
		if (this.peek(TokenType.BracketL)) {
			node.setBody(this._parseBinaryExpr());
			return this.finish(node);
		} 

		if (!node.setBody(this._parseUnknownSymbol(this._parseNumber(true, false, nodes.ReferenceType.Variable)))) {
			return this.finish(node, ParseError.IdentifierExpected);
		}
		
		if (this.accept(TokenType.LTS)) {	
			node.setBody(this._parseBinaryExpr());
		
			if (!this.accept(TokenType.GTS)){
				return this.finish(node, ParseError.RightAngleBracketExpected);
			}
		} 

		return this.finish(node);

	}

	public _parseAddress() : nodes.Address | nodes.Node | null {

		if (!this.peek(TokenType.Parameter)) {
			return null;
		}

		// Address e.g: R100, R100.1, R1.#[1], R#1, R[1]
		const node = <nodes.Address>this.create(nodes.Address);
		const mark = this.mark();

		this.consumeToken();

		if (this.peek(TokenType.Number)) {
			
			while(this.accept(TokenType.Number)){}
			this.acceptKeyword('.');
			
			if (this.peek(TokenType.Hash)) {
				if (node.addChild(this._parseVariable())){
					return this.finish(node);
				}
			} 
			else if (this.peek(TokenType.BracketL)) {
				if (node.addChild(this._parseBinaryExpr())){
					return this.finish(node);
				}
			} 
			else {
				while(this.accept(TokenType.Number)){}
			}
			return this.finish(node);
		}
		else if (this.peek(TokenType.Hash)) {
			if (node.addChild(this._parseVariable())){
				return this.finish(node);
			}
		}
		else if (this.peek(TokenType.BracketL)) {
			if (node.addChild(this._parseBinaryExpr())){
				return this.finish(node);
			}
		}
		this.restoreAtMark(mark); 
	
		return null;
	}

	/**
	 * Command expression: e.g  POPEN
	 */
	public _parseFcommand(): nodes.Node | null {

		if (!this.peek(TokenType.Fcmd)) {
			return null;
		}
		return this._parseFfuncInternal(this.create(nodes.Fcmd));
	}

	/**
	 * Function expression: e.g  SIN[1+1]
	 */
	public _parseFfunc(): nodes.Node  | null {

		if (!this.peek(TokenType.Ffunc)) {
			return null;
		}
		return this._parseFfuncInternal(this.create(nodes.Ffunc));
	}

	public _parseFfuncInternal<T extends nodes.Ffunc>(type: T): T | null {
		const fname = this.token.text.toLocaleLowerCase();
		const signatures = functionSignatures[fname];
		if (signatures.length <= 0) {
			return null;
		}

		const mark = this.mark();
		for (let i = 0; i < signatures.length; i++) {
			let signature = signatures[i];
			this.scanner.inFunction = true;
			const node = this._parseFfuncSignature<T>(type, fname, signature, i >= signatures.length-1);
			this.scanner.inFunction = false;
			if (node) {
				node.setData('signature', i);
				return node;
			}
			else {
				this.restoreAtMark(mark);
			}
		}
		return null;
	}

	public _parseFfuncSignature<T extends nodes.Ffunc>(node: T, fname: string, signature:FunctionSignature, last:boolean): T | null {
		const ident = this.createNode(nodes.NodeType.Identifier);
		this.consumeToken();	// function
		node.setIdentifier(this.finish(ident));
		let bracketOpen = false;
		for (let element of signature.param) {

			if (element._param) {
				let index = 0;
				while (index < element._param.length) {
					const param = element._param[index];
					if (index > 0 && signature.delimiter) {
						this.acceptKeyword(signature.delimiter);
					}	
	
					if (!node.addChild(this._parseFfuncParameter(param))) {		
						if (last) {
							return this.finish(node, ParseError.TermExpected, [], [TokenType.NewLine]);
						}
						return null;
					}
					++index;
				}
			}
			else if (element._bracket) {
				if (!this._parseFfuncParameter(element)) {
					if (last) {
						if (!bracketOpen) {
							return this.finish(node, element._bracket === '['? ParseError.LeftSquareBracketExpected : ParseError.LeftParenthesisExpected, [], [TokenType.NewLine]);
						}
						else {
							return this.finish(node, element._bracket === ']'? ParseError.RightSquareBracketExpected : ParseError.RightParenthesisExpected, [], [TokenType.NewLine]);
						}
					}
					return null;
				}
				if (bracketOpen) {
					bracketOpen = false;
				} else if (!bracketOpen) {
					bracketOpen = true;
				}
			}
			else if (element._escape) {
				const ret = this._parseFfuncParameter(element);
				if (!ret) {
					return null;
				}
				node.addChild(ret);
			}
			else {
				const parameter = this.createNode(nodes.NodeType.FuncParam);
					
				if (fname === 'dprnt' || fname === 'bprnt') {
					while (this._parsePrnt(parameter));
				}
				else {
					while (this._parseUnknownSymbol(this._parseMacroStatement() || this._parseNcStatement() || this._parseBinaryExpr()));
				}

				node.addChild(parameter);
			}
		}
		return this.finish(node);
	}
	
	public _parsePrnt(node: nodes.Node) : boolean  {

		if (this.peek(TokenType.BracketR)) {
			return false;
		}

		if (node.addChild(this._parsePrntNcParam()
			|| this._parsePrntFormattedVariable()
			|| this._parsePrntAnyText())) {
				return true;
		}
		else if (this.peekAny(TokenType.NewLine, TokenType.EOF)) {
			this.markError(node, ParseError.RightSquareBracketExpected);
		}
		else {
			this.markError(node, ParseError.UnexpectedToken);
		}
			return false;
	}

	public _parsePrntAnyText() : nodes.Node {
		
		if (!(this.peekRegExp(TokenType.Symbol, /[a-zA-Z]/)
			|| this.peek(TokenType.Number)
			|| this.peekAnyKeyword('*', '/', '+', '-'))) {
			return null;
		}
		
		const node = this.create(nodes.Node);
		
		this.consumeToken();
	
		return this.finish(node);
	}
	
	public _parsePrntNcParam() : nodes.Node {

		if (!this.peek(TokenType.Parameter)) {
			return null;
		}
		
		const node = this.create(nodes.Parameter);
		
		this.consumeToken();
		
		return this.finish(node);
	}
	
	public _parsePrntFormattedVariable() : nodes.Node {
		
		if (!this.peek(TokenType.Hash)) {
			return null;
		}
		
		const node = this.create(nodes.Node);
		
		if (!node.addChild(this._parseVariable())) {
			this.markError(node, ParseError.MacroVariableExpected);
		}
		
		if (!node.addChild(this._parsePrntFormat())) {
			this.markError(node, ParseError.PrntFormatExpected);
		}
		
		return this.finish(node);
	}
	
	public _parsePrntFormat() : nodes.Node {
		
		if (!this.peek(TokenType.BracketL)) {
			return null;
		}
		const node = this.create(nodes.Node);
		
		this.consumeToken();
		
		if (!node.addChild(this._parseNumber(true))) {
			this.markError(node, ParseError.NumberExpected);
		}
		
		if (!this.accept(TokenType.BracketR)) {
			this.markError(node, ParseError.RightSquareBracketExpected);
		}
		
		return this.finish(node);
	}

	public _parseFfuncParameter(param:any) : nodes.Node | null {
		if (param._bracket) {
			const node = this.create(nodes.Node);
			if (!this.acceptKeyword(param._bracket)) {
				return null;
			}
			return this.finish(node);
		}
		else if (param._escape) {
			const node = this.create(nodes.Node);
			if (!this.acceptKeyword(param._escape)) {
				return null;
			}
			return this.finish(node);
		}
		else {
			const node = this.createNode(nodes.NodeType.FuncParam);
			let child:nodes.Node | null = null;
			if (param._type) {
				if (param._type === 'number') {
					child = this._parseNumber();
				}
				else if (param._type === 'string') {
					child = this._parseText();
				}
			}
			else {
				child = this._parseBinaryExpr();
			}
			
			if (!node.addChild(child)) {
				return null;
			}
			return this.finish(node);
		}
	}
	
	public _parseText(): nodes.Node | null {

		if (!this.peek(TokenType.Symbol)){
			return null;
		}
		const string = this.createNode(nodes.NodeType.String);
		this.consumeToken();
		return this.finish(string);
	}

	public _parseSymbol(...referenceTypes: nodes.ReferenceType[]): nodes.Node | null {

		if (!this.peek(TokenType.Symbol)) {
			return null;
		}

		const node = <nodes.Symbol>this.create(nodes.Symbol);

		if (referenceTypes) {
			node.addReferenceType(...referenceTypes);
		}
		node.addReferenceType(nodes.ReferenceType.Symbol);

		this.consumeToken();

		return this.finish(node);
	}

	public _parseString(single:boolean=false) : nodes.Node | null{

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

		if (!single) {
			const next = this._parseString(single);
			if (next) {
				node.addChild(next);
			}
		}

		return this.finish(node);
	}

	public _parseNumber(integer = false, signed = false, ...referenceTypes: nodes.ReferenceType[]) : nodes.Numeric | null {

		if (!this.peek(TokenType.Number) && !signed || signed && !this.peek(TokenType.Number) && !this.peekDelim('+') && !this.peekDelim('-')) {
			return null;
		}

		const node = this.create(nodes.Numeric);
		const mark = this.mark();
		if (this.acceptDelim('+') || this.acceptDelim('-')) {
			if (!this.peek(TokenType.Number)) {
				this.restoreAtMark(mark);
				return null;
			}
		}
	
		if (integer && this.peekRegExp(TokenType.Number, /\d*\.\d*/)) {	
			this.markError(node, ParseError.IntegerExpected);
		}

		node.addReferenceType(...referenceTypes);

		this.consumeToken();

		node.addChild(this._parseNumber(integer, signed, ...referenceTypes));

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

	public _needsLineBreakBefore(node: nodes.Node): boolean {
		if (!node) {
			return false;
		}
		switch (node.type) {
			case nodes.NodeType.Program:
			case nodes.NodeType.Then:
			case nodes.NodeType.Else:
			case nodes.NodeType.While:
				return true;
		}
		return false;
	}

	public _needsLineBreakAfter(node: nodes.Node): boolean {
		if (!node) {
			return false;
		}
		switch (node.type) {
			case nodes.NodeType.Include:
			case nodes.NodeType.Goto:
			case nodes.NodeType.Assignment:
			case nodes.NodeType.Statement:
			case nodes.NodeType.String:
			case nodes.NodeType.ControlStatement:	
			case nodes.NodeType.Then:		
			case nodes.NodeType.While:
			case nodes.NodeType.LabelDef:
			case nodes.NodeType.SymbolDef:
				return true;
		}
		return false;
	}

	public _parseUnexpected() : nodes.Node | null {
	
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
