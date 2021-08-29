import { Guild } from "discord.js";
import { GLOBAL_PREFIX } from "../main.js";
import { Pool, PoolInstance, PoolClient } from "../pg_wrapper.js";
import { is_string } from "../utilities/typeutils.js";
import { log, LogType } from "../utilities/log.js";

export let prefix_cache: Record<string, string | null> = {};

export const CREATE_SERVER_LISTING = "INSERT INTO prefixes (snowflake, prefix) VALUES ($1, $2)";
export const ALTER_SERVER_LISTING = "UPDATE prefixes SET prefix=$1 WHERE snowflake=$2";
export const DELETE_SERVER_LISTING = "DELETE FROM prefixes WHERE snowflake=$1";
export const GET_SERVER_LISTING = "SELECT (prefix) FROM prefixes WHERE snowflake=$1";

export const enum NoLocalPrefixEntryReason {
    NoDatabaseEntry = 0,
    InvalidGuildArgument = 1,
}

// Overload this function to provide cases for if we are doing successive queries or not.

/**
 * Uses the Heroku postgres server database to get the local prefix, or returns null if it doesn't exist
 * @param server The server to check the prefix for. If a server with no ID (?) is passed, we return null
 * @param pool The Heroku postgres server database connection pool to use when making database queries. Use this when not making a lot of requests in succession.
 */
export async function get_prefix_entry(server: Guild | undefined | null, pool: PoolInstance): Promise<string | NoLocalPrefixEntryReason>;
/**
 * Uses the Heroku postgres server database to get the local prefix, or returns null if it doesn't exist
 * @param server The server to check the prefix for. If a server with no ID (?) is passed, we return null
 * @param pool_client The Heroku postgres server database pool client to use when making database queries. The caller is responsible for its release.
 */
export async function get_prefix_entry(server: Guild | undefined | null, pool_client: PoolClient): Promise<string | NoLocalPrefixEntryReason>;

export async function get_prefix_entry(
    server: Guild | undefined | null,
    query_device: PoolInstance | PoolClient,
): Promise<string | NoLocalPrefixEntryReason> {
    if (server === undefined || server === null || "id" in server === false || is_string(server.id) === false) {
        return NoLocalPrefixEntryReason.InvalidGuildArgument;
    }
    // If we have a cached prefix for it, use that
    if (is_string(prefix_cache[server.id])) {
        // { ts-malfunction }
        // @ts-expect-error
        return prefix_cache[server.id];
    } else if (prefix_cache[server.id] === null) {
        return NoLocalPrefixEntryReason.NoDatabaseEntry;
    }
    // Otherwise, get it and update the cache
    else {
        // log(`get_prefix_entry: executing GET_SERVER_LISTING query...`)
        const prefixes = await query_device.query(GET_SERVER_LISTING, [Number(server.id)]);
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
            // { ts-malfunction }
            // @ts-expect-error
            return prefix_cache[server.id];
        }
    }
}

// Overload this function to provide cases for if we are doing successive queries or not.

/**
 * Uses the Heroku postgres server database to get the local prefix, or returns the global prefix if there is no entry
 * in the database
 * @param server Server to check the prefix for
 * @param pool The Heroku postgres server database connection pool to use when making PostgreSQL queries
 * @returns Prefix for the start of commands. Example: '%' in "%info" or "t1" in "t1info"
 */
export async function get_prefix(server: Guild, pool: PoolInstance): Promise<string>;
/**
 * Uses the Heroku postgres server database to get the local prefix, or returns the global prefix if there is no entry
 * in the database
 * @param server Server to check the prefix for
 * @param pool_client The Heroku postgres server database pool client to use when making PostgreSQL queries.
 * @returns Prefix for the start of commands. Example: '%' in "%info" or "t1" in "t1info"
 */
export async function get_prefix(server: Guild | undefined | null, pool_client: PoolInstance): Promise<string>;

