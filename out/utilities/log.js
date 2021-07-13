"use strict";
exports.__esModule = true;
exports.log = exports.get_timestamp = exports.chalkify = exports.LogType = void 0;
var Chalk = require("chalk");
var LogType;
(function (LogType) {
    LogType[LogType["None"] = 0] = "None";
    LogType[LogType["Status"] = 1] = "Status";
    LogType[LogType["Error"] = 2] = "Error";
    LogType[LogType["Success"] = 3] = "Success";
    LogType[LogType["System"] = 4] = "System";
    LogType[LogType["Mismatch"] = 5] = "Mismatch";
    LogType[LogType["Incompatibility"] = 6] = "Incompatibility";
    LogType[LogType["FixedError"] = 7] = "FixedError";
    LogType[LogType["PromiseRejection"] = 8] = "PromiseRejection";
})(LogType = exports.LogType || (exports.LogType = {}));
exports.chalkify = function (message, color) {
    switch (color) {
        case LogType.Error:
            return Chalk.red(message);
            break;
        case LogType.Success:
            return Chalk.green(message);
            break;
        case LogType.System:
            return Chalk.blue(message);
            break;
        case LogType.Mismatch:
            return Chalk.magenta(message);
            break;
        case LogType.None:
            return message;
            break;
        case LogType.Status:
            return Chalk.yellow(message);
            break;
        case LogType.Incompatibility:
            return Chalk.gray(message);
            break;
        case LogType.FixedError:
            return Chalk.cyan(message);
            break;
        case LogType.PromiseRejection:
            return Chalk.redBright(message);
            break;
    }
};
exports.get_timestamp = function () {
    var date = new Date();
    return "(" + date.getDate().toString() + "/" + (date.getMonth() + 1).toString() + "/" + date.getFullYear().toString() + " " + date.getHours().toString() + ":" + date.getMinutes().toString() + ") ";
};
exports.log = function (message, type, no_timestamp) {
    if (type === void 0) { type = LogType.None; }
    if (no_timestamp === void 0) { no_timestamp = false; }
    var timestamp = "";
    if (no_timestamp === false) {
        timestamp = exports.get_timestamp() + " ";
    }
    console.log(timestamp + exports.chalkify(message, type));
};
//# sourceMappingURL=log.js.map