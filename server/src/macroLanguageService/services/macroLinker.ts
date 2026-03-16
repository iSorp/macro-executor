/*---------------------------------------------------------------------------------------------
* Copyright (c) 2026 Simon Waelti
* Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
'use strict';

import * as nodes from '../parser/macroNodes';
import { 
	TextDocument, 
} from '../macroLanguageTypes';

export class MacroLinker{
	findPcodeNumber(document: TextDocument, macrofile: nodes.MacroFile): number {
		return macrofile.getData(nodes.Data.PcodeNumber);
	}

	findLinkedFiles(document: TextDocument, macrofile: nodes.MacroFile): string[] {
		return macrofile.getData(nodes.Data.Files);
	}
}