import { validate_constructor, type } from "../../../../module_decorators.js";
import { MakesSingleRequest, Queryable, UsesClient, use_client } from "../../../../pg_wrapper.js";
import { log, LogType } from "../../../../utilities/log.js";
import { Snowflake } from "../../../../utilities/permissions.js";
import { InferNormalizedType, log_stack } from "../../../../utilities/runtime_typeguard/runtime_typeguard.js";
import * as RT from "../../../../utilities/runtime_typeguard/standard_structures.js";
import { InclusiveRange, is_string, query_failure } from "../../../../utilities/typeutils.js";
import { trickjump_tiersTableRow } from "../../table_types.js";

const GET_TIER_BY_NAME_AND_SERVER = "SELECT * FROM trickjump_tiers WHERE name=$1 AND server=$2";
const GET_TIER_BY_ID = "SELECT * FROM trickjump_tiers WHERE id=$1";
const INSERT_TIER = "INSERT INTO trickjump_tiers (name, ordinal, server) VALUES ($1, $2, $3);";
const DELETE_TIER = "DELETE FROM trickjump_tiers WHERE id=$1";

export const enum GetTierResultType {
    InvalidID = "InvalidID",
    InvalidName = "InvalidName",
    InvalidServer = "InvalidServer",
    NoMatchingEntries = "NoMatchingEntries",
    QueryFailed = "QueryFailed",
    Success = "Success",
}

export type GetTierByNameAndServerResult =
    | { result: GetTierResultType.Success; tier: Tier }
    | { result: Exclude<GetTierResultType, GetTierResultType.Success | GetTierResultType.InvalidID> };
export type GetTierByIDResult =
    | { result: GetTierResultType.Success; tier: Tier }
    | { result: Exclude<GetTierResultType, GetTierResultType.Success | GetTierResultType.InvalidName | GetTierResultType.InvalidServer> };
export type GetTierResult = { result: GetTierResultType.Success; tier: Tier } | { result: Exclude<GetTierResultType, GetTierResultType.Success> };

export const enum CreateTierResultType {
    InvalidName = "InvalidName",
    InvalidServer = "InvalidServer",
    InvalidOrdinal = "InvalidOrdinal",
    TierAlreadyExists = "TierAlreadyExists",
    GetTierFailed = "GetTierFailed",
    QueryFailed = "QueryFailed",
    Success = "Success",
}

export type CreateTierResult =
    | { result: CreateTierResultType.Success; tier: Tier }
    | { result: Exclude<CreateTierResultType, CreateTierResultType.Success | CreateTierResultType.TierAlreadyExists> }
    | { result: CreateTierResultType.TierAlreadyExists; existing: Tier };

export const TierModifyStructure = RT.object({
    name: RT.Optional(RT.string.length(InclusiveRange(1, 100))),
    ordinal: RT.Optional(RT.UInt4N),
});

export type TierModify = InferNormalizedType<typeof TierModifyStructure>;

export const enum ModifyTierResultType {
    QueryFailed = "QueryFailed",
    Success = "Success",
    InvalidPropertyChange = "InvalidPropertyChange",
}

// export type ModifyTierResult = { result: Exclude<ModifyTierResultType, ModifyTierResultType.Success> } | { result: ModifyTierResultType.Success };

export const enum DeleteTierResultType {
    QueryFailed = "QueryFailed",
    Success = "Success",
}

@validate_constructor
export class Tier {
    readonly id: number;
    readonly server: Snowflake;
    #_ordinal: number;
    #_name: string;

    get ordinal(): number {
        return this.#_ordinal;
    }

    get name(): string {
        return this.#_name;
    }

    constructor(
        @type(RT.Snowflake) id: number,
        @type(RT.Snowflake) server: Snowflake,
        @type(RT.UInt4N) ordinal: number,
        @type(RT.string.length(InclusiveRange(1, 100))) name: string,
    ) {
        this.id = id;
        this.server = server;
        this.#_ordinal = ordinal;
        this.#_name = name;
    }

