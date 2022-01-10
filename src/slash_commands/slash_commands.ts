import {
    ApplicationCommandOptionData,
    ApplicationCommandSubCommandData,
    ApplicationCommandSubGroupData,
    CacheType,
    ChatInputApplicationCommandData,
    CommandInteractionOption,
} from "discord.js";
import { ApplicationCommandOptionTypes, ChannelTypes } from "discord.js/typings/enums.js";
import {
    CommandArgument,
    CommandManual,
    CommandManualType,
    get_type,
    MultifacetedCommandManual,
    SimpleCommandManual,
    SubcommandManual,
} from "../command_manual.js";
import { BotCommand } from "../functions.js";
import { undefined_to_null } from "../utilities/typeutils.js";

export const fix_short_description = (str: string) => {
    return str.toLowerCase().split(" ").join("-");
};

export const create_option_from_argument = (
    argument: CommandArgument,
): Exclude<ApplicationCommandOptionData, ApplicationCommandSubCommandData | ApplicationCommandSubGroupData> => {
    if (
        argument.further_constraint !== undefined &&
        argument.further_constraint.choices !== undefined &&
        argument.further_constraint.choices.length > 0
    ) {
        return {
            name: fix_short_description(argument.short_description),
            description: argument.name,
            required: argument.optional !== true,
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
            name: fix_short_description(argument.short_description),
            description: argument.name,
            required: argument.optional !== true,
            channel_types: [ChannelTypes.GUILD_TEXT],
            type: argument.base_type,
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

export const load_slash_command_subcommand = (manual: SubcommandManual): ApplicationCommandSubCommandData => {
    return {
        name: manual.name,
        description: manual.description,
        options: manual.arguments.map(create_option_from_argument),
        type: "SUB_COMMAND",
    };
};

export const load_slash_command_multiple = (manual: MultifacetedCommandManual): ChatInputApplicationCommandData => {
    return {
        name: manual.name,
        description: manual.description,
        options: manual.subcommands.map(load_slash_command_subcommand) as ApplicationCommandSubCommandData[],
    };
};

export const do_check_and_create_registration = (command: BotCommand<CommandManual>): ChatInputApplicationCommandData | undefined => {
    if (command.no_use_no_see) return undefined;
    let type = get_type(command.manual);

    switch (type) {
        case CommandManualType.MultifacetedCommandManual: {
            let multiple_manual = command.manual as MultifacetedCommandManual & { supports_slash_commands: true };
            let data = load_slash_command_multiple(multiple_manual);
            return data;
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
