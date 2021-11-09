import { CacheType, Client, CommandInteraction, CommandInteractionOption } from "discord.js";
import { performance } from "perf_hooks";
import { SubcommandManual } from "./command_manual.js";
import {
    BotCommand,
    BotCommandProcessResultType,
    BotInteraction,
    BotInteractionCreationResultType,
    NoParametersCommand,
    ParentCommand,
    ParseMessageResult,
    Subcommand,
} from "./functions.js";
import { Module } from "./module_loader.js";
import { Queryable, UsesClient, use_client } from "./pg_wrapper.js";
import { fix_short_description, map_interaction_option_to_str } from "./slash_commands.js";
import { ArgumentValues } from "./utilities/argument_processing/arguments_types.js";
import { log, LogType } from "./utilities/log.js";
import { allowed } from "./utilities/permissions.js";
import { undefined_to_null } from "./utilities/typeutils.js";

export const run_subcommand = async (
    rest: readonly CommandInteractionOption<CacheType>[],
    full_interaction: BotInteraction,
    command: BotCommand,
    target: Subcommand<SubcommandManual> | undefined,
    name: string | undefined,
    module: Module | null,
    client: Client,
    queryable: Queryable<UsesClient>,
    prefix: string,
): Promise<ParseMessageResult> => {
    if (!target || !name) {
        await full_interaction.reply(`No matching subcommands were found. Use '!commands' to view all the subcommands and their syntaxes.`);
        return { did_find_command: true, did_use_module: module !== null, module_name: module !== null ? module.name : null };
    }
    const arg_values: ArgumentValues<SubcommandManual> = {};
    target.manual.arguments.forEach(arg => {
        let val = rest.find(x => x.name === fix_short_description(arg.short_description));
        if (val === undefined) arg_values[arg.id] = null;
        else arg_values[arg.id] = map_interaction_option_to_str(val);
    });

    let no_use_no_see = module?.hide_when_contradicts_permissions || command.no_use_no_see || target.no_use_no_see;
    let used_module = module !== null;

    if (
        allowed(full_interaction, module?.permissions) &&
        allowed(full_interaction, command.permissions) &&
        allowed(full_interaction, target.permissions)
    ) {
        let pg_client = await use_client(queryable, "handle_interaction");
        const start_time = performance.now();
        const result = await target.run_activate(arg_values, full_interaction, client, pg_client, prefix);
        const end_time = performance.now();
        pg_client.handle_release();

        return {
            did_find_command: true,
            no_use_no_see: no_use_no_see,
            command_worked: result.type === BotCommandProcessResultType.Succeeded,
            command_authorized: result.type !== BotCommandProcessResultType.Unauthorized,
            call_to_return_span_ms: end_time - start_time,
            command_name: name,
            did_use_module: used_module,
            module_name: used_module ? undefined_to_null(module?.name) : null,
            not_authorized_reason: result.not_authorized_message,
        };
    } else {
        return {
            did_find_command: true,
            did_use_module: module !== null,
            module_name: module !== null ? module.name : null,
            no_use_no_see: module?.hide_when_contradicts_permissions || command.no_use_no_see || target.no_use_no_see,
            command_name: name,
        };
    }
};

export const handle_interaction = async (
    command: BotCommand,
    module: Module | null,
    interaction: CommandInteraction,
    client: Client,
    queryable: Queryable<UsesClient>,
    prefix: string,
): Promise<ParseMessageResult> => {
    const full_interaction_result = BotInteraction.Create(interaction);

    switch (full_interaction_result.type) {
        case BotInteractionCreationResultType.Succeeded: {
            let full_interaction = full_interaction_result.interaction;
            if (command instanceof ParentCommand) {
                let subcommands = command.subcommands;
                let option_data = interaction.options.data;
                let first_option = option_data[0];
                switch (first_option.type) {
                    case "SUB_COMMAND": {
                        let target = subcommands.find(x => x.manual.name === interaction.options.getSubcommand());
                        let subcommand_data = option_data[0] as CommandInteractionOption;
                        let subcommand_options_data = subcommand_data.options;
                        if (!subcommand_options_data) {
                            subcommand_options_data = [];
                            /*log(option_data, LogType.Mismatch);
                            throw new Error(
                                `handle_interaction: command ${command.manual.name} was given options where subcommand had no options data`,
                            );*/
                        }
                        return await run_subcommand(
                            subcommand_options_data,
                            full_interaction,
                            command,
                            target,
                            `${command.manual.name} ${target?.manual.name}`,
                            module,
                            client,
                            queryable,
                            prefix,
                        );
                    }
                    default: {
                        log(option_data, LogType.Mismatch);
                        throw new Error(
                            `handle_interaction: command ${command.manual.name} was given options where subcommand wasn't the first option (err)`,
                        );
                    }
                }
            } else if (command instanceof Subcommand) {
                return await run_subcommand(
                    interaction.options.data,
                    full_interaction,
                    command,
                    command,
                    command.manual.name,
                    module,
                    client,
                    queryable,
                    prefix,
                );
            } else if (command instanceof NoParametersCommand) {
                if (allowed(full_interaction, module?.permissions) && allowed(full_interaction, command.permissions)) {
                    let pg_client = await use_client(queryable, "handle_interaction");
                    const start_time = performance.now();
                    const result = await command.run_activate(full_interaction, client, pg_client, prefix);
                    const end_time = performance.now();
                    pg_client.handle_release();
                    let used_module = module !== null;
                    let no_use_no_see = module?.hide_when_contradicts_permissions || command.no_use_no_see;
                    return {
                        did_find_command: true,
                        no_use_no_see: no_use_no_see,
                        command_worked: result.type === BotCommandProcessResultType.Succeeded,
                        command_authorized: result.type !== BotCommandProcessResultType.Unauthorized,
                        call_to_return_span_ms: end_time - start_time,
                        command_name: command.manual.name,
                        did_use_module: used_module,
                        module_name: used_module ? undefined_to_null(module?.name) : null,
                        not_authorized_reason: result.not_authorized_message,
                    };
                } else {
                    return {
                        did_find_command: true,
                        did_use_module: module !== null,
                        module_name: module !== null ? module.name : null,
                        no_use_no_see: module?.hide_when_contradicts_permissions || command.no_use_no_see,
                        command_name: command.manual.name,
                    };
                }
            } else {
                return { did_find_command: false, did_use_module: module !== null, module_name: module !== null ? module.name : null };
            }
        }
        default: {
            return { did_find_command: false, did_use_module: module !== null, module_name: module !== null ? module.name : null };
        }
    }
};