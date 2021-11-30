import { CommandArgument, SimpleCommandManual, SubcommandManual } from "../../command_manual.js";
import { BotInteraction, MakeReplier } from "../../functions.js";
import { MAINTAINER_TAG } from "../../main.js";
import { log, LogType } from "../log.js";
import { escape_reg_exp, is_string } from "../typeutils.js";
import {
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
// eslint-disable-next-line complexity
export const parse_syntax_string_with_initial_state = function (
    args: readonly CommandArgument[],
    str: string,
    state: SyntaxStringParserState,
    key_off_stack: number[],
    top_level_call: boolean,
    argument_references: boolean[],
): SyntaxStringCompiled {
    const res: SyntaxStringSegmentContent[] = [];

    let current_segment = "";
    let auxiliary_segment = "";
    let argument_identifier_segment = "";
    let possible_argument_identifier_full_segment = "";
    let just_referred_to_argument = false;
    let current_argument_identifier: number | null = null;
    let subres: SyntaxStringSegmentContent[] = [];

    let top_level_validated = false;

    const to_parse = top_level_call ? str.trim() : str;
    // example syntax string: ::<prefix>jumprole update:: NAME $1{opt $2}[ KINGDOM $2]{opt $3}[ LOCATION $3]{opt $4}[ JUMP TYPE $4]{opt $5}[ LINK $5]{opt $6}[ INFO $6]
    // ingest string character by character
    for (let index = 0; index < to_parse.length; index++) {
        const char = to_parse[index];
        switch (state) {
            case SyntaxStringParserState.None: {
                if (char !== ":" || to_parse[index + 1] !== ":")
                    return {
                        type: SyntaxStringCompiledType.Error,
                        error: { reason: InvalidSyntaxStringReason.DoesNotStartWithDeterminationTag, index },
                    };
                state = SyntaxStringParserState.DeterminationTagBeginning;
                current_segment = "";
                index += 1;
                break;
            }
            case SyntaxStringParserState.DeterminationTagBeginning: {
                if (char !== "<")
                    return {
                        type: SyntaxStringCompiledType.Error,
                        error: { reason: InvalidSyntaxStringReason.DeterminationTagDoesNotStartWithPrefixTag, index },
                    };
                state = SyntaxStringParserState.PrefixTag;
                current_segment = "";
                break;
            }
            case SyntaxStringParserState.DeterminationTag: {
                if (index === to_parse.length - 1) {
                    return {
                        type: SyntaxStringCompiledType.Error,
                        error: { reason: InvalidSyntaxStringReason.UnmatchedDeterminationTagOpening, index },
                    };
                } else if (top_level_validated === false && top_level_call) {
                    if (is_alphabetic(char) === false && is_whitespace(char) === false)
                        return {
                            type: SyntaxStringCompiledType.Error,
                            error: { reason: InvalidSyntaxStringReason.CommandNameDoesNotImmediatelyFollowPrefixTag, index },
                        };
                    else if (is_alphabetic(char)) {
                        current_segment += char;
                        top_level_validated = true;
                    } else if (char === " ") {
                        current_segment += char;
                    } else void 0;
                } else if (char === ":" && to_parse[index + 1] === ":") {
                    res.push({
                        content: [...subres, current_segment],
                        type: SyntaxStringSegmentType.DeterminationTag,
                        argument_number: null,
                    });
                    current_segment = "";
                    subres = [];
                    state = SyntaxStringParserState.StaticTopLevel;
                    index += 1;
                } else {
                    current_segment += char;
                }
                break;
            }
            case SyntaxStringParserState.PrefixTag: {
                if (char !== ">") current_segment += char.toLowerCase();
                else if (current_segment === "prefix") {
                    state = SyntaxStringParserState.DeterminationTag;
                    current_segment = "";
                    subres.push({
                        content: [],
                        type: SyntaxStringSegmentType.PrefixTag,
                        argument_number: null,
                    });

                    // ignore coming whitespace
                    while (is_whitespace(to_parse[index + 1])) index++;
                } else return { type: SyntaxStringCompiledType.Error, error: { reason: InvalidSyntaxStringReason.InvalidPrefixTagContent, index } };
                break;
            }
            case SyntaxStringParserState.StaticTopLevel: {
                if (char === "$") {
                    state = SyntaxStringParserState.ArgumentIdentifier;
                    break;
                } else if (char === "{") {
                    state = SyntaxStringParserState.KeyOffInCurlyBraces;
                    just_referred_to_argument = false;
                } else if (char === "]" && top_level_call === false) {
                    res.push(current_segment);
                    return { type: SyntaxStringCompiledType.Success, segments: res, argument_references, end_index: index };
                } else {
                    current_segment += char;
                    just_referred_to_argument = false;
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
                        return {
                            type: SyntaxStringCompiledType.Error,
                            error: { reason: InvalidSyntaxStringReason.InvalidContentInBetweenKeyOffCurlyBracesAndSquareBrackets, index },
                        };
                    else if (current_argument_identifier !== null) {
                        state = SyntaxStringParserState.ContentInKeyOffInSquareBrackets;
                        auxiliary_segment = "";
                        index++;
                    }
                } else if (is_alphabetic(char)) auxiliary_segment += char.toLowerCase();
                else if (char === "$" && auxiliary_segment === "opt") {
                    argument_identifier_segment = "";
                    state = SyntaxStringParserState.ArgumentIdentifierInKeyOffInCurlyBraces;
                } else
                    return {
                        type: SyntaxStringCompiledType.Error,
                        error: { reason: InvalidSyntaxStringReason.InvalidContentInKeyOffCurlyBraces, index },
                    };
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
                            return {
                                type: SyntaxStringCompiledType.Error,
                                error: { reason: InvalidSyntaxStringReason.InvalidContentInBetweenKeyOffCurlyBracesAndSquareBrackets, index },
                            };
                        if (argument_number - 1 >= argument_references.length)
                            return {
                                type: SyntaxStringCompiledType.Error,
                                error: { reason: InvalidSyntaxStringReason.NonexistentArgumentReferenced, index },
                            };
                        if (args[argument_number - 1].optional === false)
                            return {
                                type: SyntaxStringCompiledType.Error,
                                error: { reason: InvalidSyntaxStringReason.KeyOffArgumentIdentifierRefersToNonOptionalArgument, index },
                            };
                        current_argument_identifier = Number(argument_identifier_segment);
                        index -= 1; // so that SyntaxStringParserState.KeyOffInCurlyBraces case reads this character, in order to judge if it's a valid end character
                        argument_identifier_segment = "";
                    } else
                        return {
                            type: SyntaxStringCompiledType.Error,
                            error: { reason: InvalidSyntaxStringReason.InvalidContentInKeyOffCurlyBraces, index },
                        }; // we have nothing valid in here and the string has ended
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
                            return {
                                type: SyntaxStringCompiledType.Error,
                                error: {
                                    reason: InvalidSyntaxStringReason.MultipleArgumentsReferredToByIdentifierWithoutSeparatingCharacters,
                                    index,
                                },
                            };
                        }
                        const argument_number = Number(argument_identifier_segment);
                        if (Number.isInteger(argument_number) === false || argument_number < 1)
                            return {
                                type: SyntaxStringCompiledType.Error,
                                error: { reason: InvalidSyntaxStringReason.IllegalArgumentIdentifier, index },
                            };
                        if (argument_number - 1 >= argument_references.length)
                            return {
                                type: SyntaxStringCompiledType.Error,
                                error: { reason: InvalidSyntaxStringReason.NonexistentArgumentReferenced, index },
                            };
                        if (argument_references[argument_number - 1] !== false)
                            return {
                                type: SyntaxStringCompiledType.Error,
                                error: { reason: InvalidSyntaxStringReason.ArgumentReferencedMoreThanOnce, index },
                            };
                        // if we're referencing an optional arg outside its keyoff scope
                        if (key_off_stack.includes(argument_number) === false && args[argument_number - 1].optional) {
                            return {
                                type: SyntaxStringCompiledType.Error,
                                error: { reason: InvalidSyntaxStringReason.OptionalArgumentReferredToByIdentifierOutsideItsKeyOff, index },
                            };
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
                const sub_res = parse_syntax_string_with_initial_state(
                    args,
                    to_parse.substring(index),
                    SyntaxStringParserState.StaticTopLevel,
                    key_off_stack,
                    false,
                    argument_references,
                );
                const return_val = sub_res;
                if (return_val.type === SyntaxStringCompiledType.Error) return { type: return_val.type, error: return_val.error };
                else {
                    res.push(current_segment);
                    current_segment = "";
                    res.push({
                        content: return_val.segments,
                        type: SyntaxStringSegmentType.KeyOffStatement,
                        argument_number: current_argument_identifier,
                    });
                    index += return_val.end_index;
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
            return {
                type: SyntaxStringCompiledType.Error,
                error: { reason: InvalidSyntaxStringReason.MultipleArgumentsReferredToByIdentifierWithoutSeparatingCharacters, index: last },
            };
        }
        const argument_number = Number(argument_identifier_segment);
        if (Number.isInteger(argument_number) === false || argument_number < 1)
            return { type: SyntaxStringCompiledType.Error, error: { reason: InvalidSyntaxStringReason.IllegalArgumentIdentifier, index: last } };
        if (argument_number - 1 >= argument_references.length)
            return { type: SyntaxStringCompiledType.Error, error: { reason: InvalidSyntaxStringReason.NonexistentArgumentReferenced, index: last } };
        if (argument_references[argument_number - 1] !== false)
            return { type: SyntaxStringCompiledType.Error, error: { reason: InvalidSyntaxStringReason.ArgumentReferencedMoreThanOnce, index: last } };
        // if we're referencing an optional arg outside its keyoff scope
        if (key_off_stack.includes(argument_number) === false && args[argument_number - 1].optional) {
            return {
                type: SyntaxStringCompiledType.Error,
                error: { reason: InvalidSyntaxStringReason.OptionalArgumentReferredToByIdentifierOutsideItsKeyOff, index: last },
            };
        }
        res.push({
            content: null,
            type: SyntaxStringSegmentType.ArgumentIdentifier,
            argument_number: argument_number,
        });
    }

    return { type: SyntaxStringCompiledType.Success, segments: res, argument_references, end_index: to_parse.length - 1 };
};

export const enum SyntaxStringCompiledType {
    Success,
    Error,
}

export type SyntaxStringCompiled =
    | {
          type: SyntaxStringCompiledType.Success;
          segments: SyntaxStringSegmentContent[];
          argument_references: boolean[];
          end_index: number;
      }
    | { type: Exclude<SyntaxStringCompiledType, SyntaxStringCompiledType.Success>; error: SyntaxStringCompilationError };

// TODO: make a prefix-agnostic syntax string to argument regex compiler so that we can use the same compiled syntax string, even for different prefixes

const syntax_string_compile_cache: {
    [key: string]: {
        [key: string]: SyntaxStringCompiled;
    };
} = {};

interface CompiledSyntaxString {
    regex: RegExp;
    argument_references: Record<number, number>;
    determination_tag: RegExp;
}

export type SyntaxStringCompilationError = {
    reason: InvalidSyntaxStringReason;
    index: number;
};

export const update_syntax_string_cache = (prefix: string, syntax_string: string, result: SyntaxStringCompiled): SyntaxStringCompiled => {
    if (prefix in syntax_string_compile_cache) syntax_string_compile_cache[prefix][syntax_string] = result;
    else syntax_string_compile_cache[prefix] = { [syntax_string]: result };
    return result;
};

export const get_compiled = (prefix: string, args: readonly CommandArgument[], syntax_string: string): SyntaxStringCompiled => {
    if (prefix in syntax_string_compile_cache && syntax_string in syntax_string_compile_cache[prefix]) {
        return syntax_string_compile_cache[prefix][syntax_string];
    }
    const key_off_stack: number[] = [];
    const argument_references: boolean[] = args.length > 0 ? [false] : [];
    for (let i = 1; i < args.length; i++) argument_references.push(false);

    const result = parse_syntax_string_with_initial_state(
        args,
        syntax_string,
        SyntaxStringParserState.None,
        key_off_stack,
        true,
        argument_references,
    );
    if (result.type === SyntaxStringCompiledType.Error) {
        return update_syntax_string_cache(prefix, syntax_string, result);
    } else {
        return update_syntax_string_cache(prefix, syntax_string, result);
    }
};

export const enum SyntaxStringTestingResultType {
    Success,
    Error,
}

export type SyntaxStringTestingResult =
    | { type: SyntaxStringTestingResultType.Success; tests: CompiledSyntaxString }
    | { type: Exclude<SyntaxStringTestingResultType, SyntaxStringTestingResultType.Success>; error: SyntaxStringCompilationError };

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
): SyntaxStringTestingResult {
    let result = get_compiled(prefix, args, syntax_string);
    if (result.type === SyntaxStringCompiledType.Error) return { type: SyntaxStringTestingResultType.Error, error: result.error };

    let determination_tag_regex_str = "";

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
                case SyntaxStringSegmentType.DeterminationTag: {
                    for (const element of part.content as SyntaxStringSegmentContent[]) {
                        determination_tag_regex_str += construct_regex_part(element);
                    }
                    res += determination_tag_regex_str;
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
                    res += `(?<arg_${(part.argument_number as number).toString()}>(?:.|\n)+?)`;
                    break;
                }
            }
        }

        return res;
    };

    let res = "^";
    for (const part of result.segments) {
        res += construct_regex_part(part);
    }
    res += "$";

    let determination_tag_regex = new RegExp(`^${determination_tag_regex_str}`, "i");

    return {
        type: SyntaxStringTestingResultType.Success,
        tests: {
            regex: new RegExp(res, "i"),
            argument_references: argument_keyoff_accumulator,
            determination_tag: determination_tag_regex,
        },
    };
};

