/*---------------------------------------------------------------------------------------------
* Copyright (c) 2022 Simon Waelti
* Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
'use strict';

import { count } from 'console';
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

	public doDocumentFormatting(document: TextDocument, options: FormattingOptions, macrofile: nodes.MacroFile): TextEdit[] | null {

		this.document = document;
		this.options = options;
		this.edits = [];

		this.doDocumentFormattingInternal(macrofile, 0);

		return this.edits;
	}

	private doDocumentFormattingInternal(node: nodes.Node, level: number) {

		if (node.hasChildren()) {
			for (const child of node.getChildren()) {

				const space = Array(level).fill('    ').join('');

				if (child.type === nodes.NodeType.Body) {
					this.doDocumentFormattingInternal(child, level + 1);
				}
				else if (child.type === nodes.NodeType.MacroFile
					|| child.type === nodes.NodeType.Program
					|| child.type === nodes.NodeType.If) {
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
					this.indentFirstLine(child, space);
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
		const currentText = this.document.getText(Range.create(line, 0, line + 1, 0));
		const range = Range.create(line, 0, line, currentText.length-1);

		this.edits.push(TextEdit.del(range));

		let text: string;
		text = this.document.getText(range).trim();
		this.edits.push(TextEdit.insert(Position.create(line, 0), space + text));
	}
}