    static readonly Get = async (
        name: string,
        server: Snowflake,
        queryable: Queryable<MakesSingleRequest>,
    ): Promise<GetTierByNameAndServerResult> => {
        const name_result = RT.string.length(InclusiveRange(1, 100)).check(name);
        if (name_result.succeeded === false) {
            log_stack(name_result, "Tier.Get name");
            return { result: GetTierResultType.InvalidName };
        }
        const server_result = RT.Snowflake.check(server);
        if (server_result.succeeded === false) {
            log_stack(server_result, "Tier.Get server");
            return { result: GetTierResultType.InvalidServer };
        }
        const query_string = GET_TIER_BY_NAME_AND_SERVER;
        const query_params = [name_result.normalized, server_result.normalized];
        try {
            const query_result = await queryable.query<trickjump_tiersTableRow>(query_string, query_params);

            if (query_result.rows.length < 1) {
                return { result: GetTierResultType.NoMatchingEntries };
            } else if (query_result.rows.length > 1) {
                query_failure("Tier.Get", query_string, query_params, "rows.length was greater than one");
                return { result: GetTierResultType.QueryFailed };
            } else {
                const tier_data = query_result.rows[0];
                return { result: GetTierResultType.Success, tier: new Tier(tier_data.id, tier_data.server, tier_data.ordinal, tier_data.name) };
            }
        } catch (err) {
            query_failure("Tier.Get", query_string, query_params, err);
            return { result: GetTierResultType.QueryFailed };
        }
    };

    static readonly WithID = async (id: number, queryable: Queryable<MakesSingleRequest>): Promise<GetTierByIDResult> => {
        const id_result = RT.UInt4N.check(id);
        if (id_result.succeeded === false) {
            log_stack(id_result, "Tier.WithID id");
            return { result: GetTierResultType.InvalidID };
        }
        const query_string = GET_TIER_BY_ID;
        const query_params = [id_result.normalized];
        try {
            const query_result = await queryable.query<trickjump_tiersTableRow>(query_string, query_params);

            if (query_result.rows.length < 1) {
                return { result: GetTierResultType.NoMatchingEntries };
            } else if (query_result.rows.length > 1) {
                query_failure("Tier.WithID", query_string, query_params, "rows.length was greater than one");
                return { result: GetTierResultType.QueryFailed };
            } else {
                const tier_data = query_result.rows[0];
                return { result: GetTierResultType.Success, tier: new Tier(tier_data.id, tier_data.server, tier_data.ordinal, tier_data.name) };
            }
        } catch (err) {
            query_failure("Tier.WithID", query_string, query_params, err);
            return { result: GetTierResultType.QueryFailed };
        }
    };

