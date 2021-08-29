import { Message } from "discord.js";
import { CommandArgument, SimpleCommandManual, SubcommandManual } from "../../command_manual.js";
import { MAINTAINER_TAG } from "../../main.js";
import { log, LogType } from "../log.js";
import { escape_reg_exp, is_string } from "../typeutils.js";
import {
    ContainedArgumentsList,
    ContainedSubcommandNames,
    GetArgsResult as ArgumentValues,
    InvalidSyntaxStringReason,
    is_alphabetic,
    is_digit,
    is_whitespace,
    SyntaxStringParserState,
    SyntaxStringSegmentContent,
    SyntaxStringSegmentType,
} from "./arguments_types.js";

/**
 * Transforms `str`, parsed as part of a syntax string, into an array of its parts that is transformable into a `RegExp` by `syntax_string_to_argument_regex`.
 * This function can have two main uses. One is to parse the whole syntax string, starting from the 0th index, and the other is to parse
 * the contents of the square brackets in a key-off.
 * @param args The `CommandArgument`s for the command we're generating from
 * @param str The segment of a syntax string to process
 * @param state The `SyntaxStringParserState` to begin in. If this call is intended to parse the whole syntax string, it should be `SyntaxStringParserState.None`. Otherwise, it should start at `SyntaxStringParserState.StaticTopLevel`.
 * @param key_off_stack A list of optional arguments that are currently "in scope," meaning available for processing because we're inside the square brackets of one of their key-offs.
 * @param top_level_call `true` if this is intended to parse the whole syntax string, otherwise `false`.
 * @param argument_references A reference to an array that holds information about whether an argument has already been referred to by its identifier (there cannot be two references to an argument, because if there could which value would it take when the command was run?)
 * @returns A tuple where `return[0]` is the syntax string, parsed into an array of segments, and `return[1]` is the index at which the last character read was located.
 */
