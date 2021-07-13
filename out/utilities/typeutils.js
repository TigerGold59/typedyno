"use strict";
exports.__esModule = true;
exports.is_server = exports.to_string = exports.is_number = exports.is_string = void 0;
exports.is_string = function (thing) {
    if (thing === "") {
        return true;
    }
    else if (!thing) {
        return false;
    }
    else if (typeof thing === "string") {
        return true;
    }
    else {
        return false;
    }
};
exports.is_number = function (thing) {
    if (!thing) {
        return false;
    }
    else if (typeof thing === "number") {
        if (isNaN(thing)) {
            return false;
        }
        else if (!isFinite(thing)) {
            return false;
        }
        else {
            return true;
        }
    }
    else {
        return false;
    }
};
exports.to_string = function (snowflake) {
    if (exports.is_number(snowflake)) {
        return snowflake.toString();
    }
    else {
        return snowflake;
    }
};
exports.is_server = function (guild) {
    if (!guild) {
        return false;
    }
    return true;
};
//# sourceMappingURL=typeutils.js.map