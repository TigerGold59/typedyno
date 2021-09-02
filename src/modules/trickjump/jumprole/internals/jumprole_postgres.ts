import { PoolInstance as Pool, PoolClient } from "../../../../pg_wrapper.js";
import { log, LogType } from "../../../../utilities/log.js";
import { Snowflake } from "../../../../utilities/permissions.js";
import { check_specification } from "../../../../utilities/runtime_typeguard.js";
import { query_failure, safe_serialize } from "../../../../utilities/typeutils.js";
import {
    check_jumprole_handle,
    compute_jumprole_hash,
    Jumprole,
    JumproleHandle,
    JumproleHandleType,
    JumproleSPECIFICATION,
    PartialJumproleSPECIFICATION,
    PGJumprole_to_Jumprole,
} from "./jumprole_type.js";

export const GET_JUMPROLE_BY_ID = `SELECT * FROM trickjump_jumps WHERE id=$1`;
export const GET_JUMPROLE_BY_NAME_AND_SERVER = `SELECT * FROM trickjump_jumps WHERE name=$1 AND server=$2`;
export const DELETE_JUMPROLE_BY_ID = `DELETE FROM trickjump_jumps WHERE id=$1`;
export const DELETE_JUMPROLE_BY_NAME_AND_SERVER = `DELETE FROM trickjump_jumps WHERE name=$1 AND server=$2`;
export const INSERT_JUMPROLE = `INSERT INTO trickjump_jumps (name, description, kingdom, location, jump_type, link, added_by, updated_at, server, hash) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`;

type Queryable = Pool | PoolClient;

export const enum ModifyJumproleResultType {
    InvalidJumproleHandle,
    NoneMatchJumproleHandle,
    InvalidQuery,
    NameTooLong,
    DescriptionTooLong,
    LocationTooLong,
    JumpTypeTooLong,
    LinkTooLong,
    InvalidPropertyChange,
    Success,
}

export interface ModifyJumproleResult {
    result_type: ModifyJumproleResultType;
    new: Jumprole | undefined;
}

export const get_jumprole = async (handle: JumproleHandle, queryable: Queryable): Promise<Jumprole | null> => {
    const type = check_jumprole_handle(handle);

    switch (type) {
        case JumproleHandleType.Invalid: {
            return null;
        }
        case JumproleHandleType.ID: {
            try {
                const result = await queryable.query(GET_JUMPROLE_BY_ID, [handle as number]);
                const row_result = result.rowCount;
                if (row_result > 1) {
                    // Somehow multiple jumps with the same ID, even though it is guaranteed by PostgreSQL to be unique
                    log(
                        `get_jumprole: received ${result.rows.length.toString()} rows when getting jumprole using ID ${handle.toString()}! Returning null...`,
                        LogType.Error,
                    );
                    return null;
                } else if (row_result === 1) {
                    // Expected case 1
                    return PGJumprole_to_Jumprole(result.rows[0]);
                } else {
                    // Expected case 2
                    // No jumps with ID
                    return null;
                }
            } catch (error) {
                log(`get_jumprole: unexpected error when getting jumprole with ID ${handle.toString()}. Returning null.`, LogType.Error);
                log(error, LogType.Error);
            }
            return null;
        }
        case JumproleHandleType.NameAndServer: {
            const name = (handle as [string, Snowflake])[0];
            const server_id = (handle as [string, Snowflake])[1];
            try {
                const result = await queryable.query(GET_JUMPROLE_BY_NAME_AND_SERVER, [name, server_id]);
                const row_result = result.rowCount;
                if (row_result > 1) {
                    // Somehow multiple jumps with the same name and server, even though they are guaranteed by PostgreSQL to be unique as a pair
                    log(
                        `get_jumprole: received ${result.rows.length.toString()} rows when getting jumprole using name ${name} and server ${server_id}! Returning null...`,
                        LogType.Error,
                    );
                    return null;
                } else if (row_result === 1) {
                    // Expected case 1
                    return PGJumprole_to_Jumprole(result.rows[0]);
                } else {
                    // Expected case 2
                    // No jumps with ID
                    return null;
                }
            } catch (error) {
                log(
                    `get_jumprole: unexpected error when getting jumprole using name ${name} and server ${server_id}! Returning null.`,
                    LogType.Error,
                );
                log(error, LogType.Error);
            }
            return null;
        }
    }
};

/**
 * Changes a `Jumprole` object in the PostgreSQL database.
 * @param handle The handle which identifies the `Jumprole` to change
 * @param merger An object which contains the keys to be changed and the values to be changed to.
 * @param queryable The `Pool` or `PoolClient` to make the query using
 * @returns `ModifyJumproleResult` indicating the result and what the new object is, if it succeeded
 */
export const modify_jumprole = async function (
    handle: JumproleHandle,
    merger: Partial<Jumprole>,
    queryable: Queryable,
): Promise<ModifyJumproleResult> {
    // Make sure we have a valid merger object.
    // It should only have properties that are listed in the Jumprole specification.
    const merger_result = check_specification<Partial<Jumprole>>(
        merger,
        "modify_jumprole",
        // Some properties may be left out if they don't need to be changed
        // So use a Specification for a Partial<Jumprole> object.
        // This will still not allow extraneous properties.
        PartialJumproleSPECIFICATION,
    );

    // If we didn't get a valid merger passed as an argument
    if (merger_result === false) {
        return {
            result_type: ModifyJumproleResultType.InvalidPropertyChange,
            new: undefined,
        };
    }

    // The keys to modify. Filter all of the keys of merger_result, which
    // comes out with all of the keys included in the Jumprole specification,
    // to just the ones which aren't undefined, i.e. they are being specified
    // and should be changed
    const change_keys = Object.keys(merger_result).filter(
        (prop_name: string) => merger_result[prop_name as keyof Jumprole] !== undefined && prop_name !== "hash" && prop_name !== "id",
    );

    // Useful for generating the substitution signatures, i.e. $2, in the
    // database query string
    const property_count = change_keys.length;

    const request_head = `UPDATE trickjump_jumps SET `;
    let request_tail: string;
    let query_tail: any[] = [];

    const type = check_jumprole_handle(handle);
    switch (type) {
        // Construct a database query based on the ID attribute of
        // the jumprole we're changing. This part of the query comes after
        // the part that sets the properties, so we have to add one to the
        // property count to get our substitution index, because all of the query
        // string shares one array of parameters to be substituted into the query
        case JumproleHandleType.ID: {
            let id = handle as number;
            request_tail = ` WHERE id=$${property_count + 2}`;
            query_tail.push(id);
            break;
        }
        case JumproleHandleType.NameAndServer: {
            let handle_tuple = handle as [string, string];
            request_tail = ` WHERE name=$${property_count + 2} AND server=$${property_count + 3}`;
            query_tail.push(...handle_tuple);
            break;
        }
        case JumproleHandleType.Invalid: {
            return {
                result_type: ModifyJumproleResultType.InvalidJumproleHandle,
                new: undefined,
            };
        }
        default: {
            return {
                result_type: ModifyJumproleResultType.InvalidJumproleHandle,
                new: undefined,
            };
        }
    }

    // Used to represent a property assignment that will be
    // filled out in the DB query string
    type QueryAssignment = [string, any];
    const stringify_assignment = function (assignment: QueryAssignment, index: number): string {
        return `${assignment[0]} = $${(index + 1).toString()}`;
    };

    let query_assignments: QueryAssignment[] = [];

    for (const change_key of change_keys) {
        switch (change_key) {
            // Never change IDs
            case "id": {
                continue;
            }
            // Make sure the values given for these properties
            // in the merger object have the correct length
            case "name": {
                let name = merger_result["name"] as string | null;
                if (name === null || name.length <= 100) {
                    query_assignments.push(["name", name]);
                } else {
                    log(`modify_jumprole: merger had property "name" with length longer than 100. Returning.`, LogType.Error);
                    return {
                        result_type: ModifyJumproleResultType.NameTooLong,
                        new: undefined,
                    };
                }
                break;
            }
            case "description": {
                let description = merger_result["description"] as string | null;
                if (description === null || description.length <= 1500) {
                    query_assignments.push(["description", description]);
                } else {
                    log(`modify_jumprole: merger had property "description" with length longer than 1500. Returning.`, LogType.Error);
                    return {
                        result_type: ModifyJumproleResultType.DescriptionTooLong,
                        new: undefined,
                    };
                }
                break;
            }
            case "location": {
                let location = merger_result["location"] as string | null;
                if (location === null || location.length <= 200) {
                    query_assignments.push(["location", location]);
                } else {
                    log(`modify_jumprole: merger had property "location" with length longer than 200. Returning.`, LogType.Error);
                    return {
                        result_type: ModifyJumproleResultType.InvalidQuery,
                        new: undefined,
                    };
                }
                break;
            }
            case "jump_type": {
                let jump_type = merger_result["jump_type"] as string | null;
                if (jump_type === null || jump_type.length <= 200) {
                    query_assignments.push(["jump_type", jump_type]);
                } else {
                    log(`modify_jumprole: merger had property "jump_type" with length longer than 200. Returning.`, LogType.Error);
                    return {
                        result_type: ModifyJumproleResultType.LocationTooLong,
                        new: undefined,
                    };
                }
                break;
            }
            case "link": {
                let link = merger_result["link"] as string | null;
                if (link === null || link.length <= 150) {
                    query_assignments.push(["link", link]);
                } else {
                    log(`modify_jumprole: merger had property "link" with length longer than 150. Returning.`, LogType.Error);
                    return {
                        result_type: ModifyJumproleResultType.LinkTooLong,
                        new: undefined,
                    };
                }
                break;
            }
            // Do not make a query assignment for the hash.
            // We will deal with it later.
            case "hash": {
                continue;
            }
            default: {
                query_assignments.push([change_key, merger_result[change_key as keyof Jumprole]]);
            }
        }
    }

    // Compute the hash of the new object for the database
    // Get the old object from the database first
    let target_obj = await get_jumprole(handle, queryable);
    if (target_obj === null) {
        return {
            result_type: ModifyJumproleResultType.NoneMatchJumproleHandle,
            new: undefined,
        };
    }

    // Assign the merger object to the old object, merging it and creating the new one
    const filtered_merger_result = ((): Partial<Jumprole> => {
        let res = {};
        for (const prop_name in merger_result) {
            // { ts-malfunction }
            // @ts-expect-error
            if (merger_result[prop_name] !== undefined) res[prop_name] = merger_result[prop_name];
        }
        return res;
    })();
    Object.assign(target_obj, filtered_merger_result);

    let hash = compute_jumprole_hash(target_obj);
    target_obj.hash = hash;

    // Add the correct hash to the query assignments
    query_assignments.push(["hash", hash]);

    // Create the part of the query string where we set the properties
    const request_mid = query_assignments.map((assignment, index) => stringify_assignment(assignment, index)).join(", ");
    const query_start = query_assignments.map(assignment => assignment[1]);

    const full_request = request_head + request_mid + request_tail;
    const full_query_params = query_start.concat(query_tail);
    try {
        await queryable.query(full_request, full_query_params);
        return {
            result_type: ModifyJumproleResultType.Success,
            new: target_obj,
        };
    } catch (err) {
        query_failure("modify_jumprole", full_request, full_query_params, err);
        return {
            result_type: ModifyJumproleResultType.InvalidQuery,
            new: undefined,
        };
    }
};

export const enum DeleteJumproleResult {
    NoneMatchJumproleHandle,
    InvalidJumproleHandle,
    Success,
    QueryFailed,
}

/**
 *
 * @param handle The handle that refers to the `Jumprole` to delete
 * @param queryable The `Pool` or `PoolClient` used to make the PostgreSQL database query
 * @returns `DeleteJumproleResult` indicating whether the function succeeded and if not, what the problem was
 */
export const delete_jumprole = async function (handle: JumproleHandle, queryable: Queryable): Promise<DeleteJumproleResult> {
    const type = check_jumprole_handle(handle);

    switch (type) {
        case JumproleHandleType.Invalid: {
            log(`delete_jumprole: invalid Jumprole handle received. Handle argument:`, LogType.Error);
            log(safe_serialize(handle), LogType.Error);
            return DeleteJumproleResult.InvalidJumproleHandle;
        }
        case JumproleHandleType.ID: {
            const previous = await get_jumprole(handle, queryable);

            if (previous === null) {
                return DeleteJumproleResult.NoneMatchJumproleHandle;
            } else {
                const query_string = DELETE_JUMPROLE_BY_ID;
                const query_params = [handle as number];
                try {
                    await queryable.query(query_string, query_params);
                    return DeleteJumproleResult.Success;
                } catch (err) {
                    query_failure("delete_jumprole", query_string, query_params, err);
                    return DeleteJumproleResult.QueryFailed;
                }
            }
        }
        case JumproleHandleType.NameAndServer: {
            const previous = await get_jumprole(handle, queryable);

            if (previous === null) {
                return DeleteJumproleResult.NoneMatchJumproleHandle;
            } else {
                const query_string = DELETE_JUMPROLE_BY_NAME_AND_SERVER;
                const query_params = handle as [string, Snowflake];

                try {
                    await queryable.query(query_string, query_params);
                    return DeleteJumproleResult.Success;
                } catch (err) {
                    query_failure("delete_jumprole", query_string, query_params, err);
                    return DeleteJumproleResult.QueryFailed;
                }
            }
        }
    }
};

export const enum CreateJumproleResult {
    InvalidJumproleObject,
    QueryFailed,
    Success,
    NameTooLong,
    DescriptionTooLong,
    LocationTooLong,
    JumpTypeTooLong,
    LinkTooLong,
    JumproleAlreadyExists,
}

/**
 * Adds a `Jumprole` object to the database, recomputing its hash and updating its `updated_at` value to the current date.
 * This means the `hash` and `updated_at` properties must still be provided, but they are not used.
 * @param jumprole The `Jumprole` object to add to the database.
 * @param queryable The `Pool` or `PoolClient` used to execute the PostgreSQL database query.
 * @returns `CreateJumproleResult` indicating either success or failure, and what the problem was if there was one.
 */
export const create_jumprole = async function (jumprole: Jumprole, queryable: Queryable): Promise<CreateJumproleResult> {
    let jumprole_result = check_specification(jumprole, "create_jumprole", JumproleSPECIFICATION);

    if (jumprole_result === false) {
        log(`create_jumprole: unexpectedly received non-Jumprole object. Returning appropriate error code.`, LogType.Error);
        log(`jumprole:`, LogType.Error);
        log(safe_serialize(jumprole), LogType.Error);
        return CreateJumproleResult.InvalidJumproleObject;
    }

    const existing = await get_jumprole([jumprole_result.name, jumprole_result.server], queryable);

    if (existing !== null) {
        return CreateJumproleResult.JumproleAlreadyExists;
    }

    if (jumprole_result.name.length > 100) {
        log(`create_jumprole: object had property "name" with length longer than 100. Returning.`, LogType.Error);
        return CreateJumproleResult.NameTooLong;
    }
    if (jumprole_result.description.length > 1500) {
        log(`create_jumprole: object had property "description" with length longer than 1500. Returning.`, LogType.Error);
        return CreateJumproleResult.DescriptionTooLong;
    }
    if (jumprole_result.location !== null && jumprole_result.location.length > 200) {
        log(`create_jumprole: object had property "location" with length longer than 200. Returning.`, LogType.Error);
        return CreateJumproleResult.LocationTooLong;
    }
    if (jumprole_result.jump_type !== null && jumprole_result.jump_type.length > 200) {
        log(`create_jumprole: object had property "jump_type" with length longer than 200. Returning.`, LogType.Error);
        return CreateJumproleResult.JumpTypeTooLong;
    }
    if (jumprole_result.link !== null && jumprole_result.link.length > 150) {
        log(`create_jumprole: object had property "link" with length longer than 150. Returning.`, LogType.Error);
        return CreateJumproleResult.LinkTooLong;
    }

    jumprole_result.updated_at = Math.round(Date.now() / 1000);
    jumprole_result.hash = compute_jumprole_hash(jumprole);

    const query_string = INSERT_JUMPROLE;
    const query_params = [
        jumprole_result.name,
        jumprole_result.description,
        jumprole_result.kingdom,
        jumprole_result.location,
        jumprole_result.jump_type,
        jumprole_result.link,
        jumprole_result.added_by,
        jumprole_result.updated_at,
        jumprole_result.server,
        jumprole_result.hash,
    ];

    try {
        await queryable.query(INSERT_JUMPROLE, query_params);
        return CreateJumproleResult.Success;
    } catch (err) {
        query_failure("create_jumprole", query_string, query_params, err);
        return CreateJumproleResult.QueryFailed;
    }
};