export type CallCheckResult =
    | {
          succeeded: true;
          is_call: boolean;
      }
    | { succeeded: false; syntax_string_error: SyntaxStringCompilationError };

export const is_call_of = (prefix: string, command: SimpleCommandManual, invocation: string): CallCheckResult => {
    const failed = (syntax_string_error: SyntaxStringCompilationError) => {
        return {
            succeeded: false,
            syntax_string_error: syntax_string_error,
        } as { succeeded: false; syntax_string_error: SyntaxStringCompilationError };
    };

    const result = syntax_string_to_argument_regex(prefix, command.arguments, command.syntax);
    if (result.type === SyntaxStringTestingResultType.Error) {
        log(
            `is_call_of: command ${command.name} had a malformed syntax string (syntax string processing failed with error #${
                result.error.reason
            } at index ${result.error.index.toString()}). Returning {succeeded: false}...`,
            LogType.Error,
        );
        return failed(result.error);
    } else {
        return {
            succeeded: true,
            is_call: result.tests.determination_tag.test(invocation),
        };
    }
};

export const enum GetDeterminationTagAsStringResultType {
    Success,
    Failed,
}

export type GetDeterminationTagAsStringResult =
    | { type: GetDeterminationTagAsStringResultType.Success; result: string }
    | { type: Exclude<GetDeterminationTagAsStringResultType, GetDeterminationTagAsStringResultType.Success>; error: SyntaxStringCompilationError };