export const parse_loop_with_initial_state = function (
    args: readonly CommandArgument[],
    str: string,
    state: SyntaxStringParserState,
    key_off_stack: number[],
    top_level_call: boolean,
    argument_references: boolean[],
): [SyntaxStringSegmentContent[] | InvalidSyntaxStringReason, number] {
    let res: SyntaxStringSegmentContent[] = [];

    let current_segment = "";
    let auxiliary_segment = "";
    let argument_identifier_segment = "";
    let possible_argument_identifier_full_segment = "";
    let just_referred_to_argument = false;
    let current_argument_identifier: number | null = null;

    let top_level_validated = false;

    const to_parse = top_level_call ? str.trim() : str;
    // example syntax string: <prefix>jumprole update NAME $1{opt $2}[ KINGDOM $2]{opt $3}[ LOCATION $3]{opt $4}[ JUMP TYPE $4]{opt $5}[ LINK $5]{opt $6}[ INFO $6]
    // ingest string character by character
    for (let index = 0; index < to_parse.length; index++) {
        const char = to_parse[index];
        switch (state) {
            case SyntaxStringParserState.None: {
                if (char !== "<") return [InvalidSyntaxStringReason.DoesNotStartWithPrefixTag, index];
                state = SyntaxStringParserState.PrefixTag;
                current_segment = "";
                break;
            }
            case SyntaxStringParserState.PrefixTag: {
                if (char !== ">") current_segment += char.toLowerCase();
                else if (current_segment === "prefix") {
                    state = SyntaxStringParserState.StaticTopLevel;
                    current_segment = "";
                    res.push({
                        content: [],
                        type: SyntaxStringSegmentType.PrefixTag,
                        argument_number: null,
                    });

                    // ignore coming whitespace
                    while (is_whitespace(to_parse[index + 1])) index++;
                } else return [InvalidSyntaxStringReason.InvalidPrefixTagContent, index];
                break;
            }
            case SyntaxStringParserState.StaticTopLevel: {
                if (top_level_validated === false && top_level_call) {
                    if (is_alphabetic(char) === false && is_whitespace(char) === false)
                        return [InvalidSyntaxStringReason.CommandNameDoesNotImmediatelyFollowPrefixTag, index];
                    else if (is_alphabetic(char)) {
                        current_segment += char;
                        top_level_validated = true;
                    } else if (char === " ") {
                        current_segment += char;
                    } else void 0;
                } else {
                    if (char === "$") {
                        state = SyntaxStringParserState.ArgumentIdentifier;
                        break;
                    } else if (char === "{") {
                        state = SyntaxStringParserState.KeyOffInCurlyBraces;
                        just_referred_to_argument = false;
                    } else if (char === "]" && top_level_call === false) {
                        res.push(current_segment);
                        return [res, index];
                    } else {
                        current_segment += char;
                        just_referred_to_argument = false;
                    }
                }
                break;
            }
            case SyntaxStringParserState.KeyOffInCurlyBraces: {
                // { o p T $7 }[...]
                //  ^           ^
                //  | we start  | we hand off to SyntaxStringParserState.KeyOffInSquareBrackets
                //  | here      | here
                if (is_whitespace(char)) continue;
                else if (char === "}") {
                    while (is_whitespace(to_parse[index + 1])) index++; // ignore whitespace
                    if (to_parse[index + 1] !== "[")
                        return [InvalidSyntaxStringReason.InvalidContentInBetweenKeyOffCurlyBracesAndSquareBrackets, index];
                    else if (current_argument_identifier !== null) {
                        state = SyntaxStringParserState.ContentInKeyOffInSquareBrackets;
                        auxiliary_segment = "";
                        index++;
                    }
                } else if (is_alphabetic(char)) auxiliary_segment += char.toLowerCase();
                else if (char === "$" && auxiliary_segment === "opt") {
                    argument_identifier_segment = "";
                    state = SyntaxStringParserState.ArgumentIdentifierInKeyOffInCurlyBraces;
                } else return [InvalidSyntaxStringReason.InvalidContentInKeyOffCurlyBraces, index];
                break;
            }
            case SyntaxStringParserState.ArgumentIdentifierInKeyOffInCurlyBraces: {
                // { o p T $7616361 }[...]
                //          ^      ^
                // we start |      | we hand off to SyntaxStringParserState.KeyOffInCurlyBraces
                // here  -> |      | <-   here
                if (is_digit(char)) argument_identifier_segment += char;
                else if (is_whitespace(char) && argument_identifier_segment.length === 0) continue;
                // ignore whitespace in between dollar sign and digits
                else {
                    if (argument_identifier_segment.length > 0) {
                        // we have at least one valid digit in here
                        state = SyntaxStringParserState.KeyOffInCurlyBraces;
                        const argument_number = Number(argument_identifier_segment);
                        if (Number.isInteger(argument_number) === false || argument_number < 1)
                            return [InvalidSyntaxStringReason.InvalidContentInBetweenKeyOffCurlyBracesAndSquareBrackets, index];
                        if (argument_number - 1 >= argument_references.length)
                            return [InvalidSyntaxStringReason.NonexistentArgumentReferenced, index];
                        if (args[argument_number - 1].optional === false)
                            return [InvalidSyntaxStringReason.KeyOffArgumentIdentifierRefersToNonOptionalArgument, index];
                        current_argument_identifier = Number(argument_identifier_segment);
                        index -= 1; // so that SyntaxStringParserState.KeyOffInCurlyBraces case reads this character, in order to judge if it's a valid end character
                        argument_identifier_segment = "";
                    } else return [InvalidSyntaxStringReason.InvalidContentInKeyOffCurlyBraces, index]; // we have nothing valid in here and the string has ended
                }
                break;
            }
            case SyntaxStringParserState.ArgumentIdentifier: {
                possible_argument_identifier_full_segment += char;
                if (is_digit(char)) argument_identifier_segment += char;
                else if (is_whitespace(char) && argument_identifier_segment.length === 0) continue;
                // ignore whitespace in between dollar sign and digits
                else {
                    if (argument_identifier_segment.length > 0) {
                        // we have at least one valid digit in here
                        if (just_referred_to_argument) {
                            return [InvalidSyntaxStringReason.MultipleArgumentsReferredToByIdentifierWithoutSeparatingCharacters, index];
                        }
                        const argument_number = Number(argument_identifier_segment);
                        if (Number.isInteger(argument_number) === false || argument_number < 1)
                            return [InvalidSyntaxStringReason.IllegalArgumentIdentifier, index];
                        if (argument_number - 1 >= argument_references.length)
                            return [InvalidSyntaxStringReason.NonexistentArgumentReferenced, index];
                        if (argument_references[argument_number - 1] !== false)
                            return [InvalidSyntaxStringReason.ArgumentReferencedMoreThanOnce, index];
                        // if we're referencing an optional arg outside its keyoff scope
                        if (key_off_stack.includes(argument_number) === false && args[argument_number - 1].optional) {
                            return [InvalidSyntaxStringReason.OptionalArgumentReferredToByIdentifierOutsideItsKeyOff, index];
                        }
                        res.push(current_segment);
                        argument_references[argument_number - 1] = true;
                        current_segment = "";
                        res.push({
                            content: null,
                            type: SyntaxStringSegmentType.ArgumentIdentifier,
                            argument_number: argument_number,
                        });
                        argument_identifier_segment = "";
                        possible_argument_identifier_full_segment = "";
                        state = SyntaxStringParserState.StaticTopLevel;
                        index--; // give the top level thing a chance to look at our ending character
                        just_referred_to_argument = true;
                    } else {
                        argument_identifier_segment = "";
                        current_segment += `$${possible_argument_identifier_full_segment}`;
                        possible_argument_identifier_full_segment = "";
                        state = SyntaxStringParserState.StaticTopLevel;
                    } // we have nothing valid in here and the string has ended
                }
                break;
            }
            case SyntaxStringParserState.ContentInKeyOffInSquareBrackets: {
                key_off_stack.push(current_argument_identifier as number);
                const sub_res = parse_loop_with_initial_state(
                    args,
                    to_parse.substring(index),
                    SyntaxStringParserState.StaticTopLevel,
                    key_off_stack,
                    false,
                    argument_references,
                );
                const return_val = sub_res[0];
                const sub_index = sub_res[1];
                if (typeof return_val === "number") return [return_val, index + sub_index];
                else {
                    res.push(current_segment);
                    current_segment = "";
                    res.push({
                        content: return_val,
                        type: SyntaxStringSegmentType.KeyOffStatement,
                        argument_number: current_argument_identifier,
                    });
                    index += sub_index;
                    current_argument_identifier = null;
                    key_off_stack.pop();
                    state = SyntaxStringParserState.StaticTopLevel;
                }
                break;
            }
        }
    }

    res.push(current_segment);

    if (argument_identifier_segment.length > 0) {
        // we have at least one valid digit in the argument identifier section
        const last = str.length - 1;
        if (just_referred_to_argument) {
            return [InvalidSyntaxStringReason.MultipleArgumentsReferredToByIdentifierWithoutSeparatingCharacters, last];
        }
        const argument_number = Number(argument_identifier_segment);
        if (Number.isInteger(argument_number) === false || argument_number < 1) return [InvalidSyntaxStringReason.IllegalArgumentIdentifier, last];
        if (argument_number - 1 >= argument_references.length) return [InvalidSyntaxStringReason.NonexistentArgumentReferenced, last];
        if (argument_references[argument_number - 1] !== false) return [InvalidSyntaxStringReason.ArgumentReferencedMoreThanOnce, last];
        // if we're referencing an optional arg outside its keyoff scope
        if (key_off_stack.includes(argument_number) === false && args[argument_number - 1].optional) {
            return [InvalidSyntaxStringReason.OptionalArgumentReferredToByIdentifierOutsideItsKeyOff, last];
        }
        res.push({
            content: null,
            type: SyntaxStringSegmentType.ArgumentIdentifier,
            argument_number: argument_number,
        });
    }

    return [res, to_parse.length - 1];
};

// TODO: make a prefix-agnostic syntax string to argument regex compiler so that we can use the same compiled syntax string, even for different prefixes

let syntax_string_compile_cache: {
    [key: string]: {
        [key: string]: [RegExp, { [key: number]: number }];
    };
} = {};

/**
 * Transforms syntax strings into a `RegExp` that can be used for processing commands
 * @param prefix The prefix that must be used at the start of the command
 * @param args The `CommandArgument`s for the command we're generating from
 * @param syntax_string The syntax string to process
 * @returns A tuple where `return[0]` is the `RegExp` and `return[1]` is the number of key-off groups for each argument, by number
 */
export const syntax_string_to_argument_regex = function (
    prefix: string,
    args: readonly CommandArgument[],
    syntax_string: string,
): [RegExp, { [key: number]: number }] | [InvalidSyntaxStringReason, number] {
    if (prefix in syntax_string_compile_cache && syntax_string in syntax_string_compile_cache[prefix]) {
        return syntax_string_compile_cache[prefix][syntax_string];
    }
    let key_off_stack: number[] = [];
    let argument_references: boolean[] = args.length > 0 ? [false] : [];
    for (let i = 1; i < args.length; i++) argument_references.push(false);

    const result = parse_loop_with_initial_state(args, syntax_string, SyntaxStringParserState.None, key_off_stack, true, argument_references);
    const parsing_result = result[0];
    if (typeof parsing_result === "number") return [parsing_result, result[1]];

    const argument_keyoff_accumulator: { [key: number]: number } = {};
    const construct_regex_part = (part: SyntaxStringSegmentContent): string => {
        let res = "";
        if (typeof part === "string") res += escape_reg_exp(part);
        else {
            switch (part.type) {
                case SyntaxStringSegmentType.PrefixTag: {
                    res += escape_reg_exp(prefix);
                    break;
                }
                case SyntaxStringSegmentType.KeyOffStatement: {
                    if ((part.argument_number as number) in argument_keyoff_accumulator)
                        argument_keyoff_accumulator[part.argument_number as number]++;
                    else argument_keyoff_accumulator[part.argument_number as number] = 1;

                    const key_off_number = argument_keyoff_accumulator[part.argument_number as number];
                    let inside_braces = "";
                    for (const element of part.content as SyntaxStringSegmentContent[]) {
                        inside_braces += construct_regex_part(element);
                    }
                    res += `(?<keyoff_${(part.argument_number as number).toString()}_${key_off_number.toString()}>${inside_braces})?`;
                    break;
                }
                case SyntaxStringSegmentType.ArgumentIdentifier: {
                    res += `(?<arg_${(part.argument_number as number).toString()}>.+?)`;
                    break;
                }
            }
        }

        return res;
    };

    let res = "^";
    for (const part of parsing_result) {
        res += construct_regex_part(part);
    }
    res += "$";

    const return_value: [RegExp, { [key: number]: number }] = [new RegExp(res, "mi"), argument_keyoff_accumulator];

    if (prefix in syntax_string_compile_cache) syntax_string_compile_cache[prefix][syntax_string] = return_value;
    else syntax_string_compile_cache[prefix] = { syntax_string: return_value };
    return return_value;
};

