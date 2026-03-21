/*---------------------------------------------------------------------------------------------
* Copyright (c) 2026 Simon Waelti
* Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

'use strict';

export interface ProgramDebugInfo {
    program: string;
    sequence: number;
    line: number;
    uri: string;
}

export interface VariableInfo {
    id: string;
    address: string;
	size?: number;
    program?:string;
}

export interface LinkedFileInfo {
    path: number;
    files: string[];
};

export interface LinkedFileInfoParams {
    workspaceFolderUri: string;
}

export interface VariableInfoParams {
    position: {
        line: number;
        character: number;
    }

    documentUri: string;
}

export interface AllVariableInfoParams {
    linkedFiles: string[];
}

export interface ProgramVariableInfoParams {
    programNumber: number;
    documentUri: string;
}

export interface ProgramSequenceInfoParams {
    programNumber: number;
    sequenceNumber: number;
    linkedFiles: string[];
}