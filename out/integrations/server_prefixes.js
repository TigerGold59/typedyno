"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
exports.__esModule = true;
exports.set_prefix = exports.SetPrefixNonStringResult = exports.get_prefix = exports.get_prefix_entry = exports.NoLocalPrefixEntryReason = exports.GET_SERVER_LISTING = exports.ALTER_SERVER_LISTING = exports.CREATE_SERVER_LISTING = void 0;
var main_1 = require("../main");
var pg_1 = require("pg");
var typeutils_1 = require("../utilities/typeutils");
var log_1 = require("../utilities/log");
exports.CREATE_SERVER_LISTING = "INSERT INTO prefixes (snowflake, prefix) VALUES ($1, $2)";
exports.ALTER_SERVER_LISTING = "ALTER TABLE prefixes SET prefix=$1 WHERE snowflake=$2";
exports.GET_SERVER_LISTING = "SELECT (prefix) FROM prefixes WHERE snowflake=$1";
var NoLocalPrefixEntryReason;
(function (NoLocalPrefixEntryReason) {
    NoLocalPrefixEntryReason[NoLocalPrefixEntryReason["NoDatabaseEntry"] = 0] = "NoDatabaseEntry";
    NoLocalPrefixEntryReason[NoLocalPrefixEntryReason["InvalidGuildArgument"] = 1] = "InvalidGuildArgument";
})(NoLocalPrefixEntryReason = exports.NoLocalPrefixEntryReason || (exports.NoLocalPrefixEntryReason = {}));
function get_prefix_entry(server, query_device) {
    return __awaiter(this, void 0, void 0, function () {
        var prefixes;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (typeutils_1.is_string(server.id) === false) {
                        return [2, NoLocalPrefixEntryReason.InvalidGuildArgument];
                    }
                    return [4, query_device.query(exports.GET_SERVER_LISTING, [server.id])];
                case 1:
                    prefixes = _a.sent();
                    if (prefixes.rowCount === 0) {
                        return [2, NoLocalPrefixEntryReason.NoDatabaseEntry];
                    }
                    else {
                        return [2, prefixes.rows[0]];
                    }
                    return [2];
            }
        });
    });
}
exports.get_prefix_entry = get_prefix_entry;
function get_prefix(server, query_device) {
    return __awaiter(this, void 0, void 0, function () {
        var local_prefix;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!(query_device instanceof pg_1.Pool)) return [3, 2];
                    return [4, get_prefix_entry(server, query_device)];
                case 1:
                    local_prefix = _a.sent();
                    return [3, 4];
                case 2: return [4, get_prefix_entry(server, query_device)];
                case 3:
                    local_prefix = _a.sent();
                    _a.label = 4;
                case 4:
                    if (local_prefix === NoLocalPrefixEntryReason.NoDatabaseEntry) {
                        return [2, main_1.GLOBAL_PREFIX];
                    }
                    else if (local_prefix === NoLocalPrefixEntryReason.InvalidGuildArgument) {
                        log_1.log("Unexpected get_prefix error: Invalid guild argument (get_prefix_entry). Returning global prefix anyway...", log_1.LogType.Incompatibility);
                        return [2, main_1.GLOBAL_PREFIX];
                    }
                    else if (typeutils_1.is_string(local_prefix) === false) {
                        log_1.log("Unexpected get_prefix error: Invalid return type '" + typeof local_prefix + "' (expected string or NoLocalPrefixEntryReason). Returning global prefix anyway...", log_1.LogType.Mismatch);
                    }
                    else {
                        return [2, local_prefix];
                    }
                    return [2];
            }
        });
    });
}
exports.get_prefix = get_prefix;
var SetPrefixNonStringResult;
(function (SetPrefixNonStringResult) {
    SetPrefixNonStringResult[SetPrefixNonStringResult["InvalidGuildArgument"] = 0] = "InvalidGuildArgument";
    SetPrefixNonStringResult[SetPrefixNonStringResult["InvalidPrefixArgument"] = 1] = "InvalidPrefixArgument";
    SetPrefixNonStringResult[SetPrefixNonStringResult["LocalPrefixArgumentSameAsGlobalPrefix"] = 2] = "LocalPrefixArgumentSameAsGlobalPrefix";
    SetPrefixNonStringResult[SetPrefixNonStringResult["CreatedNewRow"] = 3] = "CreatedNewRow";
    SetPrefixNonStringResult[SetPrefixNonStringResult["DatabaseOperationFailed"] = 4] = "DatabaseOperationFailed";
})(SetPrefixNonStringResult = exports.SetPrefixNonStringResult || (exports.SetPrefixNonStringResult = {}));
exports.set_prefix = function (server, pool, prefix, pool_client) {
    return __awaiter(this, void 0, void 0, function () {
        var client, did_use_passed_pool_client, conditionally_release_pool_client, local_prefix_entry, err_1, err_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    did_use_passed_pool_client = true;
                    if (typeutils_1.is_string(server.id) === false) {
                        return [2, {
                                result: SetPrefixNonStringResult.InvalidGuildArgument,
                                did_succeed: false
                            }];
                    }
                    else if (prefix === main_1.GLOBAL_PREFIX) {
                        return [2, {
                                result: SetPrefixNonStringResult.LocalPrefixArgumentSameAsGlobalPrefix,
                                did_succeed: true
                            }];
                    }
                    else if (typeutils_1.is_string(prefix) === false) {
                        return [2, {
                                result: SetPrefixNonStringResult.InvalidPrefixArgument,
                                did_succeed: false
                            }];
                    }
                    conditionally_release_pool_client = function () {
                        if (did_use_passed_pool_client === false) {
                            client.release();
                        }
                    };
                    if (!!pool_client) return [3, 2];
                    return [4, pool.connect()];
                case 1:
                    client = _a.sent();
                    did_use_passed_pool_client = false;
                    return [3, 3];
                case 2:
                    client = pool_client;
                    _a.label = 3;
                case 3: return [4, get_prefix_entry(server, pool_client)];
                case 4:
                    local_prefix_entry = _a.sent();
                    if (!(local_prefix_entry === NoLocalPrefixEntryReason.NoDatabaseEntry)) return [3, 9];
                    _a.label = 5;
                case 5:
                    _a.trys.push([5, 7, , 8]);
                    return [4, pool.query(exports.CREATE_SERVER_LISTING, [server.id, prefix])];
                case 6:
                    _a.sent();
                    return [3, 8];
                case 7:
                    err_1 = _a.sent();
                    log_1.log("Unexpected database error: set_prefix failed when creating new row {'snowflake': " + server.id + ", 'prefix': " + prefix + "}. Message:", log_1.LogType.Error);
                    log_1.log(err_1, log_1.LogType.Error);
                    conditionally_release_pool_client();
                    return [2, {
                            result: SetPrefixNonStringResult.DatabaseOperationFailed,
                            did_succeed: false
                        }];
                case 8:
                    conditionally_release_pool_client();
                    return [2, {
                            result: SetPrefixNonStringResult.CreatedNewRow,
                            did_succeed: true
                        }];
                case 9:
                    if (!(local_prefix_entry === NoLocalPrefixEntryReason.InvalidGuildArgument)) return [3, 10];
                    conditionally_release_pool_client();
                    return [2, {
                            result: SetPrefixNonStringResult.InvalidGuildArgument,
                            did_succeed: false
                        }];
                case 10:
                    if (!typeutils_1.is_string(local_prefix_entry)) return [3, 15];
                    _a.label = 11;
                case 11:
                    _a.trys.push([11, 13, , 14]);
                    return [4, pool.query(exports.ALTER_SERVER_LISTING, [prefix, server.id])];
                case 12:
                    _a.sent();
                    return [3, 14];
                case 13:
                    err_2 = _a.sent();
                    log_1.log("Unexpected database error: set_prefix failed when altering row {'snowflake': " + server.id + ", 'prefix': " + prefix + "}. Message:", log_1.LogType.Error);
                    log_1.log(err_2, log_1.LogType.Error);
                    conditionally_release_pool_client();
                    return [2, {
                            result: SetPrefixNonStringResult.DatabaseOperationFailed,
                            did_succeed: false
                        }];
                case 14:
                    conditionally_release_pool_client();
                    return [2, {
                            result: local_prefix_entry,
                            did_succeed: true
                        }];
                case 15: return [2];
            }
        });
    });
};
//# sourceMappingURL=server_prefixes.js.map