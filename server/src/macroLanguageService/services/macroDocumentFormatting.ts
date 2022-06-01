/*---------------------------------------------------------------------------------------------
* Copyright (c) 2022 Simon Waelti
* Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
'use strict';

import { notDeepEqual } from 'assert';
import {
	TextEdit, TextDocument, Position, Range,
	FormattingOptions
} from '../macroLanguageTypes';
import * as nodes from '../parser/macroNodes';

export type VisitorFunction = (node: nodes.Node, level: number) => boolean;

export class MacroDocumentFormatting {

	private options: FormattingOptions;
	private edits: TextEdit[];
	private document: TextDocument;
	private indent: string;

	public doDocumentFormatting(document: TextDocument, options: FormattingOptions, macrofile: nodes.MacroFile): TextEdit[] | null {

		this.document = document;
		this.options = options;
		this.edits = [];

		if (options.insertSpaces) {
			this.indent = ' '.repeat(options.tabSize);
		}
		else {
			this.indent = '\t';
		}

		this.doDocumentFormattingInternal(macrofile, 0);

		if (options.trimFinalNewlines) {
			const len = document.getText().length;
			const last = document.getText().charAt(len - 1);
			if (last === '\n') {
				const trimmed = TextDocument.create('', 'macro', 1, document.getText().trimEnd());

				let pos: Position;
				if (options.insertFinalNewline) {
					pos = Position.create(trimmed.lineCount, 0);
				}
				else {
					pos = trimmed.positionAt(trimmed.getText().length);
				}

				this.edits.push(TextEdit.del(Range.create(pos, Position.create(document.lineCount, 0) )));
			}
		}
		else if (options.insertFinalNewline) {
			const len = document.getText().length;
			const last = document.getText().charAt(len - 1);
			if (last !== '\n') {
				this.edits.push(TextEdit.insert(Position.create(document.lineCount, 0), '\n'));
			}
		}

		return this.edits;
	}

	private doDocumentFormattingInternal(node: nodes.Node, level: number) {

		if (node.hasChildren()) {
			for (const child of node.getChildren()) {

				const space = this.indent.repeat(level);

				if (child.type === nodes.NodeType.SymbolDef
                    || child.type === nodes.NodeType.LabelDef
                    || child.type === nodes.NodeType.Include
                    || child.type === nodes.NodeType.ControlStatement) {
					this.indentFirstLine(child, '');
				}
				else if (child.type === nodes.NodeType.Comment && child.parent.type === nodes.NodeType.MacroFile) {
					this.indentFirstLine(child, '');
				}
				else if (child.type === nodes.NodeType.Body) {
					this.doDocumentFormattingInternal(child, level + 1);
				}
				else if (child.type === nodes.NodeType.MacroFile
                    || child.type === nodes.NodeType.DefFile) {
					this.doDocumentFormattingInternal(child, level);
				}
				else if (child.type === nodes.NodeType.Program) {
					this.indentFirstLine(child, space);
					this.doDocumentFormattingInternal(child, level);
				}
				else if (child.type === nodes.NodeType.If) {
					this.doDocumentFormattingInternal(child, level);
				}
				else if (child.type === nodes.NodeType.While || child.type === nodes.NodeType.Then) {
					this.indentFirstLine(child, space);
					this.doDocumentFormattingInternal(child, level);
					this.indentLastLine(child, space);
				}
				else if (child.type === nodes.NodeType.Else) {
					this.indentFirstLine(child, space);
					this.doDocumentFormattingInternal(child, level);
				}
				else if (child.parent.type === nodes.NodeType.If
                    && (child.type === nodes.NodeType.ThenTerm || child.type === nodes.NodeType.Goto)) {
					this.indentBody(child, space);
				}
				else if (child.parent.type === nodes.NodeType.Body) {
					this.indentBody(child, space);
				}
			}
		}
	}

	private indentFirstLine(node: nodes.Node, space: string) {
		const node_start_pos = this.document.positionAt(node.offset);
		this.indentLine(space, node_start_pos.line);
	}

	private indentLastLine(node: nodes.Node, space: string) {
		const node_end_pos = this.document.positionAt(node.end);
		this.indentLine(space, node_end_pos.line);
	}

	private indentBody(node: nodes.Node, space: string) {
		const node_start_pos = this.document.positionAt(node.offset);
		const node_end_pos = this.document.positionAt(node.end);
		const count = node_end_pos.line - node_start_pos.line;

		for (let i = 0; i < count + 1; i++) {
			this.indentLine(space, node_start_pos.line + i);
		}
	}

	private indentLine(space: string, line: number) {
		const currentText = this.document.getText(Range.create(line, 0, line + 1, 0))?.replace(/[\n\r]/g, '');
		const range = Range.create(line, 0, line, currentText.length);

		let text: string;
		if (this.options.trimTrailingWhitespace) {
			text = this.document.getText(range).trim();
		}
		else {
			text = this.document.getText(range).trimStart();
		}

		if (this.edits.length < 1 || range.start.line !== this.edits[this.edits.length-1].range.start.line) {
			this.edits.push(TextEdit.replace(range, space + text));
		}
	}
}
