import { Message } from "discord.js";
import { BotCommand, BotCommandMetadataKey, STOCK_BOT_COMMANDS } from "./functions.js";
import { CreatePasteResult, create_paste } from "./integrations/paste_ee.js";
import { GLOBAL_PREFIX, MODULES } from "./main.js";
import { DebugLogType, log, LogType } from "./utilities/log.js";
import { allowed, Permissions } from "./utilities/permissions.js";
import { is_ParamValueType, ParamValueType } from "./utilities/runtime_typeguard.js";
import { escape_reg_exp, is_boolean, is_string, safe_serialize } from "./utilities/typeutils.js";

export const manual_of = function (command: BotCommand): CommandManual | undefined {
    return Reflect.getMetadata(BotCommandMetadataKey.Manual, command) as CommandManual | undefined;
};

export const permissions_of = function (command: BotCommand): Permissions | undefined {
    return Reflect.getMetadata(BotCommandMetadataKey.Permissions, command) as Permissions | undefined;
};

export const is_no_use_no_see = function (command: BotCommand): boolean {
    return Boolean(Reflect.getMetadata(BotCommandMetadataKey.NoUseNoSee, command));
};

/**
 * An interface which describes an argument a command or subcommand takes.
 */
export interface CommandArgument {
    // Concise description of the argument's purpose
    readonly name: string;
    // One-word argument name, for internal use
    readonly id: string;
    // Whether the argument can be left out
    readonly optional: boolean;
    // For auto-generating constraint
    readonly further_constraint?: ParamValueType;
}

const is_valid_CommandArgument = function (thing?: Partial<CommandArgument>): thing is CommandArgument {
    if (!thing) {
        return false;
    } else if (is_string(thing.name) === false || is_string(thing.id) === false) {
        return false;
    } else if (thing.optional !== true && thing.optional !== false) {
        return false;
    } else if (thing.further_constraint !== undefined && is_ParamValueType(thing.further_constraint) === false) {
        return false;
    } else {
        return true;
    }
};

/**
 * A specific entry for one syntax as part of a larger command, i.e. %tj list as part of %tj
 */
export interface SubcommandManual {
    // Name of subcommand, i.e. list in %tj list
    readonly name: string;
    // Syntax string
    // Example: <prefix>proof set | $1 | $2
    // Example with optional: <prefix>proof get{opt $2}[ |] $1{opt $2}[ | $2]
    // In the example with the optional, the pipelines are only required if argument $2 is present.
    readonly syntax: string;
    readonly arguments: readonly CommandArgument[];
    // Display all syntaxes, or compact it down into a readable optional thing
    // TODO: Implement
    readonly compact_syntaxes?: boolean;
    // A description of the subcommand to be added on in the manual.
    readonly description: string;
}

/**
 * A command which only has one syntax, i.e. %xofakind
 */
export type SimpleCommandManual = SubcommandManual;

const is_valid_SimpleCommandManual = function (thing: any): thing is SimpleCommandManual {
    if (!thing) {
        log(
            `is_valid_SimpleCommandManual returned false - thing was null, undefined, an empty string, or another falsy object`,
            LogType.Mismatch,
            DebugLogType.ManualValidationFailedReason,
        );
        return false;
    } else if (is_string(thing.name) === false) {
        log(
            `is_valid_SimpleCommandManual returned false - thing had no string property "name"`,
            LogType.Mismatch,
            DebugLogType.ManualValidationFailedReason,
        );
        return false;
    } else if (is_string(thing.syntax) === false) {
        log(
            `is_valid_SimpleCommandManual returned false - thing had no string property "syntax"`,
            LogType.Mismatch,
            DebugLogType.ManualValidationFailedReason,
        );
        return false;
    } else if (!thing.arguments || Array.isArray(thing.arguments) === false) {
        log(
            `is_valid_SimpleCommandManual returned false - thing had no array property "arguments"`,
            LogType.Mismatch,
            DebugLogType.ManualValidationFailedReason,
        );
        return false;
    } else if (is_string(thing.description) === false) {
        log(
            `is_valid_SimpleCommandManual returned false - thing had no string property "description"`,
            LogType.Mismatch,
            DebugLogType.ManualValidationFailedReason,
        );
        return false;
    } else if ("compact_syntaxes" in thing && is_boolean(thing.compact_syntaxes) === false && thing.compact_syntaxes !== undefined) {
        log(
            `is_valid_SimpleCommandManual returned false - thing had non-boolean and non-undefined property "compact_syntaxes"`,
            LogType.Mismatch,
            DebugLogType.ManualValidationFailedReason,
        );
    }

    for (const element of thing.arguments) {
        if (is_valid_CommandArgument(element) === false) {
            log(
                `is_valid_SimpleCommandManual returned false - thing had non-command-argument item "${safe_serialize(element)}" in thing.arguments`,
                LogType.Mismatch,
                DebugLogType.ManualValidationFailedReason,
            );
            return false;
        }
    }

    return true;
};

