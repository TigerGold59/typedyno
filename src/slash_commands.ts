import {
    ApplicationCommandOptionData,
    ApplicationCommandSubCommandData,
    ApplicationCommandSubGroupData,
    CacheType,
    ChatInputApplicationCommandData,
    CommandInteraction,
    CommandInteractionOption,
    Interaction,
} from "discord.js";
import { ApplicationCommandOptionTypes, ChannelTypes } from "discord.js/typings/enums";
import {
    CommandArgument,
    CommandManual,
    CommandManualType,
    get_type,
    MultifacetedCommandManual,
    SimpleCommandManual,
    SubcommandManual,
} from "./command_manual";
import { BotCommand } from "./functions";
import { log, LogType } from "./utilities/log";
import { filter_map, null_to_undefined, undefined_to_null } from "./utilities/typeutils";

export const create_option_from_argument = (
    argument: CommandArgument<true>,
): Exclude<ApplicationCommandOptionData, ApplicationCommandSubCommandData | ApplicationCommandSubGroupData> => {
    if (
        argument.further_constraint !== undefined &&
        argument.further_constraint.choices !== undefined &&
        argument.further_constraint.choices.length > 0
    ) {
        return {
            name: argument.id,
            description: argument.slash_command_description,
            required: argument.optional,
            type: ApplicationCommandOptionTypes.STRING,
            choices: argument.further_constraint.choices.map(val => {
                return {
                    name: val,
                    value: val,
                };
            }),
        };
    } else {
        return {
            name: argument.id,
            description: argument.slash_command_description,
            required: argument.optional,
            channel_types: [ChannelTypes.GUILD_TEXT],
            type: argument.slash_command_type === undefined ? ApplicationCommandOptionTypes.STRING : argument.slash_command_type,
        };
    }
};

export const load_slash_command_single = (manual: SimpleCommandManual & { supports_slash_commands: true }): ChatInputApplicationCommandData => {
    return {
        name: manual.name,
        description: manual.description,
        options: manual.arguments.map(create_option_from_argument),
        type: "CHAT_INPUT",
    };
};

export const load_slash_command_subcommand = (
    manual: SubcommandManual & { readonly supports_slash_commands: true },
): ApplicationCommandSubCommandData => {
    return {
        name: manual.name,
        description: manual.description,
        options: manual.arguments.map(create_option_from_argument),
        type: "SUB_COMMAND",
    };
};

export const load_slash_command_multiple = (
    manual: MultifacetedCommandManual & { supports_slash_commands: true },
): ChatInputApplicationCommandData => {
    return {
        name: manual.name,
        description: manual.description,
        options: filter_map(
            manual.subcommands,
            <ThrowawaySymbol extends symbol>(element: SubcommandManual, _index: number, throwaway: ThrowawaySymbol) => {
                if (element.supports_slash_commands === false) {
                    return throwaway;
                } else {
                    return load_slash_command_subcommand(element);
                }
            },
        ),
    };
};

export const do_check_and_list = (command: BotCommand<CommandManual>): ChatInputApplicationCommandData | undefined => {
    if (command.manual.supports_slash_commands === false) {
        return undefined;
    } else {
        let type = get_type(command.manual);

        switch (type) {
            case CommandManualType.MultifacetedCommandManual: {
                let multiple_manual = command.manual as MultifacetedCommandManual & { supports_slash_commands: true };
                let dont_support = [];
                for (const sub_manual of multiple_manual.subcommands) {
                    if (sub_manual.supports_slash_commands !== true) dont_support.push(sub_manual.name);
                }
                if (dont_support.length > 0) {
                    log(
                        `do_check_and_register: command ${
                            multiple_manual.name
                        } says it supports subcommands, but of its subcommands the following don't: ${dont_support.join(
                            ", ",
                        )}. This command will be omitted from registration.`,
                        LogType.Mismatch,
                    );
                    return;
                }
                let data = load_slash_command_multiple(multiple_manual);
                return data;
            }
        }
    }
};

export const map_interaction_option_to_str = (interaction_option: CommandInteractionOption<CacheType>): string | null => {
    switch (interaction_option.type) {
        case "USER": {
            return interaction_option.user ? interaction_option.user.id : null;
        }
        case "CHANNEL": {
            return interaction_option.channel ? interaction_option.channel.id : null;
        }
        default: {
            return undefined_to_null(interaction_option.value?.toString());
        }
    }
};
