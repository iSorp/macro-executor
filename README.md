# Fanuc Macro Executor

<img src="./resources/icon.png" alt="drawing" width="100"/>

![maintained](https://img.shields.io/maintenance/yes/2020.svg)
[![open issues](https://img.shields.io/github/issues/iSorp/macro-executor.svg?)](https://github.com/iSorp/macro-executor/issues)
[![license](https://img.shields.io/github/license/iSorp/macro-executor)](https://opensource.org/licenses/MIT)
[![Build Status](https://dev.azure.com/iSorp/fanuc-macro-executor/_apis/build/status/iSorp.macro-executor?branchName=master)](https://dev.azure.com/iSorp/fanuc-macro-executor/_build/latest?definitionId=2&branchName=master)

Fanuc Macro Executor syntax highlighting, validating and project building 


## News
- [Multi-Root Workspaces](#multi-root-workspaces)
- [Custom Keywords](#Customization)

***
       

## Features
* Compiling and linking
* Compiler problem matcher
* Syntax/Semantic highlighting
* Syntax validation
* Symbol provider
* Completion provider
* CodeLens
* Lint features
* Sequence number refactoring

## Supported display languages
* English `en`
* Deutsch `de`
* 中文 `zh-cn`

## Required file extensions
* Macro files`.src`
* Include files `.def` 
* Link files `.lnk` 

## Coding conventions
* `$Include` paths must be absolute or relative to the workspace folder
* Uppercase for constants: `@MY_CONSTANT 100`
* Space between statements: `O SUB_PROGRAM; N9000 G01 X1; DO 1; END 1; GOTO 1` etc.
* A comment of a declaration `@var` <span style="color:green">**/* my comment**</span> is displayed on hover and completion

## Validation
![Validation](./resources/validation.gif)

## References
The reference service supports the search for the following types:
* Symbols
* Labels
* Sequence numbers
* GOTO Label/sequence numbers
* M-Codes and G-Codes
* Macro variables (#..) 
* Addresses

The search for symbol and label references is global (workspace) if the definitions are included by a definition file `.def`, otherwise the search is limited to the current file scope. Sequence numbers only can be found within a file scope (there is currently no function scope available).

### Sequence number definition
![References](./resources/sequenceref.gif)

### Symbol references
![References](./resources/references.gif)

## Implementations

Implementations of one of the following types are found by the implementations search service:

* Subprograms
* Label statements
* GOTO Label/Sequence number 

The global / local search behavior is equal to the reference search.


![Implementations](./resources/implementations.gif)


## Sequence number refactoring for functions
* Consecutive numbering on completion (snippet N-Number)
* Command for renumbering sequences (incl. GOTOs)
* Command for adding missing sequences (for NC statements)


## Semantic highlighting

Semantic highlighting is used to highlight the represented type of a symbol. Following types are supported:
* M-Code and G-Code
* PMC Address
* Macro variable
* Constant
* Label

For some color themes, the semantic highlighting must be enabled in the settings:

```json
"editor.semanticTokenColorCustomizations": {
       "enabled": true,
}
```

| disabled | enabled     |
|:-------------:|:-------------:|
| ![no semantic](./resources/no_semantic.png) | ![with Semantic](./resources/with_semantic.png) |


*The color theme used in screenshot →* **[Noctis](https://marketplace.visualstudio.com/items?itemName=liviuschera.noctis#review-details)**

## Customization

* Symbol highlighting
* Symbol description for hover and completion

Out of the box the extension supports syntax highlighting for the common types, but sometimes it could be useful to change the default highlighting for a particular symbol or for a type of a symbol like a variable. 

A customization can be achieved by adding custom keyword items to the configuration property `macro.keywords` in the user/workspace settings:


|     **Keyword item**| | 
|-------------|----------------------------|
| scope       | see Scopes below           |
| nodeType    | Label, Variable, Code      |
| description | Markdown string            |


The field `nodeType` defines the related type in the macro program. If the field is empty, a keyword item will affect all symbol occurrences. E.g. if you want to add a hower text to a particular P-Code variable, an item could be structed as follows:

```json
{
       "symbol": "10000",
       "nodeType" :"Variable",
       "description": "some variable text"
}
```

### Scopes
|    | | 
|-----------|---------------------------------------------------------------------|
| number    | Style for compile-time number                                       |
| macrovar  | Style for compile-time macro variable (@var     #10000)             |
| symbol    | Style for compile-time symbol (@var             R100.0, @var  1000) |
| constant  | Style for compile-time constant symbol (@UPPER  #10000)             |
| language  | Style for compile-time language constant                            |
| label     | Style for compile-time label                                        |
| code      | Style for compile-time M-Code/G-Code                                |
| parameter | Style for compile-time NC-Parameter                                 |
| address   | Style for compile-time address                                      |
|           |                                                                     |


 These scopes are used internally and the colorization depends on the chosen color theme like **[Noctis](https://marketplace.visualstudio.com/items?itemName=liviuschera.noctis#review-details)**. To override the colorization just add **[rules](https://github.com/microsoft/vscode/wiki/Semantic-Highlighting-Overview#as-a-theme-author-do-i-need-to-change-my-theme-to-make-it-work-with-semantic-highlighting)** to the `editor.semanticTokenColorCustomizations` settings.
 
In case the default scopes should be unchanged, the additional custom scopes `custom_1` - `custom_5` could be used:


### Example

The following example changes the symbol `M08`, which has a default scope `code`, to `custom_1` and the scope `custom_1` is associated with the color red:

```json
"macro.keywords" : [
       {
              "symbol": "M08",
              "scope": "custom_1",
              "description": "*Coolant*"
       }
],

"editor.semanticTokenColorCustomizations": {
       "enabled": true,
       "rules": {
              "custom_1": "#ff0000"
       }
},
```

**[Example on github](https://github.com/iSorp/macro-executor/tree/master/doc/settings.example.json)**


## Multi-Root Workspaces
The extension supports [multi-root workspaces](https://code.visualstudio.com/docs/editor/multi-root-workspaces). Each workspace is handled as a separate macro project.
This could be useful if a fanuc project consists of several controls e.g machine and handling:

![multi root workspace](./resources/mrworkspaces.png)



## Lint
The Lint is configurable by changing the following rules in the settings (user or workspace).
Three levels are supported: `error`, `warning` and `ignore`. 

```json
"macro.lint": {
       "rules" : {
              "duplicateInclude":         "error",
              "duplicateDeclaration":     "error",
              "duplicateFunction":        "warning",
              "duplicateAddress":         "ignore",
              "duplicateSequence":        "warning",
              "duplicateLabel":           "warning",
              "duplicateLabelSequence":   "warning",
              "unknownSymbol":            "error",
              "whileLogicOperator":       "error",
              "doEndNumberTooBig":        "error",
              "doEndNumberNotEqual":      "error",
              "nestingTooDeep":           "error",
              "duplicateDoEndNumber":     "warning",
              "mixedConditionals":        "error",
              "tooManyConditionals":      "error",
              "seqNotFound":              "error",   
              "incompleteParameter":      "error",
              "includeNotFound":          "error",
              "assignmentConstant":       "warning"
       }
```

## Default Commands

| Command | Key          |
|---------|--------------|
| Build   | Ctrl+Shift+B |
| Link / build all    | Ctrl+Shift+L |
| Clean   | Ctrl+Shift+C |


## Extension Settings

This extension contributes the following settings:

* `macro.lint`: Lint settings and rule configuration
* `macro.sequence.base`: Sequences start number for refactoring
* `macro.sequence.increment`: Sequences increment for refactoring
* `macro.codelens.enable`: Enables or disables the CodeLens function. **Deprecated**: Please use `editor.codeLens` instead.
* `macro.validate.enable`: Enables or disables the validation
* `macro.validate.workspace`: Enables or disables the workspace validation

Build settings:
* `macro.build.compiler`: Selection of the macro compiler
* `macro.build.controlType`: Selection of the control type
* `macro.build.compilerParams`: Additional compiler parameters: -NR, -L1, -L2, -L3, -PR
* `macro.build.makeFile`: The path to the makefile
* `macro.project.exportPath`: The path to the directory for the memory card file (.mem)
* `macro.project.sourcePath`: The path to the directory for the source files (.src)
* `macro.project.buildPath`: The path to the directory for the build files
* `macro.project.linkPath`: The path to the directory for the link files (.lnk) and the library (.mex)


## External build system
The building process can be performed by using an external script or the internal system. If an external script is used,
just set the path in `macro.build.makeFile`. If a `clean` script in the same directory exists, it is used for the cleaning process.
The following parameters are passed to the external script: 

1. Export directory
2. Option [make, clean].
3. Compiler
4. Control type parameter


## Internal build system
If `macro.build.makeFile` is empty the internal system is used.
>- Currently only working with powershell (select default shell -> powershell)
>- The compiler must be available over the system path
>- All `.src` files under the folder `macro.project.sourcePath` and its subfolders will be compiled
>- There are two ways to define a libray path in a link file:
>      1. absolute: *CNC=C:\lib.mex*
>      2. relative: *CNC=..\lnk\lib.mex* (relative to `macro.project.buildPath`)

### Example

#### Directory tree
```
project 
│
└───src
│   │   file1.src
│   │   file2.src  
│   │ 
│   └───sub
│           file3.src
│           file4.src 
└───def
│      file1.def
│      file2.def
│ 
└───lnk
│      file1.lnk
│      file2.lnk
│      F30iA_01.MEX
│
└───bin
       .rom
       .ref
       .prg
```

#### Settings

![Implementations](./resources/projectsetting.png)

The path settings could also be empty if no further directory tree is needed
* `macro.project.exportPath`
* `macro.project.sourcePath`
* `macro.project.buildPath`

#### Link file

```
CNC=..\lnk\F30iA_01.MEX
```

#### Source file

```
/* file1.src
$INCLUDE def\file1.def
```

```  
/* file3.src
$INCLUDE def\file2.def
```

-----------------------------------------------------------------------------------------------------------



## Credits

Special thanks to Pan and Yu for translating the chinese texts

特别感谢潘先生和于先生翻译了中文文本