var path = require("path");
var vscode = require("vscode");
var LauncherState = (function () {
    function LauncherState(textEditor) {
        if (textEditor === void 0) { textEditor = null; }
        this._workspacePath = null;
        this._activeItemPath = null;
        this._activeItem = null;
        this._workspacePath = vscode.workspace.rootPath;
        if (textEditor !== null) {
            this._activeItem = textEditor.document.fileName;
            this._activeItemPath = path.dirname(this._activeItem);
            if (this._activeItemPath === ".") {
                this._activeItemPath = null;
            }
        }
    }
    Object.defineProperty(LauncherState.prototype, "workspacePath", {
        get: function () {
            return this._workspacePath;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(LauncherState.prototype, "activeItem", {
        get: function () {
            return this._activeItem;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(LauncherState.prototype, "activeItemPath", {
        get: function () {
            return this._activeItemPath;
        },
        enumerable: true,
        configurable: true
    });
    return LauncherState;
})();
exports.LauncherState = LauncherState;