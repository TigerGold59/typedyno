"use strict";
exports.__esModule = true;
exports.allowed = exports.allowed_under = exports.InclusionSpecifierType = void 0;
var typeutils_1 = require("./typeutils");
var InclusionSpecifierType;
(function (InclusionSpecifierType) {
    InclusionSpecifierType[InclusionSpecifierType["Whitelist"] = 0] = "Whitelist";
    InclusionSpecifierType[InclusionSpecifierType["Blacklist"] = 1] = "Blacklist";
})(InclusionSpecifierType = exports.InclusionSpecifierType || (exports.InclusionSpecifierType = {}));
exports.allowed_under = function (snowflake, specifier) {
    if (!snowflake) {
        return false;
    }
    if (!specifier) {
        return false;
    }
    var list = specifier.list.map(function (el) { return typeutils_1.to_string(el); });
    var string_snowflake = typeutils_1.to_string(snowflake);
    switch (specifier.type) {
        case InclusionSpecifierType.Blacklist:
            if (list.includes(string_snowflake)) {
                return false;
            }
            else {
                return true;
            }
        case InclusionSpecifierType.Whitelist:
            if (list.includes(string_snowflake)) {
                return true;
            }
            else {
                return false;
            }
    }
};
exports.allowed = function (message, permissions) {
    if (exports.allowed_under(message.guild.id, permissions.servers)) {
        if (exports.allowed_under(message.channel.id, permissions.channels)) {
            if (exports.allowed_under(message.author.id, permissions.users)) {
                return true;
            }
            else {
                return false;
            }
        }
        else {
            return false;
        }
    }
    else {
        return false;
    }
};
//# sourceMappingURL=permissions.js.map