import { get_prefix } from "./integrations/server_prefixes.js";
import { PoolInstance as Pool } from "./pg_wrapper.js";
import { AnyBotCommand, ParentCommand, process_message_for_commands as process_message_for_commands_with_stock } from "./functions.js";
import { STOCK_BOT_COMMANDS } from "./stock_commands.js";
import { BOT_USER_ID, GLOBAL_PREFIX, MAINTAINER_TAG, MODULES } from "./main.js";
import { Client, Interaction, Message } from "discord.js";
import { LogType, log } from "./utilities/log.js";
import { is_number, is_string, is_text_channel } from "./utilities/typeutils.js";
import { do_check_and_list } from "./slash_commands.js";
import { allowed, Snowflake } from "./utilities/permissions.js";

let registered_stock = false;
let guild_registrations: Record<string, boolean> = {};
let cached_module_commands: AnyBotCommand[] = [];
export let integration_cache: Record<Snowflake, symbol> = {};

export const execute_interation_response = async function (interaction: Interaction, client: Client, pool: Pool): Promise<void> {
    if (interaction.isApplicationCommand() && interaction.isCommand()) {
        let command_id = integration_cache[interaction.commandId];
        
        let command = [...STOCK_BOT_COMMANDS, ...cached_module_commands].find(el => el.id === command_id);
        if (!command) {
            await interaction.reply({
                content: `An internal error has occurred (you used an integration that has been removed). Contact @${MAINTAINER_TAG} for help.`
            })
        }
        else {
            let options = interaction.options.data;

            if (command instanceof ParentCommand) {
                if (options[0].type === "SUB_COMMAND") {
                    let subcommand = command.subcommands.find(x => x.manual.name === options[0].value as string);
                    if (!subcommand) {
                        await interaction.reply({
                            content: `An internal error has occurred (you used an integration that has been removed). Contact @${MAINTAINER_TAG} for help.`
                        })
                    }
                    if (allowed())
                }
            }
        }
    }
}

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
            let data = do_check_and_list(command);
            if (data === undefined) continue;
            if (!client.application) continue;
            let { id } = await client.application?.commands.create(data);
            integration_cache[id] = command.id;
        }
    }
    if (is_text_channel(message)) {
        if (cached_module_commands.length === 0) {
            cached_module_commands = (await MODULES).reduce((prev, curr) => {
                return prev.concat(curr.functions);
            }, [] as AnyBotCommand[]);
        }
        if (guild_registrations[message.guild.id] !== true) {
            for (const command of cached_module_commands) {
                let data = do_check_and_list(command);
                if (data === undefined) continue;
                let { id } = await message.guild.commands.create(data);
                integration_cache[id] = command.id;
            }
        }
    }
    // Only use this area for non-command responses
    // such as replying to DMs.
    if (message.author.id === BOT_USER_ID) return;
    const command_results = await process_message_for_commands_with_stock(STOCK_BOT_COMMANDS, message, client, pool);

    if (command_results.did_find_command === true) {
        if (command_results.command_authorized === false && command_results.no_use_no_see !== true) {
            if (is_string(command_results.not_authorized_reason)) {
                await message.channel.send(`You are not authorized to use that command. Reason: ${command_results.not_authorized_reason}`);
            } else {
                await message.channel.send(
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
