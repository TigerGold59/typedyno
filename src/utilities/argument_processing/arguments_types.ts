import { CommandArgument, SubcommandManual } from "../../command_manual.js";
import { AnyStructure, InferNormalizedType } from "../runtime_typeguard/runtime_typeguard.js";
import { is_string } from "../typeutils.js";

export const is_alphabetic = function (str: string): boolean {
    if (!is_string(str) || str.length !== 1) return false;
    else
        return [
            "a",
            "b",
            "c",
            "d",
            "e",
            "f",
            "g",
            "h",
            "i",
            "j",
            "k",
            "l",
            "m",
            "n",
            "o",
            "p",
            "q",
            "r",
            "s",
            "t",
            "u",
            "v",
            "w",
            "x",
            "y",
            "z",
            "A",
            "B",
            "C",
            "D",
            "E",
            "F",
            "G",
            "H",
            "I",
            "J",
            "K",
            "L",
            "M",
            "N",
            "O",
            "P",
            "Q",
            "R",
            "S",
            "T",
            "U",
            "V",
            "W",
            "X",
            "Y",
            "Z",
        ].includes(str);
};

export const is_whitespace = function (str: string): boolean {
    return str.trim() === "";
};

export const is_digit = function (str: string): boolean {
    if (!is_string(str) || str.length !== 1) return false;
    else return ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].includes(str);
};

export const enum SyntaxStringParserState {
    None,
    PrefixTag,
    DeterminationTagBeginning,
    DeterminationTag,
    StaticTopLevel,
    ArgumentIdentifier,
    KeyOffInCurlyBraces,
    ArgumentIdentifierInKeyOffInCurlyBraces,
    ContentInKeyOffInSquareBrackets,
}

export const enum InvalidSyntaxStringReason {
    DeterminationTagDoesNotStartWithPrefixTag = 0,
    DoesNotStartWithDeterminationTag,
    UnmatchedDeterminationTagOpening,
    InvalidPrefixTagContent,
    PrefixTagStartedButNeverCloses,
    CommandNameDoesNotImmediatelyFollowPrefixTag,
    ArgumentReferencedMoreThanOnce,
    NonexistentArgumentReferenced,
    IllegalArgumentIdentifier,
    UnmatchedLeftSquareBracket,
    UnmatchedLeftCurlyBracket,
    OptionalArgumentReferredToByIdentifierOutsideItsKeyOff,
    KeyOffArgumentIdentifierRefersToNonOptionalArgument,
    InvalidContentInKeyOffCurlyBraces,
    InvalidContentInBetweenKeyOffCurlyBracesAndSquareBrackets,
    SyntaxStringEndsInNonTopLevelState,
    MultipleArgumentsReferredToByIdentifierWithoutSeparatingCharacters,
}

export const enum SyntaxStringSegmentType {
    PrefixTag,
    DeterminationTag,
    ArgumentIdentifier,
    KeyOffStatement,
}

export type SyntaxStringSegmentContent = string | SyntaxStringSegment;

interface SyntaxStringSegment {
    content: SyntaxStringSegmentContent[] | null;
    type: SyntaxStringSegmentType;
    argument_number: number | null; // if this is an argument identifier or a key off, the argument number that it represents
}

// Incredibly awesome but somewhat jank idea that lets us have actual, representative types in the values department of GetArgsResult
// note: only works if the type being passed as ArgumentList is generated using typeof (variable marked as 'as const')

export type ContainedArgumentsList<Arr extends readonly (readonly [string, SubcommandManual])[]> = Arr[number][1]["arguments"];

export type ContainedSubcommandNames<Arr extends readonly (readonly [string, SubcommandManual])[]> = Arr[number][0];

type Argument<ArgumentList extends readonly CommandArgument[]> = ArgumentList[number];

type ArgumentID<Argument extends CommandArgument> = Argument["id"];

type PossiblyNullable<ArgumentList extends readonly CommandArgument[], ID extends ArgumentID<Argument<ArgumentList>>> = ID extends ArgumentID<
    Argument<ArgumentList>
>
    ? (Argument<ArgumentList> & { readonly id: ID })["optional"] extends false
        ? string
        : string | null
    : never;

export interface GetArgsResult<ArgumentList extends readonly CommandArgument[]> {
    succeeded: boolean;
    compiled: boolean;
    values:
        | {
              [ID in ArgumentID<Argument<ArgumentList>>]: PossiblyNullable<ArgumentList, ID>;
          }
        | null;
    inconsistent_key_offs: [string, number, boolean][];
    syntax_string_compilation_error: [InvalidSyntaxStringReason, number] | null;
}

type BaseType<Argument extends CommandArgument> = Argument["further_constraint"] extends AnyStructure
    ? InferNormalizedType<Argument["further_constraint"]>
    : string;

export type ValidatedArguments<Manual extends SubcommandManual> = {
    [Argument in Manual["arguments"][number] as Argument["id"]]: Argument["optional"] extends false ? BaseType<Argument> : BaseType<Argument> | null;
};
