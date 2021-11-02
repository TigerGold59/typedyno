import { Snowflake } from "discord.js";
import { type, validate_constructor } from "../../../../module_decorators.js";
import { MakesSingleRequest, Queryable, UsesClient, use_client } from "../../../../pg_wrapper.js";
import { log, LogType } from "../../../../utilities/log.js";
import { InferNormalizedType, log_stack } from "../../../../utilities/runtime_typeguard/runtime_typeguard.js";
import * as RT from "../../../../utilities/runtime_typeguard/standard_structures.js";
import { PositiveIntegerMax, query_failure } from "../../../../utilities/typeutils.js";
import { trickjump_entriesTableRow } from "../../table_types.js";
import { GetJumproleFailureType, GetJumproleResultType, Jumprole, JumproleStructure } from "../../jumprole/internals/jumprole_type.js";

const CHANGE_JUMP_HASH_BY_ID = "UPDATE trickjump_entries SET jump_hash=$1, updated_at=$2 WHERE id=$3";
const CHANGE_LINK_BY_ID = "UPDATE trickjump_entries SET link=$1, updated_at=$2 WHERE id=$3";
const GET_ENTRIES_BY_HOLDER_AND_SERVER = "SELECT * FROM trickjump_entries WHERE holder=$1 AND server=$2";
const CREATE_ENTRY =
    "INSERT INTO trickjump_entries (jump_id, jump_hash, holder, link, server, added_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)";
const GET_ENTRY_BY_JUMP_ID_AND_HOLDER = "SELECT * FROM trickjump_entries WHERE jump_id=$1 and holder=$2";
const DELETE_ENTRY_BY_ID = "DELETE FROM trickjump_entries WHERE id=$1";

export const EntryRT = {
    id: RT.UnsignedIntegerLike.validate(
        RT.RangeValidator(PositiveIntegerMax(2147483647), range_validated => {
            if (range_validated[0] === false) return `input was like an unsigned integer but it was less than 0, making it an invalid UInt4`;
            else return `input was like an unsigned integer but it was greater than or equal to 2147483647, making it an invalid UInt4`;
        }),
    ),
    jumprole: JumproleStructure,
    jump_hash: RT.Base64Hash,
    holder: RT.Snowflake,
    link: RT.Nullable(RT.string.length(PositiveIntegerMax(150))),
    server: RT.Snowflake,
    updated_at: RT.UInt4N,
    added_at: RT.UInt4N,
};

export type EntryTypes = { [P in keyof typeof EntryRT]: InferNormalizedType<typeof EntryRT[P]> };

export const enum ConfirmJumproleEntryResult {
    Confirmed = "Confirmed",
    QueryFailed = "QueryFailed",
}

export const enum SetJumproleEntryLinkResult {
    InvalidLink = "InvalidLink",
    Success = "Success",
    QueryFailed = "QueryFailed",
}

export const enum GetJumproleEntriesWithHolderResultType {
    Success = "Success",
    InvalidHolderSnowflake = "InvalidHolderSnowflake",
    InvalidServerSnowflake = "InvalidServerSnowflake",
    QueryFailed = "QueryFailed",
    GetJumproleFailed = "GetJumproleFailed",
}

export type GetJumproleEntriesWithHolderResultFailureType = Exclude<
    GetJumproleEntriesWithHolderResultType,
    GetJumproleEntriesWithHolderResultType.Success | GetJumproleEntriesWithHolderResultType.GetJumproleFailed
>;

export type GetJumproleEntriesWithHolderResult =
    | { type: GetJumproleEntriesWithHolderResultType.Success; values: JumproleEntry[] }
    | { type: GetJumproleEntriesWithHolderResultFailureType }
    | { type: GetJumproleEntriesWithHolderResultType.GetJumproleFailed; error: GetJumproleFailureType; jump_id: number };

export const enum RegisterJumproleEntryResultType {
    Success = "Success",
    JumproleEntryAlreadyExists = "JumproleEntryAlreadyExists",
    InvalidHolderSnowflake = "InvalidHolderSnowflake",
    InvalidJumprole = "InvalidJumprole",
    InvalidLink = "InvalidLink",
    QueryFailed = "QueryFailed",
}

export type RegisterJumproleEntryResultFailureType = Exclude<RegisterJumproleEntryResultType, RegisterJumproleEntryResultType.Success>;

export type RegisterJumproleEntryResult =
    | { type: RegisterJumproleEntryResultType.Success; entry: JumproleEntry }
    | { type: RegisterJumproleEntryResultFailureType };

export const enum GetJumproleEntryByJumproleAndHolderResultType {
    Success = "Success",
    InvalidHolderSnowflake = "InvalidHolderSnowflake",
    InvalidJumprole = "InvalidJumprole",
    NoneMatched = "NoneMatched",
    QueryFailed = "QueryFailed",
}

export type GetJumproleEntryByJumproleAndHolderFailureType = Exclude<
    GetJumproleEntryByJumproleAndHolderResultType,
    GetJumproleEntryByJumproleAndHolderResultType.Success
>;

export type GetJumproleEntryByJumproleAndHolderResult =
    | { type: GetJumproleEntryByJumproleAndHolderResultType.Success; entry: JumproleEntry }
    | { type: GetJumproleEntryByJumproleAndHolderFailureType };

export const enum JumproleEntryUpToDateResultType {
    UpToDate = "UpToDate",
    Outdated = "Outdated",
    QueryFailed = "QueryFailed",
    NoMatchingJumps = "NoMatchingJumps",
    GetJumproleFailed = "GetJumproleFailed",
}

export type JumproleEntryUpToDateNoActionType = Exclude<JumproleEntryUpToDateResultType, JumproleEntryUpToDateResultType.Outdated>;

export type JumproleEntryUpToDateResult =
    | { type: JumproleEntryUpToDateResultType.Outdated; last_updated: Date }
    | { type: JumproleEntryUpToDateNoActionType };

export type GetJumproleEntryFromRowResult = { type: GetJumproleResultType.Success; entry: JumproleEntry } | { type: GetJumproleFailureType };

export const enum FromQueryResultType {
    Success = "Success",
    QueryFailed = "QueryFailed",
    GetJumproleFailed = "GetJumproleFailed",
}

export type FromQueryFailureType = Exclude<FromQueryResultType, FromQueryResultType.Success | FromQueryResultType.GetJumproleFailed>;

export type FromQueryResult =
    | { type: FromQueryResultType.Success; values: JumproleEntry[] }
    | { type: FromQueryFailureType }
    | { type: FromQueryResultType.GetJumproleFailed; error: GetJumproleFailureType; jump_id: number };

export const enum DeleteJumproleEntryResult {
    Success,
    QueryFailed,
}

@validate_constructor
export class JumproleEntry {
    readonly id: EntryTypes["id"];
    readonly jumprole: EntryTypes["jumprole"];
    #_jump_hash: EntryTypes["jump_hash"];

    get jump_hash() {
        return this.#_jump_hash;
    }

    readonly holder: EntryTypes["holder"];
    #_link: EntryTypes["link"];

    get link() {
        return this.#_link;
    }

    readonly server: EntryTypes["server"];

    readonly added_at: EntryTypes["added_at"];

    #_updated_at: EntryTypes["updated_at"];

    get updated_at() {
        return this.#_updated_at;
    }

    constructor(
        @type(EntryRT.id) id: EntryTypes["id"],
        @type(EntryRT.jumprole) jumprole: EntryTypes["jumprole"],
        @type(EntryRT.jump_hash) jump_hash: EntryTypes["jump_hash"],
        @type(EntryRT.holder) holder: EntryTypes["holder"],
        @type(EntryRT.link) link: EntryTypes["link"],
        @type(EntryRT.server) server: EntryTypes["server"],
        @type(EntryRT.updated_at) updated_at: EntryTypes["updated_at"],
        @type(EntryRT.added_at) added_at: EntryTypes["added_at"],
    ) {
        this.id = id;
        this.jumprole = jumprole;
        this.#_jump_hash = jump_hash;
        this.holder = holder;
        this.#_link = link;
        this.server = server;
        this.#_updated_at = updated_at;
        this.added_at = added_at;
    }

    static readonly Get = async (
        holder: Snowflake,
        jumprole: Jumprole,
        queryable: Queryable<UsesClient>,
    ): Promise<GetJumproleEntryByJumproleAndHolderResult> => {
        let holder_result = EntryRT.holder.check(holder);
        if (holder_result.succeeded === false) {
            log(`JumproleEntry.Get: received invalid holder Snowflake`, LogType.Error);
            log_stack(holder_result);
            return { type: GetJumproleEntryByJumproleAndHolderResultType.InvalidHolderSnowflake };
        }
        if (jumprole instanceof Jumprole === false) {
            log(`JumproleEntry.Register: received invalid Jumprole object`, LogType.Error);
            return { type: GetJumproleEntryByJumproleAndHolderResultType.InvalidJumprole };
        }

        const client = await use_client(queryable, "JumproleEntry.Get");

        const query_string = GET_ENTRY_BY_JUMP_ID_AND_HOLDER;
        const query_params = [jumprole.id, holder];

        try {
            const result = await client.query<trickjump_entriesTableRow>(query_string, query_params);

            if (result.rows.length < 1) {
                return { type: GetJumproleEntryByJumproleAndHolderResultType.NoneMatched };
            } else {
                let row = result.rows[0];
                return {
                    type: GetJumproleEntryByJumproleAndHolderResultType.Success,
                    entry: new JumproleEntry(row.id, jumprole, row.jump_hash, row.holder, row.link, row.server, row.updated_at, row.added_at),
                };
            }
        } catch (err) {
            query_failure(`JumproleEntry.Get`, query_string, query_params, err);
            return { type: GetJumproleEntryByJumproleAndHolderResultType.QueryFailed };
        }
    };

    static readonly Register = async (
        holder: Snowflake,
        jumprole: Jumprole,
        link: string | null,
        queryable: Queryable<UsesClient>,
    ): Promise<RegisterJumproleEntryResult> => {
        let check_result = EntryRT.link.check(link);
        if (check_result.succeeded === false) {
            log(`JumproleEntry.Register: received invalid link`, LogType.Error);
            return { type: RegisterJumproleEntryResultType.InvalidLink };
        }

        const client = await use_client(queryable, "JumproleEntry.Register");

        let existing_result = await JumproleEntry.Get(holder, jumprole, client);

        switch (existing_result.type) {
            case GetJumproleEntryByJumproleAndHolderResultType.InvalidHolderSnowflake: {
                return { type: RegisterJumproleEntryResultType.InvalidHolderSnowflake };
            }
            case GetJumproleEntryByJumproleAndHolderResultType.InvalidJumprole: {
                return { type: RegisterJumproleEntryResultType.InvalidJumprole };
            }
            case GetJumproleEntryByJumproleAndHolderResultType.QueryFailed: {
                return { type: RegisterJumproleEntryResultType.QueryFailed };
            }
            case GetJumproleEntryByJumproleAndHolderResultType.Success: {
                return { type: RegisterJumproleEntryResultType.JumproleEntryAlreadyExists };
            }
            case GetJumproleEntryByJumproleAndHolderResultType.NoneMatched: {
                const query_string = CREATE_ENTRY;
                let current_date = Math.round(Date.now() / 1000);
                const query_params = [jumprole.id, jumprole.hash, holder, link, jumprole.server, current_date, current_date];

                try {
                    await client.query(query_string, query_params);

                    let new_jumprole_entry = await JumproleEntry.Get(holder, jumprole, client);

                    switch (new_jumprole_entry.type) {
                        case GetJumproleEntryByJumproleAndHolderResultType.InvalidHolderSnowflake: {
                            return { type: RegisterJumproleEntryResultType.InvalidHolderSnowflake };
                        }
                        case GetJumproleEntryByJumproleAndHolderResultType.InvalidJumprole: {
                            return { type: RegisterJumproleEntryResultType.InvalidJumprole };
                        }
                        case GetJumproleEntryByJumproleAndHolderResultType.QueryFailed: {
                            return { type: RegisterJumproleEntryResultType.QueryFailed };
                        }
                        case GetJumproleEntryByJumproleAndHolderResultType.Success: {
                            return { type: RegisterJumproleEntryResultType.Success, entry: new_jumprole_entry.entry };
                        }
                        case GetJumproleEntryByJumproleAndHolderResultType.NoneMatched: {
                            log(
                                `JumproleEntry.Register: JumproleEntry.Get returned GetJumproleEntryByJumproleAndHolderResultType.NoneMatched after successful query adding it to the database. Returning RegisterJumproleEntryResultType.QueryFailed`,
                                LogType.Error,
                            );
                            return { type: RegisterJumproleEntryResultType.QueryFailed };
                        }
                    }
                } catch (err) {
                    query_failure(`JumproleEntry.Register`, query_string, query_params, err);
                    return { type: RegisterJumproleEntryResultType.QueryFailed };
                }
            }
        }
    };

    static readonly FromQuery = async (query_string: string, query_params: unknown[], queryable: Queryable<UsesClient>): Promise<FromQueryResult> => {
        let client = await use_client(queryable, "JumproleEntry.FromQuery");
        try {
            let result = await client.query<trickjump_entriesTableRow>(query_string, query_params);

            let collected: JumproleEntry[] = [];

            for (const row of result.rows) {
                let entry = await JumproleEntry.FromRow(row, client);

                switch (entry.type) {
                    case GetJumproleResultType.Success: {
                        collected.push(entry.entry);
                        break;
                    }
                    default: {
                        return {
                            type: FromQueryResultType.GetJumproleFailed,
                            error: entry.type as GetJumproleFailureType,
                            jump_id: row.jump_id,
                        };
                    }
                }
            }

            return { type: FromQueryResultType.Success, values: collected };
        } catch (err) {
            query_failure(`JumproleEntry.WithHolderInServer`, query_string, query_params, err);
            return { type: FromQueryResultType.QueryFailed };
        }
    };

    static readonly FromRow = async (row: trickjump_entriesTableRow, queryable: Queryable<UsesClient>): Promise<GetJumproleEntryFromRowResult> => {
        let client = await use_client(queryable, "JumproleEntry.FromRow");

        const jumprole_result = await Jumprole.WithID(row.jump_id, client);

        const failed = { type: jumprole_result.type as GetJumproleFailureType };

        switch (jumprole_result.type) {
            case GetJumproleResultType.GetTierWithIDFailed: {
                log("JumproleEntry.FromRow Jumprole.WithID returned GetTierWithIDFailed. Returning.", LogType.Error);
                client.handle_release();
                return failed;
            }
            case GetJumproleResultType.NoneMatched: {
                log(
                    "JumproleEntry.FromRow: Jumprole.WithID returned NoneMatched even though we are getting it with its ID. A possible error has occurred. Returning.",
                    LogType.Error,
                );
                client.handle_release();
                return { type: jumprole_result.type };
            }
            case GetJumproleResultType.QueryFailed: {
                client.handle_release();
                return failed;
            }
            case GetJumproleResultType.Success: {
                client.handle_release();
                return {
                    type: GetJumproleResultType.Success,
                    entry: new JumproleEntry(
                        row.id,
                        jumprole_result.jumprole,
                        row.jump_hash,
                        row.holder,
                        row.link,
                        row.server,
                        row.updated_at,
                        row.added_at,
                    ),
                };
            }
            default: {
                log(`JumproleEntry.confirm: reached default case with GetJumproleResultType.${jumprole_result.type}. Returning.`, LogType.Error);
                client.handle_release();
                return failed;
            }
        }
    };

    static readonly WithHolderInServer = async (
        holder: Snowflake,
        server: Snowflake,
        queryable: Queryable<UsesClient>,
    ): Promise<GetJumproleEntriesWithHolderResult> => {
        let holder_result = EntryRT.holder.check(holder);
        if (holder_result.succeeded === false) {
            log(`JumproleEntry.WithHolderInServer: received invalid holder Snowflake`, LogType.Error);
            log_stack(holder_result);
            return { type: GetJumproleEntriesWithHolderResultType.InvalidHolderSnowflake };
        }

        let server_result = EntryRT.holder.check(holder);
        if (server_result.succeeded === false) {
            log(`JumproleEntry.WithHolderInServer: received invalid server Snowflake`, LogType.Error);
            log_stack(server_result);
            return { type: GetJumproleEntriesWithHolderResultType.InvalidServerSnowflake };
        }

        const query_string = GET_ENTRIES_BY_HOLDER_AND_SERVER;
        const query_params = [holder, server];
        const client = await use_client(queryable, "JumproleEntry.WithHolderInServer");

        try {
            let result = await client.query<trickjump_entriesTableRow>(query_string, query_params);

            let collected: JumproleEntry[] = [];

            for (const row of result.rows) {
                let entry = await JumproleEntry.FromRow(row, client);

                switch (entry.type) {
                    case GetJumproleResultType.Success: {
                        collected.push(entry.entry);
                        break;
                    }
                    default: {
                        client.handle_release();
                        return {
                            type: GetJumproleEntriesWithHolderResultType.GetJumproleFailed,
                            error: entry.type as GetJumproleFailureType,
                            jump_id: row.jump_id,
                        };
                    }
                }
            }

            client.handle_release();
            return { type: GetJumproleEntriesWithHolderResultType.Success, values: collected };
        } catch (err) {
            query_failure(`JumproleEntry.WithHolderInServer`, query_string, query_params, err);
            client.handle_release();
            return { type: GetJumproleEntriesWithHolderResultType.QueryFailed };
        }
    };

    async delete(queryable: Queryable<MakesSingleRequest>): Promise<DeleteJumproleEntryResult> {
        const query_string = DELETE_ENTRY_BY_ID;
        const query_params = [this.id];
        try {
            await queryable.query(query_string, query_params);
            return DeleteJumproleEntryResult.Success;
        } catch (err) {
            query_failure("JumproleEntry.delete", query_string, query_params, err);
            return DeleteJumproleEntryResult.QueryFailed;
        }
    }

    up_to_date(): JumproleEntryUpToDateResult {
        let jumprole = this.jumprole;

        if (jumprole.hash !== this.#_jump_hash) {
            return { type: JumproleEntryUpToDateResultType.Outdated, last_updated: new Date(jumprole.updated_at * 1000) };
        } else {
            return { type: JumproleEntryUpToDateResultType.UpToDate };
        }
    }

    async confirm(queryable: Queryable<MakesSingleRequest>): Promise<ConfirmJumproleEntryResult> {
        let client = await use_client(queryable, "JumproleEntry.confirm");

        let jumprole = this.jumprole;

        let new_updated_at = Math.round(Date.now() / 1000);

        const query_string = CHANGE_JUMP_HASH_BY_ID;
        const query_params = [jumprole.hash, new_updated_at, this.id];

        try {
            await client.query(query_string, query_params);
        } catch (err) {
            query_failure("JumproleEntry.confirm", query_string, query_params, err);
            return ConfirmJumproleEntryResult.QueryFailed;
        }
        this.#_jump_hash = jumprole.hash;
        this.#_updated_at = new_updated_at;
        return ConfirmJumproleEntryResult.Confirmed;
    }

    async set_link(link: EntryTypes["link"], queryable: Queryable<MakesSingleRequest>): Promise<SetJumproleEntryLinkResult> {
        let check_result = EntryRT.link.check(link);
        if (check_result.succeeded) {
            let new_updated_at = Math.round(Date.now() / 1000);

            const query_string = CHANGE_LINK_BY_ID;
            const query_params = [check_result.normalized, new_updated_at, this.id];

            try {
                await queryable.query(query_string, query_params);
            } catch (err) {
                query_failure("JumproleEntry.set_link", query_string, query_params, err);
                return SetJumproleEntryLinkResult.QueryFailed;
            }
            this.#_link = check_result.normalized;
            this.#_updated_at = new_updated_at;
            return SetJumproleEntryLinkResult.Success;
        } else {
            return SetJumproleEntryLinkResult.InvalidLink;
        }
    }
}