const is_valid_SubcommandManual = is_valid_SimpleCommandManual;

export interface MultifacetedCommandManual {
    // Name of command, i.e. tj in %tj list
    readonly name: string;
    readonly subcommands: readonly SubcommandManual[];
    // A description of the command to be added on in the manual.
    readonly description: string;
}

const is_valid_MultifacetedCommandManual = function (thing?: any): thing is MultifacetedCommandManual {
    if (!thing) {
        return false;
    } else if (is_string(thing.name) === false) {
        return false;
    } else if (!thing.subcommands || Array.isArray(thing.subcommands) === false) {
        return false;
    } else if (is_string(thing.description) === false) {
        return false;
    }

    for (const element of thing.subcommands) {
        if (is_valid_SubcommandManual(element) === false) {
            return false;
        }
    }

    return true;
};

export type CommandManual = SimpleCommandManual | MultifacetedCommandManual;

export const enum CommandManualType {
    SimpleCommandManual,
    MultifacetedCommandManual,
    Invalid,
}

export const get_type = function (command_manual?: unknown): CommandManualType {
    if (is_valid_SimpleCommandManual(command_manual)) {
        return CommandManualType.SimpleCommandManual;
    } else if (is_valid_MultifacetedCommandManual(command_manual)) {
        return CommandManualType.MultifacetedCommandManual;
    } else {
        return CommandManualType.Invalid;
    }
};

export const CommandManualValidation = {
    is_valid_CommandArgument: is_valid_CommandArgument,
    is_valid_SimpleCommandManual: is_valid_SimpleCommandManual,
    is_valid_SubcommandManual: is_valid_SubcommandManual,
    is_valid_MultifacetedCommandManual: is_valid_MultifacetedCommandManual,
    get_type: get_type,
};

/*
Manual Examples
Command: proof <get/set/remove/list/missing>
Manual:

proof <get/set/remove/list/missing>
    get:
        1. %proof get <jump_name>
        2. %proof get | <jump name> | <user ID>
        Description: Retrieves the link to the proof set by you or the user whose ID you included.

xofakind:
    1. %xofakind <number>
    Description: Simulates rolling the given number of dice until they all come up the same.
*/

export const argument_identifier = function (argument_number: number): string {
    return "$" + Math.floor(argument_number + 1).toString();
};

export const keying_off_regex = function (argument_number: number): RegExp {
    return new RegExp(`\\{opt\\s*${escape_reg_exp(argument_identifier(argument_number))}\\}\\s*\\[(.+?)\\]`, "gi");
};

export const key_off = function (syntax_string: string, argument_index: number, provided: boolean): string {
    const regex = keying_off_regex(argument_index);
    // log(`key_off created regex ${regex.source} for syntax string "${syntax_string}" and argument index ${argument_index.toString()} (provided: ${provided ? "true" : "false"}).`)
    if (provided === false) {
        return syntax_string.replace(regex, "");
    } else {
        const matches = syntax_string.matchAll(regex);

        log(`Found matches for keying_off_regex.`, LogType.Status, DebugLogType.KeyOffFunctionDebug);

        const matches_arr = [...matches];
        log(`matches_arr: ${JSON.stringify(matches_arr)}`, LogType.Status, DebugLogType.KeyOffFunctionDebug);

        // Replace each match with the content in the braces
        for (const match of matches_arr) {
            log(`Match: ${match[0]}, replacement: ${match[1]}`, LogType.Status, DebugLogType.KeyOffFunctionDebug);
            syntax_string = syntax_string.replace(match[0], match[1]);
        }

        return syntax_string;
    }
};

export const key_off_describe_optional = function (syntax_string: string, argument_index: number, provided: boolean): string {
    const regex = keying_off_regex(argument_index);
    // log(`key_off created regex ${regex.source} for syntax string "${syntax_string}" and argument index ${argument_index.toString()} (provided: ${provided ? "true" : "false"}).`)
    if (provided === false) {
        return syntax_string.replace(regex, "");
    } else {
        const matches = syntax_string.matchAll(regex);

        log(`Found matches for keying_off_regex.`, LogType.Status, DebugLogType.KeyOffFunctionDebug);

        const matches_arr = [...matches];
        log(`matches_arr: ${JSON.stringify(matches_arr)}`, LogType.Status, DebugLogType.KeyOffFunctionDebug);

        // Replace each match with the content in the braces surrounded by optional description
        for (const match of matches_arr) {
            log(`Match: ${match[0]}, replacement: (optional:${match[1]})`, LogType.Status, DebugLogType.KeyOffFunctionDebug);
            syntax_string = syntax_string.replace(match[0], `(optional:${match[1]})`);
        }

        return syntax_string;
    }
};

