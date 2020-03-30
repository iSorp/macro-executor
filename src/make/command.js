var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) {
        if (b.hasOwnProperty(p)) {
            d[p] = b[p];
        }
    }
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var vscode = require("vscode");
var cp = require("child_process");
var outputChannel = vscode.window.createOutputChannel("MacroCompiler");

var Command = (function () {
    function Command(description, executable, parameters, output, state) {

        this._description = description;
        this._executable = executable;
        this._parameters = parameters;
        this._output = output;
        if (typeof this._parameters !== "string") {
            this._parameters = "";
        }
        this._state = state;
    }
    Object.defineProperty(Command.prototype, "description", {
        get: function () {
            return this._description;
        },
        enumerable: true,
        configurable: true
    });
    Command.prototype.run = function (startIn) {
        var _this = this;
        var parameters = this.applyTemplate(this._parameters);
        startIn = this.applyTemplate(startIn);
        var command = "\"" + this._executable + "\" " + parameters;
        var options = {};
        if (startIn) {
            options.cwd = startIn;
        }
        cp.exec(command, options, function (error, stdout, stderr) {
            if (!_this._output) {
                return;
            }
            var output;
            output = stdout.toString();
            output += stderr.toString();
            if (error !== null) {
                output += error.message;
            }
            outputChannel.clear();
            outputChannel.append(output);
            outputChannel.show();
        });
    };
    Command.prototype.applyTemplate = function (str) {
        if (!str) {
            return str;
        }
        str = str.replace(/%item%/ig, this._state.activeItem);
        str = str.replace(/%item_path%/ig, this._state.activeItemPath);
        str = str.replace(/%workspace%/ig, this._state.workspacePath);
        return str;
    };
    return Command;
})();
exports.Command = Command;
var TerminalCommand = (function (_super) {
    __extends(TerminalCommand, _super);
    function TerminalCommand(args, state) {
        var executable = args["exec"];
        var parameters = args["param"];
        _super.call(this, "Terminal", executable, parameters, true, state);
    }
    return TerminalCommand;
})(Command);
exports.TerminalCommand = TerminalCommand;