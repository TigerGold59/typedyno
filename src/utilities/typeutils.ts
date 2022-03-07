import { Client, DMChannel, Guild, Interaction, InteractionReplyOptions, Message, MessagePayload, TextChannel, User } from "discord.js";
import { readFile } from "fs";
import { UNKNOWN_USER_TAG } from "../main.js";
import { is_alphabetic, is_digit, is_whitespace } from "./argument_processing/arguments_types.js";
import { LogType, log } from "./log.js";
import { Snowflake } from "./permissions.js";

export const is_string = function (thing: unknown): thing is string {
    if (thing === "") {
        return true;
    } else if (!thing) {
        return false;
    } else if (typeof thing === "string") {
        return true;
    } else {
        return false;
    }
};

export const is_number = function (thing: unknown): thing is number {
    if (thing === 0) return true;
    else if (!thing) {
        return false;
    } else if (typeof thing === "number") {
        if (isNaN(thing)) {
            return false;
        } else if (!isFinite(thing)) {
            return false;
        } else {
            return true;
        }
    } else {
        return false;
    }
};

export const to_num_and_lower = (str: string): string => {
    return str
        .trim()
        .replace(/-|_/, " ")
        .split("")
        .filter(val => is_alphabetic(val) || is_digit(val) || is_whitespace(val))
        .join("")
        .toLowerCase();
};

export const is_bigint = function (thing: unknown): thing is bigint {
    return typeof thing === "bigint";
};

export const is_bigint_convertible = function (str: string): boolean {
    return /^-?[0-9]+$/.test(str);
};

export const is_record = function (thing?: unknown): thing is Record<string | symbol, unknown> {
    return typeof thing === "object" && thing !== null;
};

export const is_boolean = function (thing?: unknown): thing is boolean {
    return thing === true || thing === false;
};

// TODO: Make utility function that checks what type of guild a Guild is (i.e. a server, group DM, etc.)

export const is_server = function (guild: unknown): boolean {
    if (!guild) {
        return false;
    }
    return guild instanceof Guild;
};

/**
 * Returns whether the message is in a DMChannel
 * @param message The `Message` object to check
 */
export const is_dm = function (message?: Message): boolean {
    return message?.channel instanceof DMChannel;
};

export type TextChannelMessage = Message & { channel: TextChannel } & { guild: Guild };

/**
 * Returns whether the message is in a non-DM TextChannel
 * @param message The `Message` object to check
 * @returns
 */
export const is_text_channel = function (message?: Message): message is TextChannelMessage {
    return message?.channel instanceof TextChannel && message?.guild instanceof Guild;
};

export const escape_reg_exp = function (str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
};

export const safe_serialize = function (value: unknown, call_stack: unknown[] = []): string {
    if (value instanceof Error) {
        if (is_string(value.stack)) {
            return value.stack;
        } else {
            return `${value.name}: ${value.message}`;
        }
    }
    const type = typeof value;
    switch (type) {
        case "symbol": {
            return "[symbol Symbol]";
        }
        case "function": {
            return `[function ${(value as (...args: unknown[]) => unknown).name}]`;
        }
        case "bigint": {
            return `${(value as bigint).toString(10)}n`;
        }
        case "boolean": {
            return value === true ? "true" : "false";
        }
        case "number": {
            return (value as number).toString();
        }
        case "string": {
            return `"${value as string}"`;
        }
        case "object": {
            if (value === null) return "null";
            const level = call_stack.indexOf(value);
            if (level > -1) return `[circular (ref root child ${level})]`;
            else if (value instanceof Array) {
                return "[" + value.map(el => safe_serialize(el, [...call_stack, value])).join(", ") + "]";
            } else if (value instanceof Object) {
                const keys = Object.keys(value);
                const key_values = keys.map(key => {
                    const context = [...call_stack, value];
                    return `${safe_serialize(key, context)}: ${safe_serialize((value as { [P in typeof keys[number]]: unknown })[key], context)}`;
                });
                return `{ ${key_values.join(", ")} }`;
            } else {
                return "unknown";
            }
        }
        case "undefined": {
            return "undefined";
        }
    }
};

export type Unknown<T> = { [P in keyof T]: unknown };

export type OptionalNull<T> = { [P in keyof T]: T[P] | null };

export const filter_map = <Element, ResultElement>(
    list: readonly Element[],
    callback: <ThrowawaySymbol extends symbol>(element: Element, index: number, throwaway: ThrowawaySymbol) => ResultElement | ThrowawaySymbol,
): ResultElement[] => {
    const res = [];
    const throwaway_symbol = Symbol(`filter_map ${Date.now().toString()}`);
    for (let i = 0; i < list.length; i++) {
        const result = callback(list[i], i, throwaway_symbol);
        if (result === throwaway_symbol) continue;
        else res.push(result);
    }

    return res;
};

