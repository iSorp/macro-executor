/*---------------------------------------------------------------------------------------------
* Copyright (c) 2020 Simon Waelti
* Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
'use strict';

import * as nodes from '../parser/macroNodes';
import { LintVisitor } from './lint';
import { TextDocument, Range, Diagnostic, DiagnosticSeverity, LanguageSettings, MacroFileProvider } from '../macroLanguageTypes';

export class MacroValidation {

	private settings?: LanguageSettings;

	constructor( private fileProvider: MacroFileProvider) {}

	public configure(settings?: LanguageSettings) {
		this.settings = settings;
	}

	public doValidation(document: TextDocument, macroFile: nodes.MacroFile, settings: LanguageSettings | undefined = this.settings): Diagnostic[] {
		if (settings && settings?.validate?.enable === false) {
			return [];
		}

		const entries: nodes.IMarker[] = [];
		entries.push.apply(entries, nodes.ParseErrorCollector.entries(macroFile));
		entries.push.apply(entries, LintVisitor.entries(macroFile, document, this.fileProvider));

		function toDiagnostic(marker: nodes.IMarker): Diagnostic {
			const range = Range.create(document.positionAt(marker.getOffset()), document.positionAt(marker.getOffset() + marker.getLength()));
			const source = document.languageId;

			return <Diagnostic>{
				code: marker.getRule().id,
				source: source,
				message: marker.getMessage(),
				severity: marker.getLevel() === nodes.Level.Warning ? DiagnosticSeverity.Warning : DiagnosticSeverity.Error,
				range: range
			};
		}

		return entries.filter(entry => entry.getLevel() !== nodes.Level.Ignore).map(toDiagnostic);
	}
}
