import { DMChannel, Guild, Message, TextChannel } from "discord.js";
import { readFile } from "fs";
import { log, LogType } from "./log.js";

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

export const is_number = function (thing?: unknown): thing is number {
    if (thing === 0) return true;
    else if (!thing) {
        return false;
    } else if (typeof thing === "number") {
        if (isNaN(thing as number)) {
            return false;
        } else if (!isFinite(thing as number)) {
            return false;
        } else {
            return true;
        }
    } else {
        return false;
    }
};

export const is_boolean = function (thing?: unknown): thing is boolean {
    return thing === true || thing === false;
};

// TODO: Make utility function that checks what type of guild a Guild is (i.e. a server, group DM, etc.)

export const is_server = function (guild: any): boolean {
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

/**
 * Returns whether the message is in a non-DM TextChannel
 * @param message The `Message` object to check
 * @returns
 */
export const is_text_channel = function (message?: Message): boolean {
    return message?.channel instanceof TextChannel && message?.guild instanceof Guild;
};

export const escape_reg_exp = function (str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
};

export const safe_serialize = function (value: any): string {
    if (typeof value === "bigint") {
        return `${value.toString(10)}n`;
    } else {
        try {
            const result = JSON.stringify(value);
            return result;
        } catch (err) {
            return "([circular object])";
        }
    }
};

export type Unknown<T> = { [P in keyof T]: unknown };

export type OptionalNull<T> = { [P in keyof T]: T[P] | null };

export const filter_map = <Element, ResultElement>(
    list: Element[],
    callback: <ThrowawaySymbol extends symbol>(element: Element, index: number, throwaway: ThrowawaySymbol) => ResultElement | ThrowawaySymbol,
): ResultElement[] => {
    let res = [];
    const throwaway_symbol = Symbol(`filter_map ${Date.now().toString()}`);
    for (let i = 0; i < list.length; i++) {
        const result = callback(list[i], i, throwaway_symbol);
        if (result === throwaway_symbol) continue;
        else res.push(result as ResultElement);
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

export const query_failure = function (function_name: string, query_string: string, query_parameters: any[], err: any): void {
    log(`${function_name}: unexpectedly failed when attempting query.`, LogType.Error);
    log(`Query string:`, LogType.Error);
    log(query_string, LogType.Error);
    log(`Query parameters: `, LogType.Error);
    log(safe_serialize(query_parameters), LogType.Error);
    log(safe_serialize(err), LogType.Error);
};