export const read_file = async function (filepath: string): Promise<string> {
    return new Promise((res, rej) => {
        readFile(
            filepath,
            {
                encoding: "utf-8",
            },
            (err, data) => {
                if (err === null) res(data);
                else rej(err);
            },
        );
    });
};

export const query_failure = function (function_name: string, query_string: string, query_parameters: unknown[], err: unknown): void {
    log(`${function_name}: unexpectedly failed when attempting query.`, LogType.Error);
    log(`Query string:`, LogType.Error);
    log(query_string, LogType.Error);
    log(`Query parameters: `, LogType.Error);
    log(safe_serialize(query_parameters), LogType.Error);
    log(safe_serialize(err), LogType.Error);
};

export type NumberComparable = number | bigint;

const is_NumberComparable = (value: unknown): value is NumberComparable => is_number(value) || is_bigint(value);

/**
 * Defines a range of possible numberic values.
 * Default inclusivity is false for both start. and end.
 */
export interface Range {
    start?: NumberComparable;
    start_inclusive?: boolean;
    end?: NumberComparable;
    end_inclusive?: boolean;
}

export const RangeClosedOpen = (start: NumberComparable, end: NumberComparable): Range => {
    return { start: start, start_inclusive: true, end: end, end_inclusive: false };
};

export const InclusiveRange = (start: NumberComparable, end: NumberComparable): Range => {
    return { start: start, start_inclusive: true, end: end, end_inclusive: true };
};

export const PositiveIntegerMax = (less_than_or_equal_to: NumberComparable): Range => {
    return { start: 0, start_inclusive: true, end: less_than_or_equal_to, end_inclusive: true };
};

export const ExactRange = (exactly_equal_to: NumberComparable): Range => {
    return { start: exactly_equal_to, start_inclusive: true, end: exactly_equal_to, end_inclusive: true };
};

export type RangeValidated = [boolean, boolean];

export const in_range = (input: NumberComparable, range: Range): [boolean, boolean] => {
    if (is_NumberComparable(input) === false) return [false, false];
    // 0n === 0 is false, but 0n == 0 is true
    // eslint-disable-next-line eqeqeq
    const start_valid = is_NumberComparable(range.start) ? input > range.start || (input == range.start && range.start_inclusive === true) : true;
    // eslint-disable-next-line eqeqeq
    const end_valid = is_NumberComparable(range.end) ? input < range.end || (input == range.end && range.end_inclusive === true) : true;
    return [start_valid, end_valid];
};

export const null_to_undefined = <T>(arg: T | null): Exclude<T, null> | undefined => {
    if (arg === null) return undefined;
    else return arg as Exclude<T, null>;
};

export const undefined_to_null = <T>(arg: T | undefined): Exclude<T, undefined> | null => {
    if (arg === undefined) return null;
    else return arg as Exclude<T, undefined>;
};

type KeysByType<O, T> = {
    [K in keyof O]-?: T extends O[K] ? K : never;
}[keyof O];

type KeysByNotType<O, T> = {
    [K in keyof O]-?: T extends O[K] ? never : K;
}[keyof O];

export type UndefinedToOptional<S extends Record<string | number | symbol, unknown>> = {
    [Key in KeysByType<S, undefined>]?: Exclude<S[Key], undefined>;
} & { [Key in KeysByNotType<S, undefined>]: S[Key] };

export const get_user_tag = async (id: Snowflake, client: Client): Promise<string | false> => {
    let user: User | null;
    try {
        user = await client.users.fetch(id);
    } catch (err) {
        user = null;
    }
    if (user === null) {
        return false;
    } else {
        return user.tag;
    }
};
export class UserTagManager {
    readonly #_fetch: (id: Snowflake) => Promise<string>;
    #_map: Map<Snowflake, string> = new Map();
    constructor(client: Client) {
        this.#_fetch = async (id: Snowflake) => {
            let res = await get_user_tag(id, client);
            if (res === false) return UNKNOWN_USER_TAG;
            return res;
        };
    }

    async get(id: Snowflake): Promise<string> {
        let map_result = this.#_map.get(id);
        if (map_result === undefined) {
            let fetch_result = await this.#_fetch(id);
            this.#_map.set(id, fetch_result);
            return fetch_result;
        } else {
            return map_result;
        }
    }
}

export const format_date = (seconds: number): string => {
    return new Date(seconds * 1000).toDateString();
};

export const safe_reply = async (interaction: Interaction, options: string | MessagePayload | InteractionReplyOptions): Promise<boolean> => {
    try {
        if (interaction.isApplicationCommand() && interaction.isCommand()) {
            await interaction.reply(options);
            return true;
        }
        return false;
    } catch (err) {
        log(`safe_reply: interaction.reply failed. Nothing will be seen from the user's point of view.`, LogType.Error);
        log(err, LogType.Error);
        return false;
    }
};
