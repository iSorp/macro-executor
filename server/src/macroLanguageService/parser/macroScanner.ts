/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

export enum TokenType {
	NewLine,
	Dollar,
	Hash,
	AT,
	GTS,
	LogigOr,
	LogigAnd,
	String,
	BadString,
	UnquotedString,
	Comma,
	BracketL,
	BracketR,
	Whitespace,
	Symbol,
	Ffunc,
	KeyWord,
	Comment,
	Ampersand,		// axis number command
	Delim,
	EOF,
}

export interface IToken {
	type: TokenType;
	text: string;
	offset: number;
	len: number;
}


export class MultiLineStream {

	private source: string;
	private len: number;
	private position: number;

	constructor(source: string) {
		this.source = source;
		this.len = source.length;
		this.position = 0;
	}

	public substring(from: number, to: number = this.position): string {
		return this.source.substring(from, to);
	}

	public eos(): boolean {
		return this.len <= this.position;
	}

	public pos(): number {
		return this.position;
	}

	public goBackTo(pos: number): void {
		this.position = pos;
	}

	public goBack(n: number): void {
		this.position -= n;
	}

	public advance(n: number): void {
		this.position += n;
	}

	public nextChar(): number {
		return this.source.charCodeAt(this.position++) || 0;
	}

	public peekChar(n: number = 0): number {
		return this.source.charCodeAt(this.position + n) || 0;
	}

	public lookbackChar(n: number = 0): number {
		return this.source.charCodeAt(this.position - n) || 0;
	}

	public advanceIfChar(ch: number): boolean {
		let c = this.source.charCodeAt(this.position);
		if (ch === this.source.charCodeAt(this.position)) {
			this.position++;
			return true;
		}
		return false;
	}

	public advanceIfChars(ch: number[]): boolean {
		if (this.position + ch.length > this.source.length) {
			return false;
		}
		let i = 0;
		for (; i < ch.length; i++) {
			if (this.source.charCodeAt(this.position + i) !== ch[i]) {
				return false;
			}
		}
		this.advance(i);
		return true;
	}

	public advanceWhileChar(condition: (ch: number) => boolean): number {
		const posNow = this.position;
		while (this.position < this.len && condition(this.source.charCodeAt(this.position))) {
			this.position++;
		}
		return this.position - posNow;
	}
}


