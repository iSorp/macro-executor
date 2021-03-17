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
			description: 'Arc tangent (one parameter), ATN can also be used',
			param: [ { _bracket: '[' }, { _param: [ { value: 'value'} ] }, { _bracket: ']' } ]
		},
		{ 
			description: 'Arc tangent (two parameters), ATN can also be used',
			delimiter: ',', 
			param: [ { _bracket: '[' }, { _param: [ { value1: 'value1' } , { value2: 'value2'} ] }, { _bracket: ']' } ]
		}
	],
	'atn': [
		{ 
			description: 'Arc tangent (two parameters)',
			param: [ { _bracket: '[' }, { _param: [ { value1: 'value1'} ] }, { _bracket: ']' }, { _escape: '/' }, { _bracket: '[' }, { _param: [ { value2: 'value2'} ] }, { _bracket: ']' } ]
		},
		{ 
			description: 'Arc tangent (one parameter)',
			param: [ { _bracket: '[' }, { _param: [ { value: 'value'} ] }, { _bracket: ']' } ]
		},
		{ 
			description: 'Arc tangent (two parameters)',
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
	'sqr': [	
		{ 
			description: 'Square root',
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
			description: 'Conversion from BCD to binary',
			param: [ { _bracket: '[' }, { _param: [ { value: 'value' } ] }, { _bracket: ']' } ]
		}
	],
	'bcd': [	
		{ 
			description: 'Conversion from binary to BCD',
			param: [ { _bracket: '[' }, { _param: [ { value: 'value' } ] }, { _bracket: ']' } ]
		}
	],
	'round': [	
		{ 
			description: 'Rounding off, RND can also be used',
			param: [ { _bracket: '[' }, { _param: [ { value: 'value' } ] }, { _bracket: ']' } ]
		}
	],
	'rnd': [	
		{ 
			description: 'Rounding off',
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

export const NcCodeDescription: { [name: string]: string } = {
	'G00':'Rapid positioning',
	'G01':'Linear interpolation',
	'G02':'Circular interpolation, clockwise',
	'G03':'Circular interpolation, counterclockwise',
	'G04':'Dwell',
	'G05':'	P10000	High-precision contour control (HPCC)',
	'G05.1':'Q1. AI Advanced Preview Control',
	'G06.1':'Non-uniform rational B-spline (NURBS) Machining',
	'G07':'Imaginary axis designation',
	'G09':'Exact stop check, non-modal',
	'G10':'Programmable data input',
	'G11':'Data write cancel',
	'G17':'XY plane selection',
	'G18':'ZX plane selection',
	'G19':'YZ plane selection',
	'G20':'Programming in inches',
	'G21':'Programming in millimeters (mm)',
	'G28':'Return to home position (machine zero, aka machine reference point)',
	'G30':'Return to secondary home position (machine zero, aka machine reference point)',
	'G31':'Feed until skip function',
	'G32':'Single-point threading, longhand style (if not using a cycle, e.g., G76)',
	'G33':'M: Constant-pitch threading \nT: Single-point threading, longhand style (if not using a cycle, e.g., G76)',
	'G34':'Variable-pitch threading',
	'G40':'Tool radius compensation off',
	'G41':'Tool radius compensation left',
	'G42':'Tool radius compensation right',
	'G43':'Tool height offset compensation negative',
	'G44':'Tool height offset compensation positive',
	'G45':'Axis offset single increase',
	'G46':'Axis offset single decrease',
	'G47':'Axis offset double increase',
	'G48':'Axis offset double decrease',
	'G49':'Tool length offset compensation cancel',
	'G50':'M: Scaling function cancel \nT1: Define the maximum spindle speed\n T2: Position register (programming of vector from part zero to tool tip)',
	'G52':'Local coordinate system (LCS)',
	'G53':'Machine coordinate system',
	'G54':'Work coordinate systems (WCSs)',
	'G54.1':'P1 to P48	Extended work coordinate systems',
	'G55':'Work coordinate systems (WCSs)',
	'G56':'Work coordinate systems (WCSs)',
	'G57':'Work coordinate systems (WCSs)',
	'G58':'Work coordinate systems (WCSs)',
	'G59':'Work coordinate systems (WCSs)',
	'G61':'Exact stop check, modal',
	'G62':'Automatic corner override',
	'G64':'Default cutting mode (cancel exact stop check mode)',
	'G68':'Rotate coordinate system',
	'G69':'Turn off coordinate system rotation',
	'G70':'Fixed cycle, multiple repetitive cycle, for finishing (including contours)',
	'G71':'Fixed cycle, multiple repetitive cycle, for roughing (Z-axis emphasis)',
	'G72':'Fixed cycle, multiple repetitive cycle, for roughing (X-axis emphasis)',
	'G73':'M: Peck drilling cycle for milling – high-speed (NO full retraction from pecks)\n Fixed cycle, multiple repetitive cycle, for roughing, with pattern repetition',
	'G74':'M: Tapping cycle for milling, lefthand thread, M04 spindle direction \nPeck drilling cycle for turning',
	'G75':'Peck grooving cycle for turning',
	'G76':'M: Fine boring cycle for milling \n Threading cycle for turning, multiple repetitive cycle',
	'G80':'Cancel canned cycle',
	'G81':'Simple drilling cycle',
	'G82':'Drilling cycle with dwell',
	'G83':'Peck drilling cycle (full retraction from pecks)',
	'G84':'Tapping cycle, righthand thread, M03 spindle direction',
	'G84.2':'Tapping cycle, righthand thread, M03 spindle direction, rigid toolholder',
	'G84.3':'Tapping cycle, lefthand thread, M04 spindle direction, rigid toolholder',
	'G85':'boring cycle, feed in/feed out',
	'G86':'boring cycle, feed in/spindle stop/rapid out',
	'G87':'boring cycle, backboring',
	'G88':'boring cycle, feed in/spindle stop/manual operation',
	'G89':'boring cycle, feed in/dwell/feed out',
	'G90':'M: Absolute programming \nT: Fixed cycle, simple cycle, for roughing (Z-axis emphasis)',
	'G91':'Incremental programming',
	'G92':'M: Position register (programming of vector from part zero to tool tip) \nT: Threading cycle, simple cycle',
	'G94':'M: Feedrate per minute \n Fixed cycle, simple cycle, for roughing (X-axis emphasis)',
	'G95':'Feedrate per revolution',
	'G96':'Constant surface speed (CSS)',
	'G97':'Constant spindle speed',
	'G98':'M: Return to initial Z level in canned cycle \n Feedrate per minute (group type A)',
	'G99':'M: Return to R level in canned cycle \nFeedrate per revolution (group type A)',
	'G100':'Tool length measurement',

	
	'M00':'Compulsory stop',
	'M01':'Optional stop',
	'M02':'End of program',
	'M03':'Spindle on (clockwise rotation)',
	'M04':'Spindle on (counterclockwise rotation)',
	'M05':'Spindle stop',
	'M06':'Automatic tool change (ATC)',
	'M07':'Coolant on (mist)',
	'M08':'Coolant on (flood)',
	'M09':'Coolant off',
	'M10':'Pallet clamp on',
	'M11':'Pallet clamp off',
	'M13':'Spindle on (clockwise rotation) and coolant on (flood)',
	'M19':'Spindle orientation',
	'M21':'M: Mirror, X-axis \nT: Tailstock forward',
	'M22':'M: Mirror, Y-axis \nT: Tailstock backward',
	'M23':'M: Mirror OFF\n T: Thread gradual pullout ON',
	'M24':'Thread gradual pullout OFF',
	'M30':'End of program, with return to program top',
	'M41':'Gear select – gear 1',
	'M42':'Gear select – gear 2',
	'M43':'Gear select – gear 3',
	'M44':'Gear select – gear 4',
	'M48':'Feedrate override allowed',
	'M49':'Feedrate override NOT allowed',
	'M52':'Unload Last tool from spindle',
	'M60':'Automatic pallet change (APC)',
	'M98':'Subprogram call',
	'M99':'Subprogram end'
};

export const SymbolText : { [node: string]: string } = {
	Variable: 'variable',
	Label: 'label',
	String: 'string',
	Numeric: 'number',
	Constant: 'number',
	Statement: 'statement',
	GCode: 'g-code',
	MCode: 'm-code',
	Address: 'address',
	Parameter: 'parameter',
}