# Fanuc Macro Executor VS Code 擴充

<img src="./resources/icon.png" alt="drawing" width="100"/>

[![open issues](https://img.shields.io/github/issues/iSorp/macro-executor.svg?)](https://github.com/iSorp/macro-executor/issues)
[![license](https://img.shields.io/github/license/iSorp/macro-executor)](https://opensource.org/licenses/MIT)
[![Build Status](https://dev.azure.com/iSorp/fanuc-macro-executor/_apis/build/status/iSorp.macro-executor?branchName=master)](https://dev.azure.com/iSorp/fanuc-macro-executor/_build/latest?definitionId=2&branchName=master)


Visual Studio Code 的擴充，支援 Fanuc Macro Executor 程式語言，包括語法高亮、驗證與專案建置。


## 最新消息
- 文件格式化
- 來電與去電的函式呼叫階層

***


## 功能
* 編譯與連結
* 編譯器問題比對器
* 語法／語意高亮
* 語法驗證
* 符號提供者
* 完成提示提供者
* 程式碼透鏡 (CodeLens)
* 程式碼校對 (Lint)
* 序列號重整
* 函式呼叫階層
* 格式化提供者

## 支援顯示語言
* English `en`
* Deutsch `de`
* 中文 `zh-cn`
* 中文 `zh-tw`

## 必要檔案副檔名
* Macro 檔案 `.src`
* Include 檔案 `.def` 
* Link 檔案 `.lnk` 

如需讓其他副檔名關聯到 macro executor 語言，請參考以下設定範例：

```json
   "files.associations": {
        "*.PRG": "macro"
    }
```

## 程式撰寫慣例
* `$Include` 路徑必須是絕對路徑或相對於工作區資料夾
* 常數使用大寫：`@MY_CONSTANT 100`
* 陳述式之間要有空格：`O SUB_PROGRAM; N9000 G01 X1; DO 1; END 1; GOTO 1` 等
* 為變數宣告 (`@var`) 所寫的註解 <span style="color:green">**/* my comment**</span>，將會顯示於**滑鼠懸停**與**自動完成**的提示訊息中。

## 驗證
![Validation](./resources/validation.gif)

## 參考
參考服務支援以下類型的搜尋：
* 符號
* 標籤
* 序列號
* GOTO 標籤／序列號
* M-Code 與 G-Code
* Macro 變數（#..） 
* 位址

若定義透過 `.def` 的 definition 檔包含，則符號與標籤的參考搜尋為全域（工作區）。否則搜尋僅限於目前檔案範圍。序列號只會在檔案範圍內搜尋（目前沒有函式範圍）。

### 序列號定義
![References](./resources/sequenceref.gif)

### 符號參考
![References](./resources/references.gif)

## 實作

以下類型的實作可透過實作搜尋服務找到：

* 子程式
* 標籤語句
* GOTO 標籤／序列號 

全域／區域搜尋行為與參考搜尋相同。


![Implementations](./resources/implementations.gif)


## 函式的序列號重整
* 完成時連續編號（Snippet N-Number）
* 重新編號序列的命令（包含 GOTOs）
* 新增缺失序列的命令（適用 NC 陳述式）


## 語意高亮

語意高亮用於標示符號所代表的類型。支援以下類型：
* M-Code 與 G-Code
* 位址
* 參數
* Macro 變數
* 常數
* 標籤

對於某些配色主題，必須在設定中啟用語意高亮：

```json
"editor.semanticTokenColorCustomizations": {
       "enabled": true,
}
```

| disabled | enabled     |
|:-------------:|:-------------:|
| ![no semantic](./resources/no_semantic.png) | ![with Semantic](./resources/with_semantic.png) |


*螢幕截圖所使用的配色主題 →* **[Noctis](https://marketplace.visualstudio.com/items?itemName=liviuschera.noctis#review-details)**

## 自訂關鍵字

* 高亮
* hover 與完成提示的說明

擴充預設支援對 ``>`` 標籤、``@`` 符號、M/G-Codes 與變數的語意高亮。有時可能希望針對特定符號或特定類型（例如巨集變數）調整預設高亮。
你可以在使用者／工作區設定中，透過 `macro.keywords` 加入自訂關鍵字項目來達成：


| **Keyword item**|                               | 
|-------------|-----------------------------------|
| symbol      | 符號文字                           |
| scope       | [Scopes](#Scopes)                 |
| nodeType    | 標籤、符號、Code（M/G）、變數        |
| description | Markdown `string` \| `string[]`   |


`nodeType` 欄位定義該關鍵字在巨集程式中的類型。若為空，關鍵字項目會影響該符號的所有出現位置，不論其類型。例如若要為特定 P-Code 變數加入**滑鼠懸停**文字，可如下設定：

```json
{
       "symbol": "10000",
       "nodeType" :"Variable",
       "description": "某變數說明"
}
```

### Scopes
|           | Style for compile-time Variable nodeType | 
|-----------|------------------------------------------|
| number    | 數值 (@var  10000) |
| macrovar  | Macro 變數 (@var     #10000)             |
| constant  | 常數數值 (@UPPER  10000)             |
| language  | 語言常數（例如 true/false）          |
| label     | 標籤                                        |
| code      | M-Code/G-Code                                |
| parameter | NC-參數                                 |
| address   | 地址                                      |


這些 scopes 會在內部使用，並依據所選配色主題（例如 **[Noctis](https://marketplace.visualstudio.com/items?itemName=liviuschera.noctis#review-details)**）決定符號樣式。若要覆寫樣式，請在 `editor.semanticTokenColorCustomizations` 設定中加入 **[rules](https://github.com/microsoft/vscode/wiki/Semantic-Highlighting-Overview#as-a-theme-author-do-i-need-to-change-my-theme-to-make-it-work-with-semantic-highlighting)**。

若預設 scopes 不需更動，可以使用額外的自訂 scopes `custom_1` - `custom_5`：


### 範例

以下範例將符號 `M08`（預設 scope 為 `code`）改為 `custom_1`，並將 `custom_1` 設定為紅色：

```json
"macro.keywords" : [
       {
              "symbol": "M08",
              "scope": "custom_1",
              "description": ["*Coolant*", "ON"]
       }
],

"editor.semanticTokenColorCustomizations": {
       "enabled": true,
       "rules": {
              "custom_1": "#ff0000"
       }
},
```

**[範例](https://github.com/iSorp/macro-executor/tree/master/doc/settings.example.json)**


## Multi-Root 工作區
此擴充支援 [multi-root workspaces](https://code.visualstudio.com/docs/editor/multi-root-workspaces)。每個工作區會被視為獨立的 macro 專案。
若 Fanuc 專案由多個控制器（例如機台與機械手）構成，會很有幫助：

![multi root workspace](./resources/mrworkspaces.png)


## Lint 程式碼校對
Lint 可透過設定（使用者或工作區）調整下列規則。
支援三種等級：`error`、`warning`、`ignore`。 

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
              "assignmentConstant":       "Ignore",
              "blockDelNumber":           "error",
              "unsuitableNNAddress":      "warning",
              "dataInputNotClosed" :      "error"
       }
```

## 預設命令

| Command | Key          |
|---------|--------------|
| Build   | Ctrl+Shift+B |
| Link / build all    | Ctrl+Shift+L |
| Clean   | Ctrl+Shift+C |


## 擴充設定

此擴充提供以下設定：

* `macro.callFunctions` : 自訂呼叫子程式函式（預設：M98, G65）
* `macro.keywords` : [自訂關鍵字](#custom-Keywords)
* `macro.lint`: 程式碼校對(Lint)設定與規則
* `macro.sequence.base`: 重整時序列起始號
* `macro.sequence.increment`: 重整時序列遞增
* `macro.validate.enable`: 啟用或停用驗證
* `macro.validate.workspace`: 啟用或停用工作區驗證
* `macro.validate.onBuild`: 建置專案時啟用或停用工作區驗證
* `macro.fileEncoding`: 從磁碟讀取巨集檔案時使用的編碼（zh-tw 請用 `cp950`）

建置設定：
* `macro.build.compiler`: 選擇巨集編譯器
* `macro.build.controlType`: 選擇控制器類型
* `macro.build.compilerParams`: 額外編譯器參數：-NR, -L1, -L2, -L3, -PR
* `macro.build.linkerParams`: 額外連結器參數：-NR, -NL, -Fm, -Fr
* `macro.build.makeFile`: Makefile 的路徑
* `macro.project.exportPath`: 記憶卡檔案 (.mem) 的目錄路徑
* `macro.project.sourcePath`: 來源檔案 (.src) 的目錄路徑
* `macro.project.buildPath`: 建置檔案的目錄路徑
* `macro.project.linkPath`: 連結檔 (.lnk) 與函式庫 (.mex) 的目錄路徑


## 外部建置系統
建置流程可透過外部腳本或內建系統執行。若使用外部腳本，只需將路徑設定在 `macro.build.makeFile`。
若該目錄存在 `clean` 腳本，清理流程會使用它。
外部腳本會收到以下參數：

1. 匯出目錄
2. 選項 [make, clean]。
3. 編譯器
4. 控制器類型參數


## 內建建置系統
若 `macro.build.makeFile` 為空則使用內建系統。
>- 目前僅在 powershell 可用（請將預設 shell 設為 powershell）
>- 編譯器必須在系統 path 中可用
>- `macro.project.sourcePath` 及其子資料夾下的所有 `.src` 檔都會被編譯
>- Link 檔中的 library path 有兩種寫法：
>      1. 絕對路徑：*CNC=C:\lib.mex*
>      2. 相對路徑：*CNC=..\lnk\lib.mex*（相對於 `macro.project.buildPath`）

### 範例

#### 目錄結構
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

#### 設定

![Implementations](./resources/projectsetting.png)

若不需要額外的目錄結構，以下路徑也可留空：
* `macro.project.exportPath`
* `macro.project.sourcePath`
* `macro.project.buildPath`

#### Link 檔

```
CNC=..\lnk\F30iA_01.MEX
```

#### Source 檔

```
/* file1.src
$INCLUDE def\file1.def
```

```  
/* file3.src
$INCLUDE def\file2.def
```


## 16 位元編譯器

若主機系統不支援 16 位元 macro 程式，可使用 [Dosbox](https://www.dosbox.com/) 編譯。
以下為 [task](https://code.visualstudio.com/Docs/editor/tasks) 設定範例，將 dosbox 當作指令並傳入建置腳本：

```json
{
       "label": "Fanuc Macro 16bit build",
       "type": "shell",
       "command": "C:/Program Files (x86)/DOSBox-0.74-3/DOSBox.exe",
       "args": [
              "Make.bat",
              "-noconsole"
       ],
       "group": {
              "kind": "build",
              "isDefault": true
       },
       "presentation": {
              "echo": true,
              "reveal": "always",
              "focus": false,
              "panel": "shared",
              "showReuseMessage": true,
              "clear": false
       },
       "problemMatcher": []
}
```


-----------------------------------------------------------------------------------------------------------



## 致謝

特別感謝 Jeff 翻譯繁體中文說明