export async function get_prefix(server: Guild | undefined | null, query_device: PoolInstance | PoolClient): Promise<string> {
    var local_prefix;

    if (query_device instanceof Pool) {
        local_prefix = await get_prefix_entry(server, query_device);
    } else {
        local_prefix = await get_prefix_entry(server, query_device as PoolClient);
    }

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
 * @param pool The Heroku postgres server database connection pool to use when making PostgreSQL queries.
 * @param prefix The prefix to set
 * @param pool_client The `PoolClient` to use to make the database requests. If left as null or undefined, a new `PoolClient` will be connected. If passed, the caller is responsible for its release.
 * @returns `SetPrefixResults`: `results` will be the previous prefix as a string if it replaced a locally specific one, or a more specific result in the form of `SetPrefixNonStringResult` otherwise; `did_succeed` will be `true` if `get_prefix` will return the prefix passed as an argument from now on and `false` otherwise.
 */
export const set_prefix = async function (server: Guild, pool: PoolInstance, prefix: string, pool_client?: PoolClient): Promise<SetPrefixResults> {
    let client: PoolClient;
    let did_use_passed_pool_client = true;

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

    // Easy, clean code for releasing if we created our own pool client, and leaving it be if we didn't.
    // IMPORTANT: ALWAYS CALL BEFORE FUNCTION RELEASES
    const conditionally_release_pool_client = function () {
        if (did_use_passed_pool_client === false) {
            client.release();
        }
    };

    // If they didn't pass a PoolClient, connect one.
    if (!pool_client || pool_client === undefined) {
        client = await pool.connect();
        did_use_passed_pool_client = false;
    } else {
        // Use the passed pool client
        client = pool_client;
    }

    // pool_client was just un-nulled up there! what are you talking about...
    // { ts-malfunction }
    // @ts-expect-error
    const local_prefix_entry = await get_prefix_entry(server, pool_client);

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
            await pool.query(CREATE_SERVER_LISTING, [Number(server.id), prefix]);
            // Update prefix cache
            prefix_cache[server.id] = prefix;
        } catch (err) {
            log(
                `Unexpected database error: set_prefix failed when creating new row {'snowflake': ${server.id}, 'prefix': ${prefix}}. Message:`,
                LogType.Error,
            );
            log(err, LogType.Error);

            conditionally_release_pool_client();

            return {
                result: SetPrefixNonStringResult.DatabaseOperationFailed,
                did_succeed: false,
            };
        }

        conditionally_release_pool_client();

        return {
            result: SetPrefixNonStringResult.CreatedNewRow,
            did_succeed: true,
        };
    } else if (local_prefix_entry === NoLocalPrefixEntryReason.InvalidGuildArgument) {
        conditionally_release_pool_client();

        return {
            result: SetPrefixNonStringResult.InvalidGuildArgument,
            did_succeed: false,
        };
    } else if (is_string(local_prefix_entry) && prefix !== GLOBAL_PREFIX) {
        try {
            // log(`set_prefix: executing ALTER_SERVER_LISTING query...`)
            await pool.query(ALTER_SERVER_LISTING, [prefix, Number(server.id)]);
            // Update prefix cache
            prefix_cache[server.id] = prefix;
        } catch (err) {
            log(
                `Unexpected database error: set_prefix failed when altering row to {'snowflake': ${server.id}, 'prefix': ${prefix}}. Message:`,
                LogType.Error,
            );
            log(err, LogType.Error);

            conditionally_release_pool_client();

            return {
                result: SetPrefixNonStringResult.DatabaseOperationFailed,
                did_succeed: false,
            };
        }

        conditionally_release_pool_client();

        return {
            result: local_prefix_entry,
            did_succeed: true,
        };
    }
    // The client is trying to go back from a local prefix to the global prefix
    else if (is_string(local_prefix_entry) && prefix === GLOBAL_PREFIX) {
        // Delete the entry, making the server use the global prefix as wished
        try {
            // log(`set_prefix: executing DELETE_SERVER_LISTING query...`)
            await pool.query(DELETE_SERVER_LISTING, [server.id]);
            // Update prefix cache
            prefix_cache[server.id] = null;
        } catch (err) {
            log(
                `Unexpected database error: set_prefix failed when deleting row {'snowflake': ${server.id}, 'prefix': ${local_prefix_entry}}. Message:`,
                LogType.Error,
            );
            log(err, LogType.Error);

            conditionally_release_pool_client();

            return {
                result: SetPrefixNonStringResult.DatabaseOperationFailed,
                did_succeed: false,
            };
        }

        conditionally_release_pool_client();

        return {
            result: local_prefix_entry,
            did_succeed: true,
        };
    } else {
        // something is seriously wrong... lol
        log(
            `set_prefix: reached never-point else in chain of if-elses that should cover the possible set of circumstances. Returning object that indicates we did not succeed...`,
            LogType.Error,
        );
        return {
            result: GLOBAL_PREFIX,
            did_succeed: false,
        };
    }
};