export const get_determination_tag_as_str = (prefix: string, command: SimpleCommandManual): GetDeterminationTagAsStringResult => {
    const result = get_compiled(prefix, command.arguments, command.syntax);

    const assemble_parts = (syntax_string_segment_content: SyntaxStringSegmentContent, include = false): string => {
        let buffer = "";
        if (is_string(syntax_string_segment_content)) {
            if (include) buffer += syntax_string_segment_content;
        } else {
            switch (syntax_string_segment_content.type) {
                case SyntaxStringSegmentType.DeterminationTag: {
                    if (syntax_string_segment_content.content === null) return "";
                    buffer += syntax_string_segment_content.content.map(segment => assemble_parts(segment, true)).join("");
                    break;
                }
                case SyntaxStringSegmentType.PrefixTag: {
                    buffer += prefix;
                    break;
                }
                case SyntaxStringSegmentType.ArgumentIdentifier:
                case SyntaxStringSegmentType.KeyOffStatement: {
                    buffer += "";
                    break;
                }
            }
        }
        return buffer;
    };
    if (result.type === SyntaxStringCompiledType.Error) {
        return { type: GetDeterminationTagAsStringResultType.Failed, error: result.error };
    } else {
        let parts = result.segments;

        return {
            type: GetDeterminationTagAsStringResultType.Success,
            result: parts
                .map(part => assemble_parts(part, false))
                .join("")
                .trim(),
        };
    }
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

    const failed = (compiled: boolean, syntax_string_error: SyntaxStringCompilationError | null): ArgumentValues<typeof command.arguments> => {
        return {
            succeeded: false,
            compiled: compiled,
            inconsistent_key_offs: [],
            values: null,
            syntax_string_compilation_error: syntax_string_error,
        };
    };

    // Processing syntax string failed
    if (result.type === SyntaxStringTestingResultType.Error) {
        log(
            `get_args: command ${
                command.name
            } had a malformed syntax string (syntax string processing failed with error #${result.error.reason.toString()} at index ${result.error.index.toString()}). Returning {succeeded: false}...`,
            LogType.Error,
        );
        return failed(false, result.error);
    } else {
        const argument_key_off_list = result.tests.argument_references;

        const match = result.tests.regex.exec(invocation);

        if (match === null) return failed(true, null);
        const groups = match.groups;

        const optional_arguments = [];
        const required_arguments = [];
        const required_arg_numbers: number[] = [];
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

        const inconsistent_key_offs: [string, number, boolean][] = [];

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

        const renamed_params: { [key: string]: string | null } = {};
        command.arguments.forEach((arg, index) => {
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
    }
};

/**
 *
 * @param prefix The prefix currently in place (because of the server)
 * @param invocation The content of the message to check as an invocation for each of the subcommands
 * @param args A list of tuples where `tuple[0]` is the subcommand's name and `tuple[1]` is the subcommand's manual.
 * @returns A tuple where `return[0]` is the name of the subcommand that matched and `return[1]` is the `GetArgsResult`, or `false` if there were no valid invocations.
 */
export const get_first_matching_subcommand = function <List extends readonly SubcommandManual[]>(
    prefix: string,
    invocation: string,
    args: List,
): ContainedSubcommandNames<typeof args> | false {
    for (let i = 0; i < args.length; i++) {
        const subcommand_name = args[i].name as ContainedSubcommandNames<typeof args>;
        const manual = args[i];
        const result = is_call_of(prefix, manual, invocation);
        if (result.succeeded && result.is_call) return subcommand_name;
    }

    return false;
};

export const handle_GetArgsResult = async function <ArgumentList extends readonly CommandArgument[]>(
    interaction: BotInteraction,
    command_name: string,
    result: ArgumentValues<ArgumentList>,
    prefix: string,
): Promise<boolean> {
    if (result.succeeded) return true;

    const reply = MakeReplier(interaction, command_name);

    if (result.compiled) {
        if (result.inconsistent_key_offs.length > 0) {
            await reply(
                `command invocation error - the provided message contained some elements which were inconsistent in determining whether an optional argument was being provided.`,
            );
            await reply(
                `Detail: ${result.inconsistent_key_offs
                    .map(tuple => {
                        return `in the case of ${tuple[0]}, the first group that determined whether it was provided ${
                            tuple[2] ? "was" : "was not"
                        } present, while at least one of the others ${tuple[2] === false ? "was" : "was not"}.`;
                    })
                    .join("\n")}`,
                false,
            );
            return false;
        } else {
            await reply(`command invocation error - the command was formatted incorrectly. Use '${prefix}commands' to see the correct syntaxes.`);
            return false;
        }
    } else {
        if (result.syntax_string_compilation_error === null) {
            await reply(
                `an internal error occurred - the provided syntax string for the command failed to compile. Contact @${MAINTAINER_TAG} for help.`,
            );
        } else {
            await reply(
                `an internal error occurred - the provided syntax string for the command failed to compile (error: #${result.syntax_string_compilation_error.reason}, location: ${result.syntax_string_compilation_error.index}). Contact @${MAINTAINER_TAG} for help.`,
            );
        }

        return false;
    }
};
