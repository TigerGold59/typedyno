import * as Discord from "discord.js";

import { load_modules, Module } from "./module_loader.js";

import { CONFIG } from "./config.js";
import { process_message } from "./message.js";

export const DISCORD_API_TOKEN = process.env.DISCORD_API_TOKEN as string;
export const GLOBAL_PREFIX = process.env.GLOBAL_PREFIX as string;
export const BOT_USER_ID = "864326626111913995";
export const STOCK_TABLES = ["prefixes", "users"];
export const MAINTAINER_TAG = "TigerGold59#8729";
export const USER_ID_FAQ = `A valid user ID is is composed of a number of digits, like this: ${BOT_USER_ID}. You can obtain someone's user ID by turning on Developer Tools in your Discord settings and right clicking, then clicking 'Copy ID' at the bottom.`;
export type EventListenerModule = (client: Discord.Client, connection_pool: PoolInstance) => (...args: unknown[]) => void;

import { log, LogType } from "./utilities/log.js";
import { Pool, PoolInstance } from "./pg_wrapper.js";

// EXPLANATION
// I have no fucking clue why, but top level 'await'ing load_modules() causes
// it to immediately die when loading modules. Possibly a node bug?
// Now we just have to await MODULES every time we use it in other scripts because it's technically a promise
// I can't even top level 'await' the execution of this async function... it still does the same thing
// Probably a bug, albeit a very complex one.
export const MODULES = (async (): Promise<Module[]> => {
    await new Promise((res, _rej) => setInterval(res, 1000));
    log("Loading modules...", LogType.Status);
    const res = await load_modules();
    log("Module loading complete.", LogType.Success);

    const client = new Discord.Client({
        intents: [Discord.Intents.FLAGS.GUILD_MESSAGES, Discord.Intents.FLAGS.GUILD_MESSAGE_REACTIONS],
    });
    log("Client created. Bot starting up...", LogType.Status);

    const connection_pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false,
        },
    });

    client.once("ready", () => {
        if (client.user === null) {
            return;
        }

        log(`Bot ready; logged in as ${client.user.tag}.`, LogType.Success);

        // Set status
        if (!CONFIG.presence_data) {
            void client.user.setPresence({
                activities: [
                    {
                        name: "@ for server prefix",
                    },
                ],
            });
        } else {
            void client.user.setPresence(CONFIG.presence_data);
        }
    });

    // Send messages through messages.ts
    client.on("message", message => {
        void process_message(message, client, connection_pool);
    });

    client.on("interaction", interaction => {
        if (interaction.isApplicationCommand() && interaction.isCommand() && interaction.options) {
            if (interaction.)
        }
    })

    // Use event listener files
    for (const listener_name of CONFIG.event_listeners) {
        // Import each through a require (the reason it's not .ts is because the listeners will get compiled to .js)
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const listener = (require(`../events/${listener_name}.js`) as (client: Discord.Client, pool: PoolInstance) => EventListenerModule)(
            client,
            connection_pool,
        );
        // Apply the listener (listener name is actually the event name)
        client.on(listener_name, listener(client, connection_pool));
    }

    // Actually log the bot in
    void client.login(DISCORD_API_TOKEN);

    // Listen for errors that require ending the process, instead of sitting idly
    const error_listener_function_connection = () => {
        log("Process terminating due to a connection error.", LogType.Error);
        process.exit(0);
    };
    const error_listener_function_promise_rejection = (error: Error) => {
        log("Process terminating due to an unhandled promise rejection.", LogType.PromiseRejection);
        console.error(error);
        process.exit(0);
    };

    client.on("disconnect", error_listener_function_connection);
    process.on("disconnect", error_listener_function_connection);
    process.on("unhandledRejection", error_listener_function_promise_rejection);
    return res;
})();
