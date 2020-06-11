/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2020 Simon Waelti
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { FunctionSignature } from '../macroLanguageTypes';


/**
 * Reserved interface properties
 * _bracket
 * _type
 * _param
 * _escape
 */
export const functionSignatures: { [name: string]: FunctionSignature[] } = {
	'popen': [		
		{ 
			description: 'The POPEN command establishes a connection to an external input/output device. It must be specified before a sequence of data output commands. The CNC outputs a DC2 control code', 
			delimiter: '', 
			param:[]
		}
	],
	'pclos': [	
		{ 
			description: 'The PCLOS command releases a connection to an external input/output device. Specify this command when all data output commands have terminated. DC4 control code is output from the CNC',
			delimiter: '', 
			param:[]
		}
	],
	'dprnt': [	
		{ 
			description: 'The DPRNT command outputs characters and each digit in the value of a variable according to the code set in the settings (ISO)',
			delimiter: '',
			param: [ { _bracket: '[' }, {}, { _bracket: ']' } ]
		}
	],
	'bprnt': [	
		{
			description: 'The BPRNT command outputs characters and variable values in binary',
			delimiter: '',
			param: [ { _bracket: '[' }, {}, { _bracket: ']' } ]
		}
	],
	'setvn': [	
		{ 
			description: 'This function expands number of variables to which name is set by SETVN',
			delimiter: ',', 
			param: [ { _param: [ { var: 'variable number', _type: 'number' } ], }, { _bracket: '[' }, { _param: [ { name: 'name', _type: 'string'} ], }, { _bracket: ']' } ]
		}
	],
	'fgen':  [
		{
			description: 'File creation command', 
			delimiter: ',', 
			param: [ { _bracket: '(' }, { _param: [ { file: 'file number'}, { size: 'file size'}, { result: 'result variable'} ] }, { _bracket: ')' } ]
		}
	],
	'fdel':  [
		{ 
			description: 'File deletion command', 
			delimiter: ',', 
			param: [ { _bracket: '(' }, { _param: [ { line: 'line number' }, { status: 'status variable' } ] }, { _bracket: ')' } ]
		}
	],
	'fopen': [	
		{ 
			description: 'File opening command',
			delimiter: ',', 
			param: [ { _bracket: '(' }, { _param: [ { file: 'file number'}, { mode: 'access mode'}, { result: 'result variable' } ] }, { _bracket: ')' } ] 
		}
	],
	'fclos': [
		{
			description: 'File closing command',
			delimiter: ',', 
			param: [ { _bracket: '(' }, { _param:[ { file: 'file number' } ] }, { _bracket: ')' } ]
		}
	],
	'fpset': [	
		{ 
			description: 'Command for setting file pointer',
			delimiter: ',',
			param: [ { _bracket: '(' }, { _param: [ { file: 'file number'}, {type: 'pointer type' }, { pointer: 'pointer'} ] }, { _bracket: ')' } ]
		}
	],
	'fread': [	
		{ 
			description: 'Command for reading files',
			delimiter: ',', 
			param: [ { _bracket: '(' }, { _param: [ { file: 'file number' }, { type: 'data type' }, {var: 'data variable'} ] }, { _bracket: ')' } ]
		}
	],
	'fwrit': [	
		{ 
			description: 'Command for writing files',
			delimiter: ',', 
			param: [ { _bracket: '(' }, { _param: [ { file: 'file number' }, { type: 'data type' }, { data: 'data' } ] }, { _bracket: ')' } ]
		}
	],
	'sin': [	
		{ 
			description: 'Sine (in degrees)',
			param: [ { _bracket: '[' }, { _param: [ { value: 'value'} ] }, { _bracket: ']' } ]
		}
	],
	'cos': [	
		{ 
			description: 'Cosine (in degrees)',
			param: [ { _bracket: '[' }, { _param: [ { value: 'value' } ] }, { _bracket: ']' } ]
		}
	],
	'tan': [	
		{ 
			description: 'Tangent (in degrees)',
			param: [ { _bracket: '[' }, { _param: [ { value: 'value' } ] }, { _bracket: ']' } ]
		}
	],
	'asin': [	
		{ 
			description: 'Arcsine',
			param: [ { _bracket: '[' }, { _param: [ { value: 'value' } ] }, { _bracket: ']' } ]
		}
	],
	'acos': [	
		{ 
			description: 'Arccosine',
			param: [ { _bracket: '[' }, { _param: [ { value: 'value' } ] }, { _bracket: ']' } ]
		}
	],
	'atan': [
		{ 
			description: 'Arc tangent (two parameters), ATN can also be used',
			param: [ { _bracket: '[' }, { _param: [ { value1: 'value1'} ] }, { _bracket: ']' }, { _escape: '/' }, { _bracket: '[' }, { _param: [ { value2: 'value2'} ] }, { _bracket: ']' } ]
		},
		{ 
			description: 'Arc tangent (one parameter), ATN can also be used.',
			param: [ { _bracket: '[' }, { _param: [ { value: 'value'} ] }, { _bracket: ']' } ]
		},
		{ 
			description: 'Arc tangent (two parameters), ATN can also be used',
			delimiter: ',', 
			param: [ { _bracket: '[' }, { _param: [ { value1: 'value1' } , { value2: 'value2'} ] }, { _bracket: ']' } ]
		}
	],
	'sqrt': [	
		{ 
			description: 'Square root, SQR can also be used',
			param: [ { _bracket: '[' }, { _param: [ { value: 'value' } ] }, { _bracket: ']' } ]
		}
	],
	'abs': [	
		{ 
			description: 'Absolute value',
			param: [ { _bracket: '[' }, { _param: [ { value: 'value' } ] }, { _bracket: ']' } ]
		}
	],
	'bin': [	
		{ 
			description: 'Conversion from BCD to binary function',
			param: [ { _bracket: '[' }, { _param: [ { value: 'value' } ] }, { _bracket: ']' } ]
		}
	],
	'bcd': [	
		{ 
			description: 'Sine (in degrees)',
			param: [ { _bracket: '[' }, { _param: [ { value: 'value' } ] }, { _bracket: ']' } ]
		}
	],
	'round': [	
		{ 
			description: 'Rounding off, RND can also be used',
			param: [ { _bracket: '[' }, { _param: [ { value: 'value' } ] }, { _bracket: ']' } ]
		}
	],
	'fix': [	
		{ 
			description: 'Rounding down to an integer',
			param: [ { _bracket: '[' }, { _param: [ { value: 'value' } ] }, { _bracket: ']' } ]
		}
	],
	'fup': [	
		{ 
			description: 'Rounding up to an integer',
			param: [ { _bracket: '[' }, { _param: [ { value: 'value' } ] }, { _bracket: ']' } ]
		}
	],
	'ln': [	
		{ 
			description: 'Natural logarithm',
			param: [ { _bracket: '[' }, { _param: [ { value: 'value' } ] }, { _bracket: ']' } ]
		}
	],
	'exp': [	
		{ 
			description: 'Exponent using base e (2.718...)',
			param: [ { _bracket: '[' }, { _param: [ { value: 'value' } ] }, { _bracket: ']' } ]
		}
	],
	'pow': [	
		{ 
			description: 'Power (#j to the #kth power)',
			delimiter: ',', 
			param: [ { _bracket: '[' }, { _param: [ { base: 'base' }, { exponent: 'exponent' } ] }, { _bracket: ']' } ]
		}
	],
	'adp': [	
		{ 
			description: 'Addition of a decimal point',
			param: [ { _bracket: '[' }, { _param: [ { value: 'value' } ] }, { _bracket: ']' } ]
		}
	],
	'prm': [
		{ 
			description: 'Parameter reading (system common, path, or machine group parameter)',
			param: [ { _bracket: '[' }, { _param: [ { value1: 'value1' } ] }, { _bracket: ']' }, { _escape: '/' }, { _bracket: '[' }, { _param: [ { value2: 'value2'} ] }, { _bracket: ']' } ]
		},
		{ 
			description: 'Parameter reading (system common, path, or machine group parameter)',
			param: [ { _bracket: '[' }, { _param: [ { value: 'value' } ] }, { _bracket: ']' } ]
		},	
		{ 
			description: 'Parameter reading (system common, path, or machine group parameter bit number specification)',
			delimiter: ',', 
			param: [ { _bracket: '[' }, { _param: [ { value1: 'value1' }, { value2: 'value2' } ] }, { _bracket: ']' } ]
		}
	]
};
