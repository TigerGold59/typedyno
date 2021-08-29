import { BinaryLike, createHash } from "node:crypto";
import { DebugLogType, log, LogType } from "../../../../utilities/log.js";
import { ParamValueType, PartialSpecification, require_properties, Specification } from "../../../../utilities/runtime_typeguard.js";
import { is_valid_Snowflake, Snowflake } from "../../../../utilities/permissions.js";
import { is_number, is_string } from "../../../../utilities/typeutils.js";

export const enum Kingdom {
    Cap = 0,
    Cascade,
    Sand,
    Lake,
    Wooded,
    Cloud,
    Lost,
    NightMetro,
    Metro,
    Snow,
    Seaside,
    Luncheon,
    Ruined,
    Bowser,
    Moon,
    DarkSide,
    DarkerSide,
    Mushroom,
}

export const KINGDOM_NAMES = [
    "Cap Kingdom",
    "Cascade Kingdom",
    "Sand Kingdom",
    "Lake Kingdom",
    "Wooded Kingdom",
    "Cloud Kingdom",
    "Lost Kingdom",
    "Night Metro Kingdom",
    "Metro Kingdom",
    "Snow Kingdom",
    "Seaside Kingdom",
    "Luncheon Kingdom",
    "Ruined Kingdom",
    "Bowser's Kingdom",
    "Moon Kingdom",
    "Dark Side",
    "Darker Side",
    "Mushroom Kingdom",
] as const;

export type Lowercased<List extends readonly string[]> = {
    [Key in keyof List]: Lowercase<List[Key] & string>;
};

export const KINGDOM_NAMES_LOWERCASE = KINGDOM_NAMES.map(name => name.toLowerCase()) as unknown as Lowercased<typeof KINGDOM_NAMES>;

export const KingdomNameToKingdom = (str: string): Kingdom | null => {
    const index = KINGDOM_NAMES_LOWERCASE.indexOf(str.toLowerCase() as any);
    return index === -1 ? null : index;
};

export type JumproleHandle = number | [string, Snowflake];

export const enum JumproleHandleType {
    Invalid = 0,
    ID,
    NameAndServer,
}

export interface Jumprole {
    id: number;
    name: string;
    description: string;
    kingdom: Kingdom | null;
    location: string | null;
    jump_type: string | null;
    link: string | null;
    added_by: Snowflake;
    updated_at: number;
    server: Snowflake;
    hash: string;
}

export interface PGJumprole {
    id: string;
    name: string;
    description: string;
    kingdom?: string;
    location?: string;
    jump_type?: string;
    link?: string;
    added_by: string;
    updated_at: string;
    server: string;
    hash: string;
}

export const is_valid_jump_id = function (thing?: unknown): boolean {
    if (!thing || is_number(thing) === false) {
        return false;
    } else if (is_number(thing)) {
        return /^\d{0,11}$/.test(thing.toString());
    } else {
        return false;
    }
};
export const is_valid_postgresql_int = is_valid_jump_id;

export const string_hash = function (thing: string | number): string {
    const hash = createHash("sha256");
    // dynamic dispatch ;)
    hash.update(thing.toString());
    return hash.digest("base64");
};

export const optional_hashable = function (thing?: string | number | null): BinaryLike[] {
    if (thing === null) {
        return [`null`];
    } else if (thing === undefined) {
        return [`undefined`];
    } else {
        // throw off attempts to place values that would hash the same way as null or undefined
        return [thing.toString(), string_hash(thing)];
    }
};

export const compute_jumprole_hash = function (jumprole: Jumprole): string {
    const hash = createHash("sha256");
    hash.update(jumprole.name);
    log(`compute_jumprole_hash: hashing jumprole.name ("${jumprole.name}")`, LogType.Status, DebugLogType.ComputeJumproleHashValues);
    hash.update(jumprole.description);
    log(`compute_jumprole_hash: hashing jumprole.description ("${jumprole.description}")`, LogType.Status, DebugLogType.ComputeJumproleHashValues);
    // Make sure we hash null or undefined different than any string value
    optional_hashable(jumprole.kingdom).forEach(value => hash.update(value));
    log(
        `compute_jumprole_hash: hashing jumprole.kingdom (${jumprole.kingdom === null ? "null" : `"${jumprole.kingdom.toString()}"`})`,
        LogType.Status,
        DebugLogType.ComputeJumproleHashValues,
    );
    optional_hashable(jumprole.location).forEach(value => hash.update(value));
    log(
        `compute_jumprole_hash: hashing jumprole.location (${jumprole.location === null ? "null" : `"${jumprole.location}"`})`,
        LogType.Status,
        DebugLogType.ComputeJumproleHashValues,
    );
    optional_hashable(jumprole.jump_type).forEach(value => hash.update(value));
    log(
        `compute_jumprole_hash: hashing jumprole.jump_type (${jumprole.jump_type === null ? "null" : `"${jumprole.jump_type}"`})`,
        LogType.Status,
        DebugLogType.ComputeJumproleHashValues,
    );
    optional_hashable(jumprole.link).forEach(value => hash.update(value));
    log(
        `compute_jumprole_hash: hashing jumprole.link (${jumprole.link === null ? "null" : `"${jumprole.link}"`})`,
        LogType.Status,
        DebugLogType.ComputeJumproleHashValues,
    );
    hash.update(jumprole.added_by);
    log(`compute_jumprole_hash: hashing jumprole.added_by ("${jumprole.added_by}")`, LogType.Status, DebugLogType.ComputeJumproleHashValues);
    hash.update(jumprole.updated_at.toString());
    log(`compute_jumprole_hash: hashing jumprole.updated_at (${jumprole.updated_at})`, LogType.Status, DebugLogType.ComputeJumproleHashValues);
    hash.update(jumprole.server);
    log(`compute_jumprole_hash: hashing jumprole.server ("${jumprole.server}")`, LogType.Status, DebugLogType.ComputeJumproleHashValues);
    const digest = hash.digest("base64");
    log(`compute_jumprole_hash: final digest is ${digest}.`, LogType.Status, DebugLogType.ComputeJumproleHashValues);
    return digest;
};

