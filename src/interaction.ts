import { get_prefix } from "./integrations/server_prefixes.js";
import { PoolInstance as Pool, use_client } from "./pg_wrapper.js";
import { BotCommand, ParseMessageResult, process_message_for_commands as process_message_for_commands_with_stock } from "./functions.js";
import { STOCK_BOT_COMMANDS } from "./stock_commands.js";
import { BOT_USER_ID, GLOBAL_PREFIX, MAINTAINER_TAG, MODULES } from "./main.js";
import { Client, Interaction, Message } from "discord.js";
import { LogType, log } from "./utilities/log.js";
import { is_number, is_string, is_text_channel } from "./utilities/typeutils.js";
import { do_check_and_create_registration } from "./slash_commands.js";
import { Snowflake } from "./utilities/permissions.js";
import { handle_interaction } from "./handle_interaction.js";
import { Module } from "./module_loader.js";

let registered_stock = false;
let guild_registrations: Record<string, boolean> = {};
let cached_module_commands: { command: BotCommand; module: Module }[] = [];
export let integration_cache: Record<Snowflake, symbol> = {};

export const handle_ParseMessageResults = async (command_results: ParseMessageResult, reply: (message: string) => Promise<void>): Promise<void> => {
    if (command_results.did_find_command === true) {
        if (command_results.command_authorized === false && command_results.no_use_no_see !== true) {
            if (is_string(command_results.not_authorized_reason)) {
                await reply(`You are not authorized to use that command. Reason: ${command_results.not_authorized_reason}`);
            } else {
                await reply(
                    "You are not authorized to use that command. This could be because of command permissions. This command might not allow you to view who is authorized.",
                );
            }
        }
        if (command_results.command_worked === true && is_number(command_results.call_to_return_span_ms)) {
            log(
                `Bot command "${
                    command_results.command_name as string
                }" run successfully in ${command_results.call_to_return_span_ms.toString()} ms.`,
                LogType.Success,
            );
        }
    }
};

/**
 * Responds to an interaction, dispatching it to handle_interaction.ts if necessary
 * @param interaction
 * @param client
 * @param pool
 */
export const execute_interation_response = async function (interaction: Interaction, client: Client, pool: Pool): Promise<void> {
    if (interaction.isApplicationCommand() && interaction.isCommand()) {
        let command_id = integration_cache[interaction.commandId];

        let stock_command = STOCK_BOT_COMMANDS.find(el => el.id === command_id);
        if (stock_command !== undefined) {
            let pg_client = await use_client(pool, "execute_interaction_response");
            const prefix = await get_prefix(interaction.guild, pool);
            let command_results = await handle_interaction(stock_command, null, interaction, client, pg_client, prefix);
            await handle_ParseMessageResults(command_results, async (message: string) => {
                await interaction.reply({
                    content: message,
                });
            });
            pg_client.handle_release();
        }
        let module_command = cached_module_commands.find(el => el.command.id === command_id);
        if (!module_command) {
            await interaction.reply({
                content: `An internal error has occurred (you used an integration that has been removed). Contact @${MAINTAINER_TAG} for help.`,
            });
        } else {
            let pg_client = await use_client(pool, "execute_interaction_response");
            const prefix = await get_prefix(interaction.guild, pool);
            let command_results = await handle_interaction(module_command.command, module_command.module, interaction, client, pg_client, prefix);
            await handle_ParseMessageResults(command_results, async (message: string) => {
                await interaction.reply({
                    content: message,
                });
            });
            pg_client.handle_release();
        }
    }
};

/**
 * Reacts in the appropriate way to a message, whether it be a command or something which should be ignored.
 *
 * Passed into `process_message_for_commands` to check for commands, this just reacts to mentions
 * @param message Message that triggered the event
 * @param client Bot client object, which may be used in a response to a command
 * @param pool Connection pool object, used in database requests
 */
export const process_message = async function (message: Message, client: Client, pool: Pool): Promise<void> {
    // TODO: Permissions
    if (registered_stock === false) {
        for (const command of STOCK_BOT_COMMANDS) {
            let data = do_check_and_create_registration(command);
            if (data === undefined) continue;
            if (!client.application) continue;
            let { id } = await client.application?.commands.create(data);
            integration_cache[id] = command.id;
        }
        registered_stock = true;
    }
    if (is_text_channel(message)) {
        if (cached_module_commands.length === 0) {
            cached_module_commands = (await MODULES).reduce((prev, curr) => {
                return prev.concat(
                    curr.functions.map(func => {
                        return { command: func, module: curr };
                    }),
                );
            }, [] as { command: BotCommand; module: Module }[]);
        }
        if (guild_registrations[message.guild.id] !== true) {
            for (const command of cached_module_commands) {
                let data = do_check_and_create_registration(command.command);
                if (data === undefined) continue;
                let { id } = await message.guild.commands.create(data);
                integration_cache[id] = command.command.id;
            }
            guild_registrations[message.guild.id] = true;
        }
    }
    // Only use this area for non-command responses
    // such as replying to DMs.
    if (message.author.id === BOT_USER_ID) return;
    const command_results = await process_message_for_commands_with_stock(STOCK_BOT_COMMANDS, message, client, pool);

    await handle_ParseMessageResults(command_results, async (str: string) => {
        await message.channel.send(str);
    });

    // Process other information here like DMs, or mentions.
    // (Don't react to the mention if it's part of a command)
    if (message.mentions.users.has(BOT_USER_ID) && command_results.did_find_command === false) {
        const prefix = await get_prefix(message.guild, pool);
        if (prefix.trim() !== GLOBAL_PREFIX.trim()) {
            // If we have a specific prefix
            await message.channel.send(
                `Hi! I'm TigerDyno, a WIP bot developed by TigerGold59#8729. Use ${prefix}info (on this server, global prefix is ${GLOBAL_PREFIX}) for a more complete description.`,
            );
        } else {
            await message.channel.send(
                `Hi! I'm TigerDyno, a WIP bot developed by TigerGold59#8729. Use ${GLOBAL_PREFIX}info for a more complete description. You can also mention me on a server for my local prefix.`,
            );
        }
    }
};