/*---------------------------------------------------------------------------------------------
* Copyright (c) 2020 Simon Waelti
* Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
export const _o = 'o'.charCodeAt(0);
export const _O = 'O'.charCodeAt(0);
export const _a = 'a'.charCodeAt(0);
export const _f = 'f'.charCodeAt(0);
export const _z = 'z'.charCodeAt(0);
export const _A = 'A'.charCodeAt(0);
export const _F = 'F'.charCodeAt(0);
export const _Z = 'Z'.charCodeAt(0);
export const _0 = '0'.charCodeAt(0);
export const _1 = '1'.charCodeAt(0);
export const _9 = '9'.charCodeAt(0);
export const _N = 'N'.charCodeAt(0);
export const _n = 'n'.charCodeAt(0);

export const _MIN = '-'.charCodeAt(0);
export const _USC = '_'.charCodeAt(0);
export const _MUL = '*'.charCodeAt(0);
export const _RAN = '>'.charCodeAt(0);
export const _PIP = '|'.charCodeAt(0);
export const _AMD = '&'.charCodeAt(0);
export const _QUM = '?'.charCodeAt(0);
export const _PRC = '%'.charCodeAt(0);
export const _BNG = '!'.charCodeAt(0);
export const _ATS = '@'.charCodeAt(0);
export const _HSH = '#'.charCodeAt(0);
export const _DLR = '$'.charCodeAt(0);
export const _BSL = '\\'.charCodeAt(0);
export const _FSL = '/'.charCodeAt(0);
export const _NWL = '\n'.charCodeAt(0);
export const _CAR = '\r'.charCodeAt(0);
export const _LFD = '\f'.charCodeAt(0);
export const _DQO = '"'.charCodeAt(0);
export const _SQO = '\''.charCodeAt(0);
export const _WSP = ' '.charCodeAt(0);
export const _TAB = '\t'.charCodeAt(0);
export const _SEM = ';'.charCodeAt(0);
export const _LPA = '('.charCodeAt(0);
export const _RPA = ')'.charCodeAt(0);
export const _BRL = '['.charCodeAt(0);
export const _BRR = ']'.charCodeAt(0);
export const _DOT = '.'.charCodeAt(0);
export const _EQS = '='.charCodeAt(0);
export const _CMA = ','.charCodeAt(0);
export const _SUB = 'O'.charCodeAt(0);

const staticTokenTable: { [code: number]: TokenType; } = {};
staticTokenTable[_NWL] = TokenType.NewLine;
staticTokenTable[_BRR] = TokenType.BracketR;
staticTokenTable[_BRL] = TokenType.BracketL;
staticTokenTable[_CMA] = TokenType.Comma;
staticTokenTable[_AMD] = TokenType.Ampersand;

const staticKeywordTable: { [key: string]: TokenType; } = {};
staticKeywordTable['if'] = TokenType.KeyWord;
staticKeywordTable['then'] = TokenType.KeyWord;
staticKeywordTable['else'] = TokenType.KeyWord;
staticKeywordTable['endif'] = TokenType.KeyWord;
staticKeywordTable['goto'] = TokenType.KeyWord;
staticKeywordTable['while'] = TokenType.KeyWord;
staticKeywordTable['do'] = TokenType.KeyWord;
staticKeywordTable['end'] = TokenType.KeyWord;
staticKeywordTable['eq'] = TokenType.KeyWord;
staticKeywordTable['ne'] = TokenType.KeyWord;
staticKeywordTable['le'] = TokenType.KeyWord;
staticKeywordTable['ge'] = TokenType.KeyWord;
staticKeywordTable['lt'] = TokenType.KeyWord;
staticKeywordTable['gt'] = TokenType.KeyWord;
staticKeywordTable['and'] = TokenType.KeyWord;
staticKeywordTable['or'] = TokenType.KeyWord;
staticKeywordTable['xor'] = TokenType.KeyWord;
staticKeywordTable['mod'] = TokenType.KeyWord;

const staticFunctionTable: { [key: string]: TokenType; } = {};
staticFunctionTable['sin'] = TokenType.Ffunc;
staticFunctionTable['cos'] = TokenType.Ffunc;
staticFunctionTable['tan'] = TokenType.Ffunc;
staticFunctionTable['asin'] = TokenType.Ffunc;
staticFunctionTable['acos'] = TokenType.Ffunc;
staticFunctionTable['atan'] = TokenType.Ffunc;
staticFunctionTable['sqrt'] = TokenType.Ffunc;
staticFunctionTable['abs'] = TokenType.Ffunc;
staticFunctionTable['bin'] = TokenType.Ffunc;
staticFunctionTable['bcd'] = TokenType.Ffunc;
staticFunctionTable['round'] = TokenType.Ffunc;
staticFunctionTable['fix'] = TokenType.Ffunc;
staticFunctionTable['fup'] = TokenType.Ffunc;
staticFunctionTable['ln'] = TokenType.Ffunc;
staticFunctionTable['exp'] = TokenType.Ffunc;
staticFunctionTable['pow'] = TokenType.Ffunc;
staticFunctionTable['adp'] = TokenType.Ffunc;
staticFunctionTable['prm'] = TokenType.Ffunc;


export class Scanner {

	constructor() {}

	public stream: MultiLineStream = new MultiLineStream('');
	public ignoreComment = true;
	public ignoreWhitespace = true;


	public setSource(input: string): void {
		this.stream = new MultiLineStream(input);
	}

	public finishToken(offset: number, type: TokenType, text?: string): IToken {
		return {
			offset: offset,
			len: this.stream.pos() - offset,
			type: type,
			text: text || this.stream.substring(offset)
		};
	}

	public substring(offset: number, len: number): string {
		return this.stream.substring(offset, offset + len);
	}

	public pos(): number {
		return this.stream.pos();
	}

	public goBackTo(pos: number): void {
		this.stream.goBackTo(pos);
	}

	public scanUnquotedString(): IToken | null {
		const offset = this.stream.pos();
		const content: string[] = [];
		if (this._unquotedString(content)) {
			return this.finishToken(offset, TokenType.UnquotedString, content.join(''));
		}
		return null;
	}

	public scan(): IToken {
		// processes all whitespaces and comments
		const triviaToken = this._trivia();
		if (triviaToken !== null) {
			return triviaToken;
		}

		const offset = this.stream.pos();

		// End of file/input
		if (this.stream.eos()) {
			return this.finishToken(offset, TokenType.EOF);
		}
		return this._scanNext(offset);
	}

	private _scanNext(offset: number): IToken {

		let content: string[] = [];
		
		// $-keyword
		if (this.stream.advanceIfChar(_DLR)) {
			content = ['$'];
			if (this._name(content)) {
				const keywordText = content.join('');
				return this.finishToken(offset, TokenType.Dollar, keywordText);
			} else {
				return this.finishToken(offset, TokenType.Delim);
			}
		}

		// @-keyword
		if (this.stream.advanceIfChar(_ATS)) {
			content = ['@'];
			if (this._symbol(content)) {
				const paramText = content.join('');
				return this.finishToken(offset, TokenType.AT, paramText);
			} else {
				return this.finishToken(offset, TokenType.Delim);
			}
		}

		// >-keyword
		if (this.stream.advanceIfChar(_RAN)) {
			content = ['>'];
			if (this._symbol(content)) {
				const labelText = content.join('');
				return this.finishToken(offset, TokenType.GTS, labelText);
			} else {
				return this.finishToken(offset, TokenType.Delim);
			}
		}

		// #-keyword
		if (this.stream.advanceIfChar(_HSH)) {
			return this.finishToken(offset, TokenType.Hash);
		}

		// ||-keyword
		if (this.stream.advanceIfChars([_PIP, _PIP])) {
			return this.finishToken(offset, TokenType.LogigOr);
		}
		
		// ??-keyword
		if (this.stream.advanceIfChars([_AMD, _AMD])) {
			return this.finishToken(offset, TokenType.LogigAnd);
		}

		// single character tokens
		let singleChToken = <TokenType>staticTokenTable[this.stream.peekChar()];
		if (typeof singleChToken !== 'undefined') {
			this.stream.advance(1);
			return this.finishToken(offset, singleChToken);
		}

		// symbol / Static
		content = [];
		if (this._symbol(content)) {
			let text = content.join('');
			let keyword = <TokenType>staticKeywordTable[text.toLocaleLowerCase()];
			if (typeof keyword !== 'undefined') {
				return this.finishToken(offset, keyword);
			}

			let funcion = <TokenType>staticFunctionTable[text.toLocaleLowerCase()];
			if (typeof funcion !== 'undefined') {
				return this.finishToken(offset, funcion);
			}

			return this.finishToken(offset, TokenType.Symbol);
		}

		// String, BadString
		content = [];
		let tokenType = this._string(content);
		if (tokenType !== null) {
			return this.finishToken(offset, tokenType, content.join(''));
		}
		
		// Delim
		this.stream.nextChar();
		return this.finishToken(offset, TokenType.Delim);
	}

	private _trivia(): IToken | null {
		while (true) {
			const offset = this.stream.pos();
			if (this._whitespace(true)) {
				if (!this.ignoreWhitespace) {
					return this.finishToken(offset, TokenType.Whitespace);
				}
			} else if (this._comment()) {
				if (!this.ignoreComment) {
					return this.finishToken(offset, TokenType.Comment);
				}
			} else {
				return null;
			}
		}
	}

	private _comment(): boolean {
		if (this.stream.advanceIfChars([_FSL, _MUL]) || this.stream.advanceIfChar(_SEM)) {
			this.stream.advanceWhileChar((ch) => {
				if (this._newline(ch)) {
					return false;
				}
				return true;
			});
			return true;
		}
		return false;
	}

	private _newline(ch: number): boolean {
		switch (ch) {
			case _CAR:
			case _LFD:
			case _NWL:
				return true;
		}
		return false;
	}

	private _stringCloseQuotes(closeQuotes: number[]) : boolean{
		for (let i = 0; i < closeQuotes.length; i++){
			if (this.stream.peekChar(i) !== closeQuotes[i]){
				return false;
			}
		}
		return true;
	}

	private _stringChar(closeQuotes: number[], result: string[]) {
		// not closeQuote, not backslash, not newline
		if (this._stringCloseQuotes(closeQuotes)){
			return false; 
		}
		const ch = this.stream.peekChar();

		if (ch !== 0 && ch !== _CAR && ch !== _LFD && ch !== _NWL) {
			this.stream.advance(1);
			result.push(String.fromCharCode(ch));
			return true;
		}
		return false;
	}

	private _string(result: string[]): TokenType | null {
		
		if (this.stream.peekChar() === _LPA) {
			this.stream.nextChar();
			result.push(String.fromCharCode(_LPA));
			// &1
			if (this.stream.peekChar() === _AMD){
				this.stream.nextChar();
			}
			if (this.stream.peekChar() === _1){
				this.stream.nextChar();
			}
			let closeQuote:number = 0;
			let closeQuotes:number[] = [];
			if (this.stream.peekChar() === _SQO || this.stream.peekChar() === _DQO || this.stream.peekChar() === _MUL) {
				closeQuote = this.stream.nextChar();
				closeQuotes = [closeQuote, _RPA];
				result.push(String.fromCharCode(closeQuote));
			}
			else{
				closeQuotes = [_RPA];
				closeQuote = _RPA;
			}		

			while (this._stringChar(closeQuotes, result)) {
				// loop
			}
	
			if (this.stream.peekChar() === closeQuote) {
				
				for (const quote of closeQuotes){
					this.stream.advance(1);
					result.push(String.fromCharCode(quote));
				}
				return TokenType.String;
			} else {
				return TokenType.BadString;
			}
		}
		
		return null;
	}

	private _unquotedChar(result: string[]): boolean {
		const ch = this.stream.peekChar();
		if (ch !== 0 && ch !== _SQO && ch !== _DQO && ch !== _WSP && ch !== _TAB && ch !== _NWL && ch !== _LFD && ch !== _CAR) {
			this.stream.advance(1);
			result.push(String.fromCharCode(ch));
			return true;
		}
		return false;
	}

	private _unquotedString(result: string[]): boolean {
		let hasContent = false;
		while (this._unquotedChar(result)) {
			hasContent = true;
		}
		return hasContent;
	}

	private _whitespace(skipp_newline:boolean = false): boolean {
		if (skipp_newline){
			return this.stream.advanceWhileChar((ch) => {
				return ch === _WSP || ch === _TAB || ch === _LFD || ch === _CAR;
			}) > 0;
		}
		else {
			return this.stream.advanceWhileChar((ch) => {
				return ch === _WSP || ch === _TAB || ch === _NWL || ch === _LFD || ch === _CAR;
			}) > 0;
		}
	}

	private _name(result: string[]): boolean {
		let matched = false;
		while (this._symbolChar(result)) {
			matched = true;
		}
		return matched;
	}

	private _symbol(result: string[]): boolean {
		const pos = this.stream.pos();
		if (this._symbolFirstChar(result) ) {
			while (this._symbolChar(result)) {
				// loop
			}
			return true;
		}
		this.stream.goBackTo(pos);
		return false;
	}

	private _symbolFirstChar(result: string[]): boolean {
		return this._symbolChar(result);
	}

	private _symbolChar(result: string[]): boolean {
		const ch = this.stream.peekChar();
		if (ch === _USC || // _
			ch === _DOT || // .
			ch === _QUM || // ?
			ch === _BNG || // !
			ch >= _a && ch <= _z || // a-z
			ch >= _A && ch <= _Z || // A-Z
			ch >= _0 && ch <= _9 || // 0/9
			ch >= 0x80 && ch <= 0xFFFF) { // nonascii
			this.stream.advance(1);
			result.push(String.fromCharCode(ch));
			return true;
		}
		return false;
	}
}

/**
 * Gets the comment of a declaration node
 * @param document 
 * @param location 
 */
export function getComment(pos:number, text:string) : string {

	const comments = [[_FSL, _MUL], [_SEM]];
	const stream = new MultiLineStream(text);
	stream.goBackTo(pos);
	
	// Check first comment char
	let comment:number[] = [];
	stream.advanceWhileChar(a => ((ch:number) : boolean => {
		for (const cm of comments) {
			if (cm[0] === ch) {
				comment = cm;
				return false;
			}
		}
		return true;
	})(a) &&  a !== _NWL);

	// Check all other comment char
	let start = stream.pos();
	if (comment.length > 0) {
		stream.advanceWhileChar(a => ((ch:number) : boolean => {
			for (const char of comment) {
				if (char !== ch) {
					return false;
				}
			}
			return true;
		})(a) &&  a !== _NWL);
	}

	stream.advanceWhileChar(a => a !== _NWL);
	let end = stream.pos();
	return text.substr(start, end-start); 
}	