    static readonly Create = async (
        server: Snowflake,
        ordinal: number,
        name: string,
        queryable: Queryable<UsesClient>,
    ): Promise<CreateTierResult> => {
        const name_result = RT.string.length(InclusiveRange(1, 100)).check(name);
        if (name_result.succeeded === false) {
            log_stack(name_result, "Tier.Create name");
            return { result: CreateTierResultType.InvalidName };
        }
        const server_result = RT.Snowflake.check(server);
        if (server_result.succeeded === false) {
            log_stack(server_result, "Tier.Create server");
            return { result: CreateTierResultType.InvalidServer };
        }
        const ordinal_result = RT.UInt4N.check(ordinal);
        if (ordinal_result.succeeded === false) {
            log_stack(ordinal_result, "Tier.Create ordinal");
            return { result: CreateTierResultType.InvalidOrdinal };
        }

        const client = await use_client(queryable);

        const before = await Tier.Get(name_result.normalized, server_result.normalized, client);

        switch (before.result) {
            case GetTierResultType.InvalidName:
            case GetTierResultType.InvalidServer:
            case GetTierResultType.QueryFailed: {
                log(`Tier.Create: pre-insert Tier.Get failed with error GetTierResultType.${before.result}. See previous logs.`, LogType.Error);
                client.handle_release();
                return { result: CreateTierResultType.GetTierFailed };
            }
            case GetTierResultType.Success: {
                client.handle_release();
                return { result: CreateTierResultType.TierAlreadyExists, existing: before.tier };
            }
            case GetTierResultType.NoMatchingEntries: {
                const query_string = INSERT_TIER;
                const query_params = [name_result.normalized, ordinal_result.normalized, server_result.normalized];

                try {
                    await client.query(query_string, query_params);
                } catch (err) {
                    query_failure("Tier.Create", query_string, query_params, err);
                    client.handle_release();
                    return { result: CreateTierResultType.QueryFailed };
                }

                const new_tier = await Tier.Get(name_result.normalized, server_result.normalized, client);

                client.handle_release();

                switch (new_tier.result) {
                    case GetTierResultType.InvalidName:
                    case GetTierResultType.InvalidServer:
                    case GetTierResultType.QueryFailed: {
                        log(
                            `Tier.Create: post-insert Tier.Get failed with error GetTierResultType.${before.result}. See previous logs.`,
                            LogType.Error,
                        );
                        return { result: CreateTierResultType.GetTierFailed };
                    }
                    case GetTierResultType.NoMatchingEntries: {
                        query_failure(
                            "Tier.Create",
                            query_string,
                            query_params,
                            `post-insert Tier.Get returned GetTierResultType.${new_tier.result} (insert query failed)`,
                        );
                        return { result: CreateTierResultType.QueryFailed };
                    }
                    case GetTierResultType.Success: {
                        return { result: CreateTierResultType.Success, tier: new_tier.tier };
                    }
                }
            }
        }
    };

    async update(merger: TierModify, queryable: Queryable<MakesSingleRequest>): Promise<ModifyTierResultType> {
        if (Object.keys(merger).length === 0) return ModifyTierResultType.Success;

        const merger_result = TierModifyStructure.check(merger);

        // If we didn't get a valid merger passed as an argument
        if (merger_result.succeeded === false) {
            log_stack(merger_result, "Tier.update");
            return ModifyTierResultType.InvalidPropertyChange;
        }

        const new_merger = merger_result.normalized;

        const assignments: [string, string][] = [];
        const query_params = [] as (string | number)[];

        const name_assigned = is_string(new_merger.name);
        const ordinal_assigned = is_string(new_merger.ordinal);
        if (name_assigned) {
            assignments.push(["name", "1"]);
            query_params.push(new_merger.name as string);
        }
        if (ordinal_assigned) {
            assignments.push(["ordinal", (assignments.length + 1).toString()]);
            query_params.push(new_merger.ordinal as number);
        }
        const assignment_string = assignments.map(val => `${val[0]}=${val[1]}`).join(", ");
        const query_string = `UPDATE trickjump_tiers SET ${assignment_string} WHERE id=${(assignments.length + 1).toString()}`;
        try {
            await queryable.query(query_string, query_params);

            if (name_assigned) {
                this.#_name = new_merger.name as string;
            }

            if (ordinal_assigned) {
                this.#_ordinal = new_merger.ordinal as number;
            }

            return ModifyTierResultType.Success;
        } catch (err) {
            query_failure("Tier.update", query_string, query_params, err);
            return ModifyTierResultType.QueryFailed;
        }
    }

    async delete(queryable: Queryable<MakesSingleRequest>): Promise<DeleteTierResultType> {
        const query_string = DELETE_TIER;
        const query_params = [this.id];
        try {
            await queryable.query(query_string, query_params);
            return DeleteTierResultType.Success;
        } catch (err) {
            query_failure("Tier.delete", query_string, query_params, err);
            return DeleteTierResultType.QueryFailed;
        }
    }
}

export const TierStructure = RT.InstanceOf<Tier, [number, Snowflake, number, string], typeof Tier>(Tier);