/**
 *
 * @param prefix The prefix currently in place (because of the server)
 * @param command The `SimpleCommandManual` or `SubcommandManual` which represents the use of this command.
 * @param invocation The content of the message which might invoke this command
 * @returns `GetArgsResult` indicating whether the invocation processing succeeded, and if so what the values of its arguments were.
 *
 * Otherwise, `return["inconsistent_key_offs"]` contains a list of optional arguments which were partially provided, i.e. some of their
 * key-off groups were matched and others weren't.
 */
export const get_args = function (prefix: string, command: SimpleCommandManual, invocation: string): ArgumentValues<typeof command.arguments> {
    const result = syntax_string_to_argument_regex(prefix, command.arguments, command.syntax);

    const failed = (compiled: boolean, syntax_string_error: [InvalidSyntaxStringReason, number] | null): ArgumentValues<typeof command.arguments> => {
        return {
            succeeded: false,
            compiled: compiled,
            inconsistent_key_offs: [],
            values: null,
            syntax_string_compilation_error: syntax_string_error,
        };
    };

    // Processing syntax string failed
    if (typeof result[0] === "number") {
        log(
            `get_args: command ${
                command.name
            } had a malformed syntax string (syntax string processing failed with error #${result[0].toString()} at index ${result[1].toString()}). Returning {succeeded: false}...`,
            LogType.Error,
        );
        return failed(false, result as [InvalidSyntaxStringReason, number]);
    }

    const argument_key_off_list = result[1] as { [key: number]: number };

    const match = invocation.match(result[0]);

    if (match === null) return failed(false, null);
    let groups = match.groups;

    let optional_arguments = [];
    let required_arguments = [];
    let required_arg_numbers: number[] = [];
    command.arguments.forEach((arg, index) => {
        if (arg.optional) optional_arguments.push(arg);
        else {
            required_arguments.push(arg);
            required_arg_numbers.push(index + 1);
        }
    });

    if (groups === undefined && required_arguments.length > 0) {
        log(
            `get_args: command ${command.name} had required arguments and an invocation matched its generated regex, but the match object had no groups! Returning {succeeded: false}...`,
            LogType.Mismatch,
        );
        return failed(true, null);
    } else if (groups === undefined)
        return {
            succeeded: true,
            compiled: true,
            inconsistent_key_offs: [],
            values: {},
            syntax_string_compilation_error: null,
        };

    let inconsistent_key_offs: [string, number, boolean][] = [];

    for (const argument_number in argument_key_off_list) {
        const keyed_off_count = argument_key_off_list[argument_number];
        let all_present = false;
        for (let i = 1; i <= keyed_off_count; i++) {
            const group_name = `keyoff_${argument_number}_${i.toString()}`;
            if (is_string(groups[group_name])) {
                if (i === 1) all_present = true;
                else if (all_present === false) inconsistent_key_offs.push([command.arguments[Number(argument_number) - 1].name, i, false]);
            } else if (all_present === true) inconsistent_key_offs.push([command.arguments[Number(argument_number) - 1].name, i, true]);
        }
    }

    if (inconsistent_key_offs.length > 0) {
        return {
            succeeded: false,
            compiled: true,
            values: null,
            inconsistent_key_offs: inconsistent_key_offs,
            syntax_string_compilation_error: null,
        };
    }

    for (let i = 0; i < required_arguments.length; i++) {
        if (is_string(groups[`arg_${required_arg_numbers[i].toString()}`]) === false) {
            log(
                `get_args: command ${
                    command.name
                } had required arguments and an invocation matched its generated regex, but the match object was missing argument #${required_arg_numbers[
                    i
                ].toString()}! Returning {succeeded: false}...`,
                LogType.Mismatch,
            );
            return failed(true, null);
        }
    }

    let renamed_params: { [key: string]: string | null } = {};
    command.arguments.forEach((arg, index) => {
        // { ts-malfunction }
        // @ts-expect-error
        const val = groups[`arg_${(index + 1).toString()}`];
        if (is_string(val)) renamed_params[arg.id] = val;
        else renamed_params[arg.id] = null;
    });

    return {
        succeeded: true,
        compiled: true,
        values: renamed_params as ArgumentValues<typeof command.arguments>["values"],
        inconsistent_key_offs: [],
        syntax_string_compilation_error: null,
    };
};