/**
 * Used for command manual text generation.
 * @param command The SimpleCommandManual which we will be creating a syntax list for
 * @param syntax_string A string which provides information about how to format the command and what parts depend on whether optional arguments are provided
 * @param prefix_substitution What to replace the <prefix> placeholder in the syntax string with
 * @returns A list of syntax strings consisting of every possible combination of providing or not providing each optional argument
 */
export const generate_syntaxes = function (command: SimpleCommandManual, syntax_string: string, prefix_substitution: string): string[] {
    const command_arguments = command.arguments;
    // List of optional arguments
    let optional_arguments = command_arguments.filter(argument => argument.optional);
    const argument_names = command_arguments.map(argument => argument.name);

    let argument_names_indices: { [key: string]: number } = {};
    let checked = 0;
    const efficient_index_of = (name: string): number => {
        if (name in argument_names_indices) return argument_names_indices[name];
        else {
            while (argument_names[checked] !== name) {
                argument_names_indices[argument_names[checked]] = checked;
                checked++;
            }
            return checked;
        }
    };
    const finish_syntax_string = (state_dependent_syntax: string): string => {
        // Replace the argument numbers with their descriptions
        for (let i = 0; i < command_arguments.length; i++) {
            state_dependent_syntax = state_dependent_syntax.replace(argument_identifier(i), `<${argument_names[i]}>`);
        }

        // Replace the prefix preholder
        state_dependent_syntax = state_dependent_syntax.replace("<prefix>", prefix_substitution);
        return state_dependent_syntax;
    };

    if (command.compact_syntaxes === true) {
        let res = syntax_string;
        for (let i = 0; i < optional_arguments.length; i++) {
            res = key_off_describe_optional(res, command_arguments.indexOf(optional_arguments[i]), true);
        }
        return [finish_syntax_string(res)];
    }
    // Array showing which optional arguments we are considering not provided, for making the syntax list
    const state = optional_arguments.map(() => false);

    // We are essentially binary counting. The syntax list goes from no optional argument not provided
    // to first optional argument and all others provided.

    // This function will perform the binary counting procedure, i.e. increment the value of state as an integer by one
    // Binary counting procedure: flip the last 0 to a 1, if you can, flipping all the 1s after it to 0s
    // 000 to 001 to 010 to 011 to 100 to 101 to 110 to 111
    const flip_last_zero = function () {
        for (let index = state.length - 1; index >= 0; index--) {
            if (state[index] === false) {
                state[index] = true;
                return;
            } else {
                state[index] = false;
                continue;
            }
        }
    };

    let syntaxes: string[] = [];

    // Further explanation: state includes booleans, or 1s and 0s, that represent whether...
    // a given optional argument is included. We are using the binary counting algorithm to efficiently and...
    // regularly go through all the possibilities for syntaxes based on whether you include the optional arguments or not.
    // The last syntax in the list will be when all optional arguments are provided, or when the state array includes...
    // no falses. This is why the criteria for continuing the for loop is that at least one false remains.
    // After every iteration of the loop, the binary number [state array] is incremented by one by the flip_last_zero function.
    for (; state.includes(false); flip_last_zero()) {
        let state_dependent_syntax = syntax_string;

        // Replace the parts that key off of whether the optional argument is provided, using the state
        for (let i = 0; i < optional_arguments.length; i++) {
            let argument_index = efficient_index_of(optional_arguments[i].name);
            state_dependent_syntax = key_off(state_dependent_syntax, argument_index, state[i]);
        }

        state_dependent_syntax = finish_syntax_string(state_dependent_syntax);

        syntaxes.push(state_dependent_syntax);
    }

    // Do one more iteration for when all are true or there are no optional arguments
    let state_dependent_syntax = syntax_string;
    for (let i = 0; i < optional_arguments.length; i++) {
        let argument_index = argument_names.indexOf(optional_arguments[i].name);
        state_dependent_syntax = key_off(state_dependent_syntax, argument_index, state[i]);
    }
    state_dependent_syntax = finish_syntax_string(state_dependent_syntax);

    syntaxes.push(state_dependent_syntax);

    return syntaxes;
};

export const INDENT = "    ";

