import { Guild } from "discord.js";
import { GLOBAL_PREFIX } from "../main.js";
import { Queryable, MakesSingleRequest, UsesClient, use_client } from "../pg_wrapper.js";
import { is_string } from "../utilities/typeutils.js";
import { log, LogType } from "../utilities/log.js";
import { PrefixQueryResults } from "../postgresql/table_types.js";

export const prefix_cache: Record<string, string | null> = {};

export const CREATE_SERVER_LISTING = "INSERT INTO prefixes (snowflake, prefix) VALUES ($1, $2)";
export const ALTER_SERVER_LISTING = "UPDATE prefixes SET prefix=$1 WHERE snowflake=$2";
export const DELETE_SERVER_LISTING = "DELETE FROM prefixes WHERE snowflake=$1";
export const GET_SERVER_LISTING = "SELECT (prefix) FROM prefixes WHERE snowflake=$1";

export const enum NoLocalPrefixEntryReason {
    NoDatabaseEntry = 0,
    InvalidGuildArgument = 1,
}

export async function get_prefix_entry(
    server: Guild | undefined | null,
    query_device: Queryable<MakesSingleRequest>,
): Promise<string | NoLocalPrefixEntryReason> {
    if (server === undefined || server === null || "id" in server === false || is_string(server.id) === false) {
        return NoLocalPrefixEntryReason.InvalidGuildArgument;
    }
    // If we have a cached prefix for it, use that
    if (is_string(prefix_cache[server.id])) {
        // @ts-expect-error the server ID is a string and the lookup worked, as checked above
        return prefix_cache[server.id];
    } else if (prefix_cache[server.id] === null) {
        return NoLocalPrefixEntryReason.NoDatabaseEntry;
    }
    // Otherwise, get it and update the cache
    else {
        // log(`get_prefix_entry: executing GET_SERVER_LISTING query...`)
        const prefixes = (await query_device.query(GET_SERVER_LISTING, [server.id])) as PrefixQueryResults;
        // No entry for the server ID
        if (prefixes.rowCount === 0) {
            // Update the cache
            prefix_cache[server.id] = null;
            return NoLocalPrefixEntryReason.NoDatabaseEntry;
        }
        // Entry case
        else {
            // Update the cache
            prefix_cache[server.id] = prefixes.rows[0].prefix;
            // @ts-expect-error we just assigned it...
            return prefix_cache[server.id];
        }
    }
}

export async function get_prefix(server: Guild | undefined | null, query_device: Queryable<MakesSingleRequest>): Promise<string> {
    const local_prefix = await get_prefix_entry(server, query_device);

    // Never return an invalid local prefix; we can be sure GLOBAL_PREFIX is valid because it's an environment variable
    if (local_prefix === NoLocalPrefixEntryReason.NoDatabaseEntry) {
        return GLOBAL_PREFIX;
    } else if (local_prefix === NoLocalPrefixEntryReason.InvalidGuildArgument) {
        log("Unexpected get_prefix error: Invalid guild argument (get_prefix_entry). Returning global prefix anyway...", LogType.Incompatibility);
        return GLOBAL_PREFIX;
    } else if (is_string(local_prefix) === false) {
        log(
            `Unexpected get_prefix error: Invalid return type "${typeof local_prefix}" (expected string or NoLocalPrefixEntryReason). Returning global prefix anyway...`,
            LogType.Mismatch,
        );
        return GLOBAL_PREFIX;
    } else {
        return local_prefix;
    }
}

export const enum SetPrefixNonStringResult {
    InvalidGuildArgument = "InvalidGuildArgument",
    InvalidPrefixArgument = "InvalidPrefixArgument",
    LocalPrefixArgumentSameAsGlobalPrefix = "LocalPrefixArgumentSameAsGlobalPrefix",
    CreatedNewRow = "CreatedNewRow",
    DatabaseOperationFailed = "DatabaseOperationFailed",
}

export interface SetPrefixResults {
    result: string | SetPrefixNonStringResult;
    did_succeed: boolean;
}

/**
 * Sets the local prefix for a guild, creating a database entry if it doesn't exist. If the prefix passed
 * is the same as the global prefix, we will not create an entry for it and will return `SetPrefixNonStringResult.InvalidGuildArgument`.
 * @param server The server to set the prefix for
 * @param prefix The prefix to set
 * @param queryable A `Queryable` `PoolClient`, `UsingClient`, or `Pool` that will be wrapped with a `UsingClient`
 * @returns `SetPrefixResults`: `results` will be the previous prefix as a string if it replaced a locally specific one, or a more specific result in the form of `SetPrefixNonStringResult` otherwise; `did_succeed` will be `true` if `get_prefix` will return the prefix passed as an argument from now on and `false` otherwise.
 */