/**
 *
 * @param prefix The prefix currently in place (because of the server)
 * @param invocation The content of the message to check as an invocation for each of the subcommands
 * @param args A list of tuples where `tuple[0]` is the subcommand's name and `tuple[1]` is the subcommand's manual.
 * @returns A tuple where `return[0]` is the name of the subcommand that matched and `return[1]` is the `GetArgsResult`, or `false` if there were no valid invocations.
 */
export const get_first_matching_subcommand = function <List extends readonly (readonly [string, SubcommandManual])[]>(
    prefix: string,
    invocation: string,
    args: List,
): [ContainedSubcommandNames<typeof args>, ArgumentValues<ContainedArgumentsList<typeof args>>] | false {
    for (let i = 0; i < args.length; i++) {
        const subcommand_name = args[i][0] as ContainedSubcommandNames<typeof args>;
        const manual = args[i][1];
        const result = get_args(prefix, manual, invocation);
        if (result.succeeded) return [subcommand_name, result as any];
    }

    return false;
};

export const handle_GetArgsResult = async function <ArgumentList extends readonly CommandArgument[]>(
    message: Message,
    result: ArgumentValues<ArgumentList>,
    prefix: string | undefined,
): Promise<boolean> {
    if (result.succeeded) return true;

    if (result.compiled) {
        if (result.inconsistent_key_offs.length > 0) {
            message.channel.send(
                `Command invocation error: the provided message contained some elements which were inconsistent in determining whether an optional argument was being provided.`,
            );
            message.channel.send(
                `Detail: ${result.inconsistent_key_offs
                    .map(tuple => {
                        return `in the case of ${tuple[0]}, the first group that determined whether it was provided ${
                            tuple[2] ? "was" : "was not"
                        } present, while at least one of the others ${tuple[2] === false ? "was" : "was not"}.`;
                    })
                    .join("\n")}`,
            );
            return false;
        } else {
            message.channel.send(
                `Command invocation error: the command was formatted incorrectly. Use '${prefix}commands' to see the correct syntaxes.`,
            );
            return false;
        }
    } else {
        message.channel.send(
            `Developer-level error: the provided syntax string for the command failed to compile (error: ${(
                result.syntax_string_compilation_error as [InvalidSyntaxStringReason, number]
            ).join()}). Contact @${MAINTAINER_TAG} for help.`,
        );

        return false;
    }
};
