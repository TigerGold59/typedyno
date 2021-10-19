import { CONFIG } from "./config.js";
import { Message } from "discord.js";
import { Queryable, MakesSingleRequest, use_client, UsesClient } from "./pg_wrapper.js";
import { LogType, log } from "./utilities/log.js";
import { Snowflake, is_valid_Snowflake } from "./utilities/permissions.js";
import { is_boolean, is_text_channel, query_failure } from "./utilities/typeutils.js";
import { ServerQueryResults } from "./postgresql/table_types.js";

const DESIGNATE_INSERT_USER = "INSERT INTO servers (snowflake, full_access, server) VALUES ($1, $2, $3)";
const DESIGNATE_CHANGE_USER_STATUS = "UPDATE servers SET full_access=$1 WHERE snowflake=$2 AND server=$3";
const DESIGNATE_REMOVE_USER = "DELETE FROM servers WHERE snowflake=$1 AND server=$2";
const DESIGNATE_USER_EXISTS = "SELECT (full_access) FROM SERVERS WHERE snowflake=$1 AND server=$2";

export interface DesignateHandle {
    user: Snowflake;
    server: Snowflake;
}

export const is_valid_DesignateHandle = (handle?: unknown): handle is DesignateHandle => {
    return (
        // @ts-expect-error the in operator doesn't throw an error when it returns false. lol
        typeof handle === "object" && "user" in handle && "server" in handle && is_valid_Snowflake(handle.user) && is_valid_Snowflake(handle.server)
    );
};

export const create_designate_handle = (user_id: Snowflake, message: Message): DesignateHandle => {
    if (is_text_channel(message)) return { user: user_id, server: message.guild.id };
    else throw new TypeError(`create_designate_handle: invalid message object (type ${typeof message})`);
};

export const enum DesignateUserStatus {
    InvalidHandle = 0,
    UserNotInRegistry,
    NoFullAccess,
    FullAccess,
    UserIsAdmin,
}

/**
 * Gets the user's current designate status in the server context specified by the handle
 * @param handle The `DesignateHandle` of the user to check
 * @param queryable A `PoolInstance` or `PoolClient`
 * @returns `DesignateUserStatus`
 */
export const designate_user_status = async (handle: DesignateHandle, queryable: Queryable<MakesSingleRequest>): Promise<DesignateUserStatus> => {
    if (is_valid_DesignateHandle(handle) === false) return DesignateUserStatus.InvalidHandle;

    if (CONFIG.admins.includes(handle.user)) return DesignateUserStatus.UserIsAdmin;

    const res = (await queryable.query(DESIGNATE_USER_EXISTS, [handle.user, handle.server])) as ServerQueryResults;

    if (res.rowCount < 1) return DesignateUserStatus.UserNotInRegistry;
    else return res.rows[0].full_access ? DesignateUserStatus.FullAccess : DesignateUserStatus.NoFullAccess;
};

/**
 *
 * @param handle The `DesignateHandle` of the user to change
 * @param allow_full_access Whether the user to change should be granted permission to designate others
 * @param queryable A `PoolInstance` or `PoolClient`
 * @returns `DesignateUserStatus` indicating the user's new status, or `null` if there was a query failure
 */
export const designate_set_user = async (
    handle: DesignateHandle,
    allow_full_access: boolean,
    queryable: Queryable<UsesClient>,
): Promise<DesignateUserStatus | null> => {
    if (CONFIG.admins.includes(handle.user)) return DesignateUserStatus.UserIsAdmin;

    if (is_boolean(allow_full_access) === false) return DesignateUserStatus.InvalidHandle;
    const client = await use_client(queryable);

    const status = await designate_user_status(handle, client);

    switch (status) {
        case DesignateUserStatus.InvalidHandle: {
            return DesignateUserStatus.InvalidHandle;
        }
        case DesignateUserStatus.UserNotInRegistry: {
            const query_params = [allow_full_access, handle.user, handle.server];
            try {
                await client.query(DESIGNATE_INSERT_USER, query_params);
                return await designate_user_status(handle, client);
            } catch (err) {
                log(`designate_set_user: UserNotInRegistry case - query unexpectedly failed`, LogType.Error);
                query_failure("designate_set_user", DESIGNATE_INSERT_USER, query_params, err);
                return null;
            } finally {
                client.handle_release();
            }
        }
        default: {
            const query_params = [allow_full_access, handle.user, handle.server];
            try {
                await client.query(DESIGNATE_CHANGE_USER_STATUS, query_params);
                return await designate_user_status(handle, client);
            } catch (err) {
                log(`designate_set_user: default case - query unexpectedly failed`, LogType.Error);
                query_failure("designate_set_user", DESIGNATE_CHANGE_USER_STATUS, query_params, err);
                return null;
            } finally {
                client.handle_release();
            }
        }
    }
};

export const enum DesignateRemoveUserResult {
    UserAlreadyNotInRegistry,
    UserRemoved,
    UserIsAdmin,
    QueryError,
    InvalidHandle,
}

export const designate_remove_user = async (handle: DesignateHandle, queryable: Queryable<UsesClient>): Promise<DesignateRemoveUserResult> => {
    if (CONFIG.admins.includes(handle.user)) return DesignateRemoveUserResult.UserIsAdmin;

    const client = await use_client(queryable);
    const status = await designate_user_status(handle, client);

    switch (status) {
        case DesignateUserStatus.UserNotInRegistry: {
            return DesignateRemoveUserResult.UserAlreadyNotInRegistry;
        }
        case DesignateUserStatus.InvalidHandle: {
            return DesignateRemoveUserResult.InvalidHandle;
        }
        default: {
            const query_params = [handle.user, handle.server];
            try {
                await client.query(DESIGNATE_REMOVE_USER, query_params);
                client.handle_release();
                return DesignateRemoveUserResult.UserRemoved;
            } catch (err) {
                client.handle_release();
                log(`designate_remove_user: default case - query unexpectedly failed`, LogType.Error);
                query_failure("designate_remove_user", DESIGNATE_CHANGE_USER_STATUS, query_params, err);
                return DesignateRemoveUserResult.QueryError;
            }
        }
    }
};