export const make_simple_command_manual = function (manual: SimpleCommandManual, prefix_substitution: string): string {
    let syntaxes = generate_syntaxes(manual, manual.syntax, prefix_substitution);

    const syntax_accumulation = indent(
        syntaxes
            .map((syntax, index) => {
                return `${(index + 1).toString()}. ${syntax}`;
            })
            .join("\n"),
    );

    return manual.name + ":\n" + syntax_accumulation + "\n" + indent("Description: " + manual.description);
};

export const indent = function (str: string): string {
    return str
        .split("\n")
        .map(line => `${INDENT}${line}`)
        .join("\n");
};

export const create_manual_entry = function (command_manual: CommandManual, prefix_substitution = GLOBAL_PREFIX): string | false {
    const type = get_type(command_manual);

    if (type === CommandManualType.Invalid) {
        return false;
    } else if (type === CommandManualType.SimpleCommandManual) {
        return make_simple_command_manual(command_manual as SimpleCommandManual, prefix_substitution);
    } else if (type === CommandManualType.MultifacetedCommandManual) {
        let manual = command_manual as MultifacetedCommandManual;
        const subcommand_list = `${manual.name} <${manual.subcommands.map(subcommand => subcommand.name).join("/")}>\n`;
        let accumulator = subcommand_list;
        accumulator += indent(`Description: ${manual.description}`) + "\n\n";
        accumulator += indent(manual.subcommands.map(subcommand => make_simple_command_manual(subcommand, prefix_substitution)).join("\n"));

        return accumulator;
    } else {
        return false;
    }
};

export const make_manual = async function (message: Message, prefix_substitution: string): Promise<CreatePasteResult> {
    log(`make_manual function called. Process starting...`, LogType.Status, DebugLogType.MakeManualFunctionDebug);

    let manual_section_accumulator: string[] = [];

    let stock_manual_accumulator: string[] = [];

    for (const bot_command of STOCK_BOT_COMMANDS) {
        const manual = manual_of(bot_command);
        if (manual === undefined) {
            log(`make_manual skipped stock bot function: instance had no manual saved as metadata. Continuing...`, LogType.Error);
            continue;
        }
        const manual_entry = create_manual_entry(manual, prefix_substitution);

        if (is_string(manual_entry)) {
            stock_manual_accumulator.push(manual_entry);
        } else {
            log(`make_manual skipped stock bot function "${manual.name}": create_manual_entry returned false (unknown error).`, LogType.Error);
        }
    }

    if (stock_manual_accumulator.length > 0) {
        manual_section_accumulator.push(stock_manual_accumulator.join("\n\n"));
    } else {
        log(
            `make_manual skipped listing stock commands: An empty section would have been the only thing present.`,
            LogType.Status,
            DebugLogType.MakeManualFunctionDebug,
        );
    }

    for (const module of await MODULES) {
        if (allowed(message, module.permissions) === false && module.hide_when_contradicts_permissions) {
            log(`make_manual hid module ${module.name}: flag module.hide_when_contradicts_permissions set.`);
            continue;
        } else {
            let module_manual_accumulator: string[] = [`Module ${module.name}`];
            if (module.servers_are_universes) {
                module_manual_accumulator[0] += "\n(Module commands don't carry data between servers)";
            }
            for (const bot_command of module.functions) {
                const manual = manual_of(bot_command);
                if (manual === undefined) {
                    log(
                        `make_manual displaying BotCommand from module "${module.name}": instance had no manual saved as metadata. Continuing...`,
                        LogType.Error,
                    );
                    continue;
                }
                if (allowed(message, permissions_of(bot_command)) === false && is_no_use_no_see(bot_command)) {
                    log(`make_manual hid function ${manual.name}: flag bot_command.hide_when_contradicts_permissions set.`);
                    continue;
                } else {
                    const manual_entry = create_manual_entry(manual, prefix_substitution);

                    if (is_string(manual_entry)) {
                        module_manual_accumulator.push(manual_entry);
                    } else {
                        log(
                            `make_manual skipped bot function "${manual.name}" from module "${module.name}": create_manual_entry returned false (unknown error).`,
                            LogType.Error,
                        );
                    }
                }
            }

            if (module_manual_accumulator.length > 0) {
                manual_section_accumulator.push(module_manual_accumulator.join("\n\n"));
            } else {
                log(`make_manual skipped listing commands for module "${module.name}": An empty section would have been the only thing present.`);
            }
        }
    }

    const full_manual = manual_section_accumulator.join("\n\n\n");

    return await create_paste(
        `TypeDyno Command Manual\n=======================\nLocal Prefix - ${prefix_substitution}\nNote: The prefix shown in this manual is only for this server.\nThe global prefix is ${GLOBAL_PREFIX}, but this may be overridden by individual servers.\n\n\n` +
            full_manual,
    );
};
