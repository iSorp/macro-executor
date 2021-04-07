## 0.3.2  (April 07, 2021)
- Bug fixes
	- Appropriate string statements

## 0.3.0  (March 29, 2021)
- Advanced Parser
	- A virtual symbol replacement allows any definition value
	- Concatenated statements are now valid (no blanks required)
	- BLOCKDEL support
- Additional unit tests

## 0.2.4  (November 10, 2020)
- Bug fixes
	- Completion symbol comment text fix
	- bcd/bin function text
- Allowed symbol char '$' added


## 0.2.3  (October 13, 2020)
- Additional linker parameter
- Bug fixes
	- Comment reference for labels
	- Comment highlighting after include statement
	- No space between comment (/*) and statement needed

## 0.2.2  (August 4, 2020)
- README 16bit compiler
- Force document parsing when changing .def file
- Line comments
- Bugfix set export path 


## 0.2.1  (July 14, 2020)
- node module languageserver/client update
- Multiline keyword description

## 0.2.0  (July 12, 2020)
- Multi-Root Workspace
- Custom Keywords (symbol, semantic scope, description)
- M-Code, G-Code, macro variable(#..) and address reference search
- Bug fixes Parser
	- NewLine checks
- Tests

## 0.1.17 (June 25, 2020)
- Language service tests 
- Sequence number refactoring skip on G10/G11
- Sequence number reference search
- GOTO Label/Sequence number implementation search
- GOTO Label/Sequence validation
- Bug fixes Parser
	- Error matches while statement

## 0.1.16 (June 18, 2020)
- Bugfix -Fl export path
- Bugfix compiler problem matcher 

## 0.1.15 (June 17, 2020)
- Bugfix Parameter symbol definition (e.g. @PARAM	F)
- Building: Relative paths for fanuc executables (compiler, linker, formater)

## 0.1.14 (June 11, 2020)
- Signatures for build-in functions
- Array support
- Custom macro commands

## 0.1.13 (June 7, 2020)
- Syntax highlighting
- Semantic highlighting
- Bug fixes Parser (% eof sign added)
- Additional compiler parameter

## 0.1.12 (May 26, 2020)
- Rename provider
- Block skip support
- clean up
- while control statement do/end number check (nesting)

## 0.1.11 (May 20, 2020)
- Text fixes
- Directory tree with more than one level
- Additional compiler selections

## 0.1.10 (May 18, 2020)
-  Sequence number deep search

## 0.1.9 (May 18, 2020)
- Lint settings
- Label-Sequence number overlap check
- Duplicate value check
- Conditional logic check (max 4 statements, no mixed up operators)
- Supported display languages (English, Deutsch, 中文)
- Bug fixes (Sequence number refactoring if duplicates exists) 	

## 0.1.8 (May 11, 2020)
- Bug fixes Parser 	
	- Parsing of declared statements  (@var G04P10)
	- Declared G and M codes shown as events (outline, completion)
	- Allow expression in declarations e.g @var #[1+[1]]
	- Axis number based command & e.g. G01 &A 1
	- Code completion specified for certain nodes
	- Error matching improved
	- Allow Backslash in strings and includes
- Sequence number (N-Number) completion
- Sequence number refactoring

## 0.1.7 (May 06, 2020)
- Completions provider

## 0.1.6 (May 06, 2020)
- Performance update

## 0.1.5 (May 04, 2020)
- Node package issue

## 0.1.4 (May 02, 2020)
- Opening links with capital letters issue fixed 
- Duplicate label statement warning
- CodeLens for variable and label declarations 

## 0.1.3 (May 01, 2020)
- Missing arithmetic functions implemented
- Implementation provider for sub programs
- Error on global reference search fixed

## 0.1.2 (April 29, 2020)
- File extension search non casesensitive

## 0.1.1 (April 29, 2020)
- Prevent problem matcher from deleting existing problems
- Symbol detection of left conditional term

## 0.1.0 (April 28, 2020)
- Macro language server
- Symbol provider
- Navigation provider
- Syntax validation

## 0.0.4 (March 31, 2020)
- Problem matcher file search path is now "${fileDirname}"

## 0.0.3 (March 30, 2020)
- While Snippet
- HoverProvider for visualizing parameter definition

## 0.0.2 (March 27, 2020)
- Package aliases

## 0.0.1 (March 27, 2020)
- Initial release



