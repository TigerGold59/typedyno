"use strict";
exports.__esModule = true;
exports.BOT_USER_ID = exports.GLOBAL_PREFIX = exports.DISCORD_API_TOKEN = exports.CONFIG = void 0;
var log_1 = require("./utilities/log");
var Discord = require("discord.js");
var message_1 = require("./message");
var pg_1 = require("pg");
exports.CONFIG = require("./config.json");
exports.DISCORD_API_TOKEN = process.env.DISCORD_API_TOKEN;
exports.GLOBAL_PREFIX = process.env.GLOBAL_PREFIX;
exports.BOT_USER_ID = "626223136047628308";
var client = new Discord.Client();
log_1.log("Client created. Bot starting up...", log_1.LogType.Status);
var connection_pool = new pg_1.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});
client.once("ready", function () {
    log_1.log("Bot ready; logged in as " + client.user.tag + ".", log_1.LogType.Success);
    if (!exports.CONFIG.presence_data) {
        client.user.setPresence({
            activity: {
                name: "@ for server prefix"
            }
        });
    }
    else {
        client.user.setPresence(exports.CONFIG.presence_data);
    }
});
client.on("message", function (message) {
    message_1.process_message(message, client, connection_pool);
});
for (var _i = 0, _a = exports.CONFIG.event_listeners; _i < _a.length; _i++) {
    var listener_name = _a[_i];
    var listener = require("./events/" + listener_name + ".js")(client, connection_pool);
    client.on(listener_name, listener);
}
client.login(exports.DISCORD_API_TOKEN);
var error_listener_function_connection = function () {
    log_1.log("Process terminating due to a connection error.", log_1.LogType.Error);
    process.exit(0);
};
var error_listener_function_promise_rejection = function (error) {
    log_1.log("Process terminating due to an unhandled promise rejection.", log_1.LogType.PromiseRejection);
    console.error(error);
    process.exit(0);
};
client.on("disconnect", error_listener_function_connection);
process.on("disconnect", error_listener_function_connection);
process.on("unhandledRejection", error_listener_function_promise_rejection);
//# sourceMappingURL=main.js.map