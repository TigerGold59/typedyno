import { Snowflake } from "discord.js";
import { type, validate_constructor } from "../../../../module_decorators";
import { MakesSingleRequest, Queryable, UsesClient, use_client } from "../../../../pg_wrapper";
import { log, LogType } from "../../../../utilities/log";
import { InferNormalizedType, log_stack } from "../../../../utilities/runtime_typeguard/runtime_typeguard";
import * as RT from "../../../../utilities/runtime_typeguard/standard_structures";
import { PositiveIntegerMax, query_failure } from "../../../../utilities/typeutils";
import { trickjump_entriesTableRow } from "../../table_types";
import { GetJumproleResultType, Jumprole } from "./jumprole_type";

const CHANGE_JUMP_HASH_BY_ID = "UPDATE trickjump_entries SET jump_hash=$1, updated_at=$2 WHERE id=$3";
const CHANGE_LINK_BY_ID = "UPDATE trickjump_entries SET link=$1, updated_at=$2 WHERE id=$3";
const GET_ENTRIES_BY_HOLDER_AND_SERVER = "SELECT * FROM trickjump_entries WHERE holder=$1 AND server=$2";
const CREATE_ENTRY =
    "INSERT INTO trickjump_entries (jump_id, jump_hash, holder, link, server, added_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)";
const GET_ENTRY_BY_JUMP_ID_AND_HOLDER = "SELECT * FROM trickjump_entries WHERE jump_id=$1 and holder=$2";

export const EntryRT = {
    id: RT.UnsignedIntegerLike.validate(
        RT.RangeValidator(PositiveIntegerMax(2147483647), range_validated => {
            if (range_validated[0] === false) return `input was like an unsigned integer but it was less than 0, making it an invalid UInt4`;
            else return `input was like an unsigned integer but it was greater than or equal to 2147483647, making it an invalid UInt4`;
        }),
    ),
    jump_id: RT.UInt4Like,
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
    NoMatchingJumps = "NoMatchingJumps",
    GetJumproleFailed = "GetJumproleFailed",
    QueryFailed = "QueryFailed",
}

export const enum SetJumproleEntryLinkResult {
    InvalidLink = "InvalidLink",
    Succeeded = "Succeeded",
    QueryFailed = "QueryFailed",
}

export const enum GetJumproleEntriesWithHolderResultType {
    Succeeded = "Succeeded",
    InvalidHolderSnowflake = "InvalidHolderSnowflake",
    InvalidServerSnowflake = "InvalidServerSnowflake",
    QueryFailed = "QueryFailed",
}

export type GetJumproleEntriesWithHolderResultFailureType = Exclude<
    GetJumproleEntriesWithHolderResultType,
    GetJumproleEntriesWithHolderResultType.Succeeded
>;

export type GetJumproleEntriesWithHolderResult =
    | { type: GetJumproleEntriesWithHolderResultType.Succeeded; values: JumproleEntry[] }
    | { type: GetJumproleEntriesWithHolderResultFailureType };

export const enum RegisterJumproleEntryResultType {
    Succeeded = "Succeeded",
    JumproleEntryAlreadyExists = "JumproleEntryAlreadyExists",
    InvalidHolderSnowflake = "InvalidHolderSnowflake",
    InvalidJumprole = "InvalidJumprole",
    InvalidLink = "InvalidLink",
    QueryFailed = "QueryFailed",
}

export type RegisterJumproleEntryResultFailureType = Exclude<RegisterJumproleEntryResultType, RegisterJumproleEntryResultType.Succeeded>;

export type RegisterJumproleEntryResult =
    | { type: RegisterJumproleEntryResultType.Succeeded; entry: JumproleEntry }
    | { type: RegisterJumproleEntryResultFailureType };

export const enum GetJumproleEntryByJumproleAndHolderResultType {
    Succeeded = "Succeeded",
    InvalidHolderSnowflake = "InvalidHolderSnowflake",
    InvalidJumprole = "InvalidJumprole",
    NoneMatched = "NoneMatched",
    QueryFailed = "QueryFailed",
}

export type GetJumproleEntryByJumproleAndHolderFailureType = Exclude<
    GetJumproleEntryByJumproleAndHolderResultType,
    GetJumproleEntryByJumproleAndHolderResultType.Succeeded
>;

export type GetJumproleEntryByJumproleAndHolderResult =
    | { type: GetJumproleEntryByJumproleAndHolderResultType.Succeeded; entry: JumproleEntry }
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

@validate_constructor
export class JumproleEntry {
    readonly id: EntryTypes["id"];
    readonly jump_id: EntryTypes["jump_id"];
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
        @type(EntryRT.jump_id) jump_id: EntryTypes["jump_id"],
        @type(EntryRT.jump_hash) jump_hash: EntryTypes["jump_hash"],
        @type(EntryRT.holder) holder: EntryTypes["holder"],
        @type(EntryRT.link) link: EntryTypes["link"],
        @type(EntryRT.server) server: EntryTypes["server"],
        @type(EntryRT.updated_at) updated_at: EntryTypes["updated_at"],
        @type(EntryRT.added_at) added_at: EntryTypes["added_at"],
    ) {
        this.id = id;
        this.jump_id = jump_id;
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
        queryable: Queryable<MakesSingleRequest>,
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

        const query_string = GET_ENTRY_BY_JUMP_ID_AND_HOLDER;
        const query_params = [jumprole.id, holder];

        try {
            const result = await queryable.query<trickjump_entriesTableRow>(query_string, query_params);

            if (result.rows.length < 1) {
                return { type: GetJumproleEntryByJumproleAndHolderResultType.NoneMatched };
            } else {
                return { type: GetJumproleEntryByJumproleAndHolderResultType.Succeeded, entry: JumproleEntry.FromRow(result.rows[0]) };
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
            case GetJumproleEntryByJumproleAndHolderResultType.Succeeded: {
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
                        case GetJumproleEntryByJumproleAndHolderResultType.Succeeded: {
                            return { type: RegisterJumproleEntryResultType.Succeeded, entry: new_jumprole_entry.entry };
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

    static readonly FromRow = (row: trickjump_entriesTableRow): JumproleEntry => {
        return new JumproleEntry(row.id, row.jump_id, row.jump_hash, row.holder, row.link, row.server, row.updated_at, row.added_at);
    };

    static readonly WithHolderInServer = async (
        holder: Snowflake,
        server: Snowflake,
        queryable: Queryable<MakesSingleRequest>,
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

        try {
            let result = await queryable.query<trickjump_entriesTableRow>(query_string, query_params);

            return { type: GetJumproleEntriesWithHolderResultType.Succeeded, values: result.rows.map(JumproleEntry.FromRow) };
        } catch (err) {
            query_failure(`JumproleEntry.WithHolderInServer`, query_string, query_params, err);
            return { type: GetJumproleEntriesWithHolderResultType.QueryFailed };
        }
    };

    async up_to_date(queryable: Queryable<UsesClient>): Promise<JumproleEntryUpToDateResult> {
        const client = await use_client(queryable, "JumproleEntry.up_to_date");
        const jumprole_result = await Jumprole.WithID(this.jump_id, client);

        switch (jumprole_result.type) {
            case GetJumproleResultType.GetTierWithIDFailed: {
                log("JumproleEntry.up_to_date Jumprole.WithID returned GetTierWithIDFailed. Returning.", LogType.Error);
                client.handle_release();
                return { type: JumproleEntryUpToDateResultType.GetJumproleFailed };
            }
            case GetJumproleResultType.NoneMatched: {
                log(
                    "JumproleEntry.up_to_date: Jumprole.WithID returned NoneMatched even though we are getting it with its ID. A possible error has occurred. Returning.",
                    LogType.Error,
                );
                client.handle_release();
                return { type: JumproleEntryUpToDateResultType.GetJumproleFailed };
            }
            case GetJumproleResultType.QueryFailed: {
                client.handle_release();
                return { type: JumproleEntryUpToDateResultType.QueryFailed };
            }
            case GetJumproleResultType.Success: {
                let jumprole = jumprole_result.jumprole;

                if (jumprole.hash !== this.#_jump_hash) {
                    return { type: JumproleEntryUpToDateResultType.Outdated, last_updated: new Date(jumprole.updated_at * 1000) };
                } else {
                    return { type: JumproleEntryUpToDateResultType.UpToDate };
                }
            }
            default: {
                log(`JumproleEntry.up_to_date: reached default case with GetJumproleResultType.${jumprole_result.type}. Returning.`, LogType.Error);
                client.handle_release();
                return { type: JumproleEntryUpToDateResultType.GetJumproleFailed };
            }
        }
    }

    async confirm(queryable: Queryable<UsesClient>): Promise<ConfirmJumproleEntryResult> {
        const client = await use_client(queryable, "JumproleEntry.confirm");
        const jumprole_result = await Jumprole.WithID(this.jump_id, client);

        switch (jumprole_result.type) {
            case GetJumproleResultType.GetTierWithIDFailed: {
                log("JumproleEntry.confirm: Jumprole.WithID returned GetTierWithIDFailed. Returning.", LogType.Error);
                client.handle_release();
                return ConfirmJumproleEntryResult.GetJumproleFailed;
            }
            case GetJumproleResultType.NoneMatched: {
                log(
                    "JumproleEntry.confirm: Jumprole.WithID returned NoneMatched even though we are getting it with its ID. A possible error has occurred. Returning.",
                    LogType.Error,
                );
                client.handle_release();
                return ConfirmJumproleEntryResult.NoMatchingJumps;
            }
            case GetJumproleResultType.QueryFailed: {
                client.handle_release();
                return ConfirmJumproleEntryResult.QueryFailed;
            }
            case GetJumproleResultType.Success: {
                let jumprole = jumprole_result.jumprole;

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
            default: {
                log(`JumproleEntry.confirm: reached default case with GetJumproleResultType.${jumprole_result.type}. Returning.`, LogType.Error);
                client.handle_release();
                return ConfirmJumproleEntryResult.GetJumproleFailed;
            }
        }
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
            return SetJumproleEntryLinkResult.Succeeded;
        } else {
            return SetJumproleEntryLinkResult.InvalidLink;
        }
    }
}