export const set_prefix = async function (server: Guild, prefix: string, queryable: Queryable<UsesClient>): Promise<SetPrefixResults> {
    if (is_string(server.id) === false) {
        return {
            result: SetPrefixNonStringResult.InvalidGuildArgument,
            did_succeed: false,
        };
    } else if (is_string(prefix) === false || prefix.length > 10 || prefix.length < 1) {
        return {
            result: SetPrefixNonStringResult.InvalidPrefixArgument,
            did_succeed: false,
        };
    }

    const client = await use_client(queryable);

    const local_prefix_entry = await get_prefix_entry(server, client);

    // If this server has no special prefix entry and the user wants to set prefix the same as GLOBAL_PREFIX, there's no reason to.
    if (prefix === GLOBAL_PREFIX && local_prefix_entry === NoLocalPrefixEntryReason.NoDatabaseEntry) {
        return {
            result: SetPrefixNonStringResult.LocalPrefixArgumentSameAsGlobalPrefix,
            did_succeed: true,
        };
    }

    // Create a new row; we don't already have one for this server.
    if (local_prefix_entry === NoLocalPrefixEntryReason.NoDatabaseEntry && prefix !== GLOBAL_PREFIX) {
        try {
            // log(`set_prefix: executing CREATE_SERVER_LISTING query...`)
            await client.query(CREATE_SERVER_LISTING, [server.id, prefix]);
            // Update prefix cache
            prefix_cache[server.id] = prefix;
        } catch (err) {
            log(
                `Unexpected database error: set_prefix failed when creating new row {'snowflake': ${server.id}, 'prefix': ${prefix}}. Message:`,
                LogType.Error,
            );
            log(err, LogType.Error);

            client.handle_release();

            return {
                result: SetPrefixNonStringResult.DatabaseOperationFailed,
                did_succeed: false,
            };
        }

        client.handle_release();

        return {
            result: SetPrefixNonStringResult.CreatedNewRow,
            did_succeed: true,
        };
    } else if (local_prefix_entry === NoLocalPrefixEntryReason.InvalidGuildArgument) {
        client.handle_release();

        return {
            result: SetPrefixNonStringResult.InvalidGuildArgument,
            did_succeed: false,
        };
    } else if (is_string(local_prefix_entry) && prefix !== GLOBAL_PREFIX) {
        try {
            // log(`set_prefix: executing ALTER_SERVER_LISTING query...`)
            await client.query(ALTER_SERVER_LISTING, [prefix, server.id]);
            // Update prefix cache
            prefix_cache[server.id] = prefix;
        } catch (err) {
            log(
                `Unexpected database error: set_prefix failed when altering row to {'snowflake': ${server.id}, 'prefix': ${prefix}}. Message:`,
                LogType.Error,
            );
            log(err, LogType.Error);

            client.handle_release();

            return {
                result: SetPrefixNonStringResult.DatabaseOperationFailed,
                did_succeed: false,
            };
        }

        client.handle_release();

        return {
            result: local_prefix_entry,
            did_succeed: true,
        };
    }
    // The user is trying to go back from a local prefix to the global prefix
    else if (is_string(local_prefix_entry) && prefix === GLOBAL_PREFIX) {
        // Delete the entry, making the server use the global prefix as wished
        try {
            // log(`set_prefix: executing DELETE_SERVER_LISTING query...`)
            await client.query(DELETE_SERVER_LISTING, [server.id]);
            // Update prefix cache
            prefix_cache[server.id] = null;
        } catch (err) {
            log(
                `Unexpected database error: set_prefix failed when deleting row {'snowflake': ${server.id}, 'prefix': ${local_prefix_entry}}. Message:`,
                LogType.Error,
            );
            log(err, LogType.Error);

            client.handle_release();

            return {
                result: SetPrefixNonStringResult.DatabaseOperationFailed,
                did_succeed: false,
            };
        }

        client.handle_release();

        return {
            result: local_prefix_entry,
            did_succeed: true,
        };
    } else {
        // something is seriously wrong... lol
        log(
            "set_prefix: reached never-point else in chain of if-elses that should cover the possible set of circumstances. Returning object that indicates we did not succeed...",
            LogType.Error,
        );
        client.handle_release();
        return {
            result: GLOBAL_PREFIX,
            did_succeed: false,
        };
    }
};