export const check_jumprole_handle = function (thing?: unknown): JumproleHandleType {
    if (!thing && thing !== 0) {
        return JumproleHandleType.Invalid;
    } else if (is_valid_jump_id(thing)) {
        return JumproleHandleType.ID;
    } else if (Array.isArray(thing) && 0 in thing && 1 in thing && thing.length === 2) {
        if (is_string(thing[0]) && is_valid_Snowflake(thing[1])) {
            return JumproleHandleType.NameAndServer;
        }
    }
    return JumproleHandleType.Invalid;
};

export const PGJumproleSPECIFICATION: Specification<PGJumprole> = [
    { type: ParamValueType.UInt4N, name: "id" },
    { type: ParamValueType.String, name: "name" },
    { type: ParamValueType.String, name: "description" },
    {
        type: {
            value: ParamValueType.KingdomIndexN,
            accepts_null: true,
            accepts_undefined: true,
            preserve_undefined: false,
        },
        name: "kingdom",
    },
    {
        type: {
            value: ParamValueType.String,
            accepts_null: true,
            accepts_undefined: true,
            preserve_undefined: false,
        },
        name: "location",
    },
    {
        type: {
            value: ParamValueType.String,
            accepts_null: true,
            accepts_undefined: true,
            preserve_undefined: false,
        },
        name: "jump_type",
    },
    {
        type: {
            value: ParamValueType.String,
            accepts_null: true,
            accepts_undefined: true,
            preserve_undefined: false,
        },
        name: "link",
    },
    { type: ParamValueType.Snowflake, name: "added_by" },
    { type: ParamValueType.UInt4N, name: "updated_at" },
    { type: ParamValueType.Snowflake, name: "server" },
    { type: ParamValueType.String, name: "hash" },
] as const;

export const JumproleSPECIFICATION: Specification<Jumprole> = [
    { type: ParamValueType.UInt4N, name: "id" },
    { type: ParamValueType.String, name: "name" },
    { type: ParamValueType.String, name: "description" },
    {
        type: {
            value: ParamValueType.KingdomIndexN,
            accepts_null: true,
            accepts_undefined: false,
            preserve_undefined: false,
        },
        name: "kingdom",
    },
    {
        type: {
            value: ParamValueType.String,
            accepts_null: true,
            accepts_undefined: false,
            preserve_undefined: false,
        },
        name: "location",
    },
    {
        type: {
            value: ParamValueType.String,
            accepts_null: true,
            accepts_undefined: false,
            preserve_undefined: false,
        },
        name: "jump_type",
    },
    {
        type: {
            value: ParamValueType.String,
            accepts_null: true,
            accepts_undefined: false,
            preserve_undefined: false,
        },
        name: "link",
    },
    { type: ParamValueType.Snowflake, name: "added_by" },
    { type: ParamValueType.UInt4N, name: "updated_at" },
    { type: ParamValueType.Snowflake, name: "server" },
    { type: ParamValueType.String, name: "hash" },
] as const;

export const PartialJumproleSPECIFICATION: Specification<Partial<Jumprole>> = PartialSpecification(JumproleSPECIFICATION);

/**
 * Converts the result received from client.query to our Jumprole object.
 * @param object The supposed PGJumprole to convert to our Jumprole object. It is thoroughly type-checked for validity.
 * @returns Jumprole or null if it was invalid.
 */
export const PGJumprole_to_Jumprole = function (object: unknown): Jumprole | null {
    if (!object) {
        return null;
    }

    const result = require_properties(object, "PGJumprole_to_Jumprole", ...PGJumproleSPECIFICATION);

    if (result === false) {
        return null;
    }
    // A record can have any string as keys!
    // { ts-malfunction }
    // @ts-expect-error
    if (compute_jumprole_hash(result as Jumprole) !== result.hash) {
        log(`PGJumprole_to_Jumprole: PGJumprole.hash unexpectedly did not match computed Jumprole hash value! Returning null.`, LogType.Mismatch);
        return null;
    }
    // If it isn't fully complete, we've already returned null; we're safe to return it
    // { ts-malfunction }
    // @ts-expect-error
    return result as Jumprole;
};
