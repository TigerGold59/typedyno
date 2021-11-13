import { BinaryLike, createHash } from "node:crypto";
import { DebugLogType, log, LogType } from "../../../../utilities/log.js";
import {
    InferNormalizedType,
    log_stack,
    Structure,
    StructureValidationFailedReason,
    TransformResult,
} from "../../../../utilities/runtime_typeguard/runtime_typeguard.js";
import * as RT from "../../../../utilities/runtime_typeguard/standard_structures.js";
import { is_valid_Snowflake, Snowflake } from "../../../../utilities/permissions.js";
import { is_number, is_string, PositiveIntegerMax, query_failure, safe_serialize, to_num_and_lower } from "../../../../utilities/typeutils.js";
import { type, validate_constructor } from "../../../../module_decorators.js";
import { Queryable, UsesClient, use_client, MakesSingleRequest } from "../../../../pg_wrapper.js";
import { trickjump_jumpsBulkTableRow, trickjump_jumpsQueryResults, trickjump_jumpsTableRow } from "../../table_types.js";
import { GetTierFailureType, GetTierResultType, Tier, TierStructure } from "../../tier/internals/tier_type.js";

export const GET_JUMPROLE_BY_ID = "SELECT * FROM trickjump_jumps WHERE id=$1";
export const GET_JUMPROLE_BY_NAME_AND_SERVER = "SELECT * FROM trickjump_jumps WHERE name=$1 AND server=$2";
export const DELETE_JUMPROLE_BY_ID = "DELETE FROM trickjump_jumps WHERE id=$1";
export const INSERT_JUMPROLE =
    "INSERT INTO trickjump_jumps (tier_id, name, display_name, description, kingdom, location, jump_type, link, added_by, updated_at, server, hash) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)";
export const BULK_JUMPROLE_QUERY_FIELDS = "trickjump_jumps.*, row_to_json(trickjump_tiers.*) as tier";
export const BULK_JUMPROLE_JOIN = `INNER JOIN trickjump_tiers ON trickjump_jumps.tier_id=trickjump_tiers.id`;
export const GET_JUMPROLES_IN_BULK_BY_SERVER = `SELECT ${BULK_JUMPROLE_QUERY_FIELDS} FROM trickjump_jumps ${BULK_JUMPROLE_JOIN} WHERE trickjump_jumps.server=$1 ORDER BY trickjump_jumps.updated_at`;

const TWITTER_REGEX =
    /^\s*https:\/\/(?:(?:www\.)|(?:mobile\.))?twitter\.com\/(?<tag>[a-zA-Z0-9_]{1,16})\/status\/(?<id>[0-9]{3,35})(?:\?(?:[a-z]=[a-zA-Z0-9-_]+)(?:\&(?:[a-z]=[a-zA-Z0-9-_]+))*)?\/?\s*$/i;

export const TwitterLink = new Structure<string>(
    "Twitter link",
    (input: unknown): TransformResult<string> => {
        if (is_string(input)) {
            let matches = TWITTER_REGEX.exec(input);
            if (matches === null) {
                return {
                    succeeded: false,
                    error: StructureValidationFailedReason.InvalidValue,
                    information: [
                        `link to Twitter video was a string but it didn't fit the following format: \`https://(mobile.)twitter.com/<username>/status/<tweet snowflake>\``,
                    ],
                };
            } else {
                let groups = matches.groups as { tag: string; id: string };
                return { succeeded: true, result: `https://twitter.com/${groups.tag}/status/${groups.id}` };
            }
        } else {
            return {
                succeeded: false,
                error: StructureValidationFailedReason.IncorrectType,
                information: [`input was ${typeof input} (expected string)`],
            };
        }
    },
    <Input extends string>(result: Input): TransformResult<Input> => {
        let matches = TWITTER_REGEX.exec(result);
        if (matches === null) {
            return {
                succeeded: false,
                error: StructureValidationFailedReason.InvalidValue,
                information: [
                    `link to Twitter video was a string but it didn't fit the following format: \`https://(mobile.)twitter.com/<username>/status/<tweet snowflake>\``,
                ],
            };
        } else {
            return { succeeded: true, result: result };
        }
    },
);

export const YOUTUBE_REGEX = /https:\/\/www\.youtube\.com\/watch\?v=(?<tag>[a-zA-Z0-9_=]{1,16})\/?/i;

export const YouTubeLink = new Structure<string>(
    "YouTube link",
    (input: unknown): TransformResult<string> => {
        if (is_string(input)) {
            let matches = YOUTUBE_REGEX.exec(input);
            if (matches === null) {
                return {
                    succeeded: false,
                    error: StructureValidationFailedReason.InvalidValue,
                    information: [
                        `link to YouTube video was a string but it didn't fit the following format: \`https://www.youtube.com/watch?v=<video ID>\``,
                    ],
                };
            } else {
                let groups = matches.groups as { tag: string };
                return { succeeded: true, result: `https://www.youtube.com/watch?v=${groups.tag}` };
            }
        } else {
            return {
                succeeded: false,
                error: StructureValidationFailedReason.IncorrectType,
                information: [`input was ${typeof input} (expected string)`],
            };
        }
    },
    <Input extends string>(result: Input): TransformResult<Input> => {
        let matches = YOUTUBE_REGEX.exec(result);
        if (matches === null) {
            return {
                succeeded: false,
                error: StructureValidationFailedReason.InvalidValue,
                information: [
                    `link to YouTube video was a string but it didn't fit the following format: \`https://www.youtube.com/watch?v=<video ID>\``,
                ],
            };
        } else {
            return { succeeded: true, result: result };
        }
    },
);

export const VideoLink = RT.Union(TwitterLink, YouTubeLink, (x): x is string => TWITTER_REGEX.test(x));

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

export const KingdomString = RT.string
    .validate(<Input extends string>(result: Input): TransformResult<Input> => {
        if (KINGDOM_NAMES_LOWERCASE.includes(result.toLowerCase() as typeof KINGDOM_NAMES_LOWERCASE[number])) {
            return { succeeded: true, result: result };
        } else {
            return {
                succeeded: false,
                error: StructureValidationFailedReason.InvalidValue,
                information: [`input was a string but it wasn't a kingdom name. Valid kingdom names are: ${KINGDOM_NAMES.join()}.`],
            };
        }
    })
    .with_choices(KINGDOM_NAMES as unknown as string[]);

export type Lowercased<List extends readonly string[]> = {
    [Key in keyof List]: Lowercase<List[Key] & string>;
};

export const KINGDOM_NAMES_LOWERCASE = KINGDOM_NAMES.map(name => name.toLowerCase()) as unknown as Lowercased<typeof KINGDOM_NAMES>;

export const KingdomNameToKingdom = (str: string): Kingdom | null => {
    const index = (KINGDOM_NAMES_LOWERCASE as readonly unknown[]).indexOf(str.toLowerCase());
    return index === -1 ? null : index;
};

export const enum ModifyJumproleResult {
    InvalidQuery = "InvalidName",
    NameTooLong = "NameTooLong",
    DescriptionTooLong = "DescriptionTooLong",
    LocationTooLong = "LocationTooLong",
    JumpTypeTooLong = "JumpTypeTooLong",
    LinkTooLong = "LinkTooLong",
    InvalidPropertyChange = "InvalidPropertyChange",
    Success = "Success",
}

export type ModifyJumproleFailure = Exclude<ModifyJumproleResult, ModifyJumproleResult.Success>;

export const enum GetJumproleResultType {
    InvalidName = "InvalidName",
    InvalidServerSnowflake = "InvalidServerSnowflake",
    QueryFailed = "QueryFailed",
    NoneMatched = "NoneMatched",
    GetTierWithIDFailed = "GetTierWithIDFailed",
    Unknown = "Unknown",
    Success = "Success",
}

export type GetJumproleFailureType = Exclude<GetJumproleResultType, GetJumproleResultType.Success>;

export type GetJumproleResult = { type: GetJumproleResultType.Success; jumprole: Jumprole } | { type: GetJumproleFailureType; jumprole?: undefined };

export const enum CreateJumproleResultType {
    InvalidJumproleOptionsObject,
    QueryFailed,
    Success,
    InvalidName,
    InvalidDescription,
    InvalidLocation,
    InvalidJumpType,
    InvalidLink,
    InvalidServer,
    IncorrectTierIDInDatabase,
    JumproleAlreadyExists,
    Unknown,
}

export type CreateJumproleFailureType = Exclude<CreateJumproleResultType, CreateJumproleResultType.Success>;

export type CreateJumproleResult =
    | {
          type: CreateJumproleResultType.Success;
          jumprole: Jumprole;
      }
    | { type: CreateJumproleFailureType; jumprole?: undefined };

export const JumproleRT = {
    id: RT.UnsignedIntegerLike.validate(
        RT.RangeValidator(PositiveIntegerMax(2147483647), range_validated => {
            if (range_validated[0] === false) return `input was like an unsigned integer but it was less than 0, making it an invalid UInt4`;
            else return `input was like an unsigned integer but it was greater than or equal to 2147483647, making it an invalid UInt4`;
        }),
    ),
    name: RT.string,
    description: RT.string,
    kingdom: RT.Nullable(RT.KingdomIndexN),
    location: RT.Nullable(RT.string),
    jump_type: RT.Nullable(RT.string),
    link: RT.Nullable(RT.string),
    added_by: RT.Snowflake,
    updated_at: RT.UInt4N,
    server: RT.Snowflake,
    tier: TierStructure,
    hash: RT.Base64Hash,
};

export const JumproleModifyOptionsStructure = RT.object({
    name: JumproleRT.name,
    description: JumproleRT.description,
    kingdom: JumproleRT.kingdom,
    location: JumproleRT.location,
    jump_type: JumproleRT.jump_type,
    tier: JumproleRT.tier,
    link: JumproleRT.link,
});

export type JumproleModifyOptions = InferNormalizedType<typeof JumproleModifyOptionsStructure>;

export const PartialJumproleModifyOptionsStructure = JumproleModifyOptionsStructure.partial(RT.Undefined);

export const JumproleOptionStructure = RT.Intersection(
    JumproleModifyOptionsStructure,
    RT.object({
        added_by: JumproleRT.added_by,
        server: JumproleRT.server,
    }),
);

export type JumproleOptions = InferNormalizedType<typeof JumproleOptionStructure>;

export const enum DeleteJumproleResult {
    Success,
    QueryFailed,
}

export type FromRowResult = { type: GetTierResultType.Success; jumprole: Jumprole } | { type: GetTierFailureType; tier_id: number };

export const enum FromJumproleQueryResultType {
    Success = "Success",
    QueryFailed = "QueryFailed",
    FromRowFailed = "FromRowFailed",
    NoJumproles = "NoJumproles",
}

export type FromJumproleQueryFailureType = Exclude<
    FromJumproleQueryResultType,
    FromJumproleQueryResultType.Success | FromJumproleQueryResultType.FromRowFailed
>;

export type FromJumproleQueryResult =
    | { type: FromJumproleQueryResultType.Success; values: Jumprole[] }
    | { type: FromJumproleQueryFailureType }
    | { type: FromJumproleQueryResultType.FromRowFailed; tier_id: number; error: GetTierFailureType };

@validate_constructor
export class Jumprole {
    readonly id: number;
    #_name: string;

    get name(): string {
        return this.#_name;
    }

    #_description: string;

    get description(): string {
        return this.#_description;
    }

    #_kingdom: Kingdom | null;

    get kingdom(): Kingdom | null {
        return this.#_kingdom;
    }

    #_location: string | null;

    get location(): string | null {
        return this.#_location;
    }

    #_jump_type: string | null;

    get jump_type(): string | null {
        return this.#_jump_type;
    }

    #_link: string | null;

    get link(): string | null {
        return this.#_link;
    }

    tier: Tier;

    readonly added_by: Snowflake;
    #_updated_at: number;

    readonly server: Snowflake;

    get updated_at(): number {
        return this.#_updated_at;
    }

    get hash(): string {
        return compute_jumprole_hash(this);
    }

    constructor(
        @type(JumproleRT.id) id: number,
        @type(JumproleRT.name) name: string,
        @type(JumproleRT.description) description: string,
        @type(JumproleRT.kingdom) kingdom: Kingdom | null,
        @type(JumproleRT.location) location: string | null,
        @type(JumproleRT.jump_type) jump_type: string | null,
        @type(JumproleRT.link) link: string | null,
        @type(JumproleRT.added_by) added_by: Snowflake,
        @type(JumproleRT.updated_at) updated_at: number,
        @type(JumproleRT.server) server: Snowflake,
        @type(JumproleRT.tier) tier: Tier,
        @type(RT.Optional(JumproleRT.hash)) hash?: string,
    ) {
        this.id = id;
        this.#_name = name;
        this.#_description = description;
        this.#_kingdom = kingdom;
        this.#_location = location;
        this.#_jump_type = jump_type;
        this.#_link = link;
        this.tier = tier;
        this.added_by = added_by;
        this.#_updated_at = updated_at;
        this.server = server;

        if (hash !== undefined && hash !== this.hash) {
            throw new TypeError("Jumprole constructor: incorrect hash passed as argument.");
        }
    }

    static readonly FromRow = async (row: trickjump_jumpsTableRow, queryable: Queryable<MakesSingleRequest>): Promise<FromRowResult> => {
        // TODO: handle error cases
        const tier_result = await Tier.WithID(row.tier_id, queryable);

        switch (tier_result.result) {
            case GetTierResultType.Success: {
                return {
                    type: GetTierResultType.Success,
                    jumprole: new Jumprole(
                        row.id,
                        row.display_name,
                        row.description,
                        row.kingdom,
                        row.location,
                        row.jump_type,
                        row.link,
                        row.added_by,
                        row.updated_at,
                        row.server,
                        tier_result.tier,
                        row.hash,
                    ),
                };
            }
            default: {
                return { type: tier_result.result, tier_id: row.tier_id };
            }
        }
    };

    static readonly FromBulkRow = (row: trickjump_jumpsBulkTableRow): Jumprole => {
        return new Jumprole(
            row.id,
            row.display_name,
            row.description,
            row.kingdom,
            row.location,
            row.jump_type,
            row.link,
            row.added_by,
            row.updated_at,
            row.server,
            new Tier(row.tier.id, row.tier.server, row.tier.ordinal, row.tier.display_name),
            row.hash,
        );
    };

    static readonly InServer = async (id: Snowflake, queryable: Queryable<UsesClient>): Promise<FromJumproleQueryResult> => {
        const query_string = GET_JUMPROLES_IN_BULK_BY_SERVER;
        const query_params = [id];
        const client = await use_client(queryable, "Jumprole.InServer");

        try {
            const rows_result = await client.query<trickjump_jumpsBulkTableRow>(query_string, query_params);

            if (rows_result.rows.length < 1) return { type: FromJumproleQueryResultType.NoJumproles };

            return { type: FromJumproleQueryResultType.Success, values: rows_result.rows.map(Jumprole.FromBulkRow) };
        } catch (err) {
            return { type: FromJumproleQueryResultType.QueryFailed };
        }
    };

    /**
     * @param query_string A query string which returns a trickjump_jumpsBulkTableRow
     * @param query_params Query parameters
     * @param queryable A Queryable
     * @returns FromJumproleQueryResult
     */
    static readonly FromQuery = async (
        query_string: string,
        query_params: unknown[],
        queryable: Queryable<UsesClient>,
    ): Promise<FromJumproleQueryResult> => {
        const client = await use_client(queryable, "Jumprole.FromQuery");

        try {
            const rows_result = await client.query<trickjump_jumpsBulkTableRow>(query_string, query_params);

            if (rows_result.rows.length < 1) return { type: FromJumproleQueryResultType.NoJumproles };

            client.handle_release();

            return { type: FromJumproleQueryResultType.Success, values: rows_result.rows.map(Jumprole.FromBulkRow) };
        } catch (err) {
            client.handle_release();

            query_failure("Jumprole.FromQuery", query_string, query_params, err);
            return { type: FromJumproleQueryResultType.QueryFailed };
        }
    };

    static readonly WithID = async (
        id: number,
        queryable: Queryable<UsesClient>,
    ): Promise<Exclude<GetJumproleResult, GetJumproleResultType.InvalidName | GetJumproleResultType.InvalidServerSnowflake>> => {
        const client = await use_client(queryable, "Jumprole.WithID");
        try {
            const result = (await client.query(GET_JUMPROLE_BY_ID, [id])) as trickjump_jumpsQueryResults;
            const row_result = result.rowCount;
            if (row_result > 1) {
                // Somehow multiple jumps with the same name and server, even though they are guaranteed by PostgreSQL to be unique as a pair
                log(
                    `Jumprole.get: received ${result.rows.length.toString()} rows when getting jumprole using id ${id}! Returning an error...`,
                    LogType.Error,
                );
                client.handle_release();
                return { type: GetJumproleResultType.QueryFailed };
            } else if (row_result === 1) {
                const row = result.rows[0];
                const tier_result = await Tier.WithID(row.tier_id, client);
                client.handle_release();
                if (tier_result.result === GetTierResultType.Success) {
                    // Expected case 1
                    return {
                        type: GetJumproleResultType.Success,
                        jumprole: new Jumprole(
                            row.id,
                            row.display_name,
                            row.description,
                            row.kingdom,
                            row.location,
                            row.jump_type,
                            row.link,
                            row.added_by,
                            row.updated_at,
                            row.server,
                            tier_result.tier,
                            row.hash,
                        ),
                    };
                } else return { type: GetJumproleResultType.GetTierWithIDFailed };
            } else {
                // Expected case 2
                // No jumps with ID
                client.handle_release();
                return { type: GetJumproleResultType.NoneMatched };
            }
        } catch (error) {
            client.handle_release();
            log(`Jumprole.get: unexpected error when getting jumprole using id ${id}! Returning an error.`, LogType.Error);
            log(error, LogType.Error);
            return { type: GetJumproleResultType.QueryFailed };
        }
    };

    static readonly Get = async (name: string, server: Snowflake, queryable: Queryable<UsesClient>): Promise<GetJumproleResult> => {
        if (is_string(name) === false) return { type: GetJumproleResultType.InvalidName };
        else if (is_valid_Snowflake(server) === false) return { type: GetJumproleResultType.InvalidServerSnowflake };
        const client = await use_client(queryable, "Jumprole.Get");
        try {
            const result = (await client.query(GET_JUMPROLE_BY_NAME_AND_SERVER, [to_num_and_lower(name), server])) as trickjump_jumpsQueryResults;
            const row_result = result.rowCount;
            if (row_result > 1) {
                // Somehow multiple jumps with the same name and server, even though they are guaranteed by PostgreSQL to be unique as a pair
                log(
                    `Jumprole.get: received ${result.rows.length.toString()} rows when getting jumprole using name ${to_num_and_lower(
                        name,
                    )} and server ${server}! Returning an error...`,
                    LogType.Error,
                );
                client.handle_release();
                return { type: GetJumproleResultType.QueryFailed };
            } else if (row_result === 1) {
                const row = result.rows[0];
                const tier_result = await Tier.WithID(row.tier_id, client);
                client.handle_release();
                if (tier_result.result === GetTierResultType.Success) {
                    // Expected case 1
                    return {
                        type: GetJumproleResultType.Success,
                        jumprole: new Jumprole(
                            row.id,
                            row.display_name,
                            row.description,
                            row.kingdom,
                            row.location,
                            row.jump_type,
                            row.link,
                            row.added_by,
                            row.updated_at,
                            server,
                            tier_result.tier,
                            row.hash,
                        ),
                    };
                } else return { type: GetJumproleResultType.GetTierWithIDFailed };
            } else {
                // Expected case 2
                // No jumps with name
                client.handle_release();
                return { type: GetJumproleResultType.NoneMatched };
            }
        } catch (error) {
            client.handle_release();
            log(
                `Jumprole.get: unexpected error when getting jumprole using name ${to_num_and_lower(name)} and server ${server}! Returning an error.`,
                LogType.Error,
            );
            log(error, LogType.Error);
            return { type: GetJumproleResultType.QueryFailed };
        }
    };

    /**
     * Adds a `Jumprole` object to the database, recomputing its hash and updating its `updated_at` value to the current date.
     * @param jumprole The `JumproleOptions` object to add to the database.
     * @param queryable The `Pool` or `PoolClient` used to execute the PostgreSQL database query.
     * @returns `CreateJumproleResult` indicating either success or failure, and the new Jumprole object.
     */
    static readonly Create = async function (jumprole: JumproleOptions, queryable: Queryable<UsesClient>): Promise<CreateJumproleResult> {
        const jumprole_options_result = JumproleOptionStructure.check(jumprole);

        if (jumprole_options_result.succeeded === false) {
            log("Jumprole.Create: unexpectedly received non-JumproleOptions object. Returning appropriate error code.", LogType.Error);
            log_stack(jumprole_options_result, "Jumprole.Create");
            log("jumprole:", LogType.Error);
            log(safe_serialize(jumprole), LogType.Error);
            return { type: CreateJumproleResultType.InvalidJumproleOptionsObject };
        }

        const validated_jumprole_options = jumprole_options_result.normalized;

        const existing = await Jumprole.Get(validated_jumprole_options.name, validated_jumprole_options.server, queryable);

        switch (existing.type) {
            case GetJumproleResultType.InvalidName: {
                log('Jumprole.Create: object had an invalid value for property "name". Returning.', LogType.Error);
                return { type: CreateJumproleResultType.InvalidName };
            }
            case GetJumproleResultType.InvalidServerSnowflake: {
                log('Jumprole.Create: object had an invalid value for property "server". Returning.', LogType.Error);
                return { type: CreateJumproleResultType.InvalidServer };
            }
            case GetJumproleResultType.Success: {
                return { type: CreateJumproleResultType.JumproleAlreadyExists };
            }
            case GetJumproleResultType.NoneMatched: {
                const hash = compute_jumprole_hash(validated_jumprole_options);

                const query_string = INSERT_JUMPROLE;
                const query_params = [
                    validated_jumprole_options.tier.id,
                    to_num_and_lower(validated_jumprole_options.name),
                    validated_jumprole_options.name,
                    validated_jumprole_options.description,
                    validated_jumprole_options.kingdom,
                    validated_jumprole_options.location,
                    validated_jumprole_options.jump_type,
                    validated_jumprole_options.link,
                    validated_jumprole_options.added_by,
                    Math.round(Date.now() / 1000),
                    validated_jumprole_options.server,
                    hash,
                ];

                const client = await use_client(queryable, "Jumprole.Create");

                try {
                    await client.query(INSERT_JUMPROLE, query_params);
                    const get_result = await Jumprole.Get(validated_jumprole_options.name, validated_jumprole_options.server, client);
                    client.handle_release();
                    switch (get_result.type) {
                        case GetJumproleResultType.NoneMatched: {
                            log("Jumprole.Create: Jumprole.Get returned NoneMatched after inserting jumprole. Returning.", LogType.Error);
                            return { type: CreateJumproleResultType.QueryFailed };
                        }
                        case GetJumproleResultType.QueryFailed: {
                            return { type: CreateJumproleResultType.QueryFailed };
                        }
                        case GetJumproleResultType.Unknown: {
                            log("Jumprole.Create: Jumprole.Get returned Unknown. Returning.", LogType.Error);
                            return { type: CreateJumproleResultType.Unknown };
                        }
                        case GetJumproleResultType.InvalidName: {
                            log('Jumprole.Create: after insertion, object had an invalid value for property "name". Returning.', LogType.Error);
                            return { type: CreateJumproleResultType.InvalidName };
                        }
                        case GetJumproleResultType.InvalidServerSnowflake: {
                            log('Jumprole.Create: after insertion, object had an invalid value for property "server". Returning.', LogType.Error);
                            return { type: CreateJumproleResultType.InvalidServer };
                        }
                        case GetJumproleResultType.GetTierWithIDFailed: {
                            log(`Jumprole.Create: after insertion, object had an invalid value for property "tier_id". Returning.`, LogType.Error);
                            return { type: CreateJumproleResultType.IncorrectTierIDInDatabase };
                        }
                        case GetJumproleResultType.Success: {
                            return { type: CreateJumproleResultType.Success, jumprole: get_result.jumprole };
                        }
                    }
                } catch (err) {
                    client.handle_release();
                    query_failure("Jumprole.Create", query_string, query_params, err);
                    return { type: CreateJumproleResultType.QueryFailed };
                }
            }
            case GetJumproleResultType.GetTierWithIDFailed: {
                return { type: CreateJumproleResultType.IncorrectTierIDInDatabase };
            }
            case GetJumproleResultType.QueryFailed: {
                return { type: CreateJumproleResultType.QueryFailed };
            }
            case GetJumproleResultType.Unknown: {
                return { type: CreateJumproleResultType.Unknown };
            }
        }
    };

    async update(merger: Partial<JumproleModifyOptions>, queryable: Queryable<MakesSingleRequest>): Promise<ModifyJumproleResult> {
        const merger_result = PartialJumproleModifyOptionsStructure.check(merger);

        // If we didn't get a valid merger passed as an argument
        if (merger_result.succeeded === false) {
            log_stack(merger_result, "Jumprole.update");
            return ModifyJumproleResult.InvalidPropertyChange;
        }

        const validated_merger_result = merger_result.normalized;

        // The keys to modify. Filter all of the keys of merger_result, which
        // comes out with all of the keys included in the Jumprole specification,
        // to just the ones which aren't undefined, i.e. they are being specified
        // and should be changed
        const change_keys = Object.keys(validated_merger_result).filter(
            (prop_name: string) =>
                validated_merger_result[prop_name as keyof JumproleModifyOptions] !== undefined &&
                prop_name !== "hash" &&
                prop_name !== "id" &&
                prop_name !== "server" &&
                prop_name !== "added_by",
        ) as (keyof JumproleModifyOptions)[];

        // Useful for generating the substitution signatures, i.e. $2, in the
        // database query string

        const request_head = "UPDATE trickjump_jumps SET ";
        const query_tail: unknown[] = [this.id];

        // Used to represent a property assignment that will be
        // filled out in the DB query string
        type QueryAssignment = [string, unknown];
        const stringify_assignment = function (assignment: QueryAssignment, index: number): string {
            return `${assignment[0]} = $${(index + 1).toString()}`;
        };

        const query_assignments: QueryAssignment[] = [];

        for (const change_key of change_keys) {
            switch (change_key as string) {
                // Never change IDs, added_bys, or servers
                case "id":
                case "added_by":
                case "server": {
                    log(`Jumprole.update: merger had property "${change_key}" which cannot be changed.`, LogType.Error);
                    return ModifyJumproleResult.InvalidPropertyChange;
                }
                // Make sure the values given for these properties
                // in the merger object have the correct length
                case "name": {
                    const name = validated_merger_result["name"] as string;
                    query_assignments.push(["name", to_num_and_lower(name)]);
                    query_assignments.push(["display_name", name]);
                    break;
                }
                case "description": {
                    const description = validated_merger_result["description"];
                    query_assignments.push(["description", description]);
                    break;
                }
                case "location": {
                    const location = validated_merger_result["location"];
                    query_assignments.push(["location", location]);
                    break;
                }
                case "kingdom": {
                    const kingdom = validated_merger_result["kingdom"];
                    query_assignments.push(["kingdom", kingdom]);
                    break;
                }
                case "jump_type": {
                    const jump_type = validated_merger_result["jump_type"];
                    query_assignments.push(["jump_type", jump_type]);
                    break;
                }
                case "link": {
                    const link = validated_merger_result["link"];
                    query_assignments.push(["link", link]);
                    break;
                }
                case "tier": {
                    const tier = validated_merger_result["tier"];
                    if (tier !== undefined) {
                        query_assignments.push(["tier_id", tier?.id]);
                    }
                }
            }
        }

        if (query_assignments.length === 0) {
            return ModifyJumproleResult.Success;
        }

        // Assign the merger object to the old object, merging it and creating the new one
        const filtered_merger_result = ((): Partial<JumproleModifyOptions> => {
            const res = {};
            for (const prop_name in merger_result.normalized) {
                // @ts-expect-error prop_name is a key of validated_merger_result!
                if (validated_merger_result[prop_name] !== undefined)
                    // @ts-expect-error same problem
                    res[prop_name] = validated_merger_result[prop_name] as Partial<ModifyJumproleResult>[keyof ModifyJumproleResult];
            }
            return res;
        })();

        let target_obj: JumproleOptions = {
            name: this.name,
            description: this.description,
            jump_type: this.jump_type,
            kingdom: this.kingdom,
            link: this.link,
            server: this.server,
            location: this.location,
            tier: this.tier,
            added_by: this.added_by,
        };

        Object.assign(target_obj, filtered_merger_result);

        const hash = compute_jumprole_hash(target_obj);

        let new_date = Math.round(Date.now() / 1000);

        // Add the correct hash to the query assignments
        query_assignments.push(["hash", hash]);
        query_assignments.push(["updated_at", new_date]);

        // Create the part of the query string where we set the properties
        const request_mid = query_assignments.map((assignment, index) => stringify_assignment(assignment, index)).join(", ");
        const query_start = query_assignments.map(assignment => assignment[1]);

        const request_tail = ` WHERE id=$${query_assignments.length + 1}`;
        const full_request = request_head + request_mid + request_tail;
        const full_query_params = query_start.concat(query_tail);
        try {
            await queryable.query(full_request, full_query_params);
            for (const key in filtered_merger_result) {
                // @ts-expect-error TS doesn't like dynamically changing a property of a class.
                this.change(key, filtered_merger_result[key as keyof JumproleModifyOptions]);
            }
            this.#_updated_at = new_date;
            return ModifyJumproleResult.Success;
        } catch (err) {
            query_failure("Jumprole.update", full_request, full_query_params, err);
            return ModifyJumproleResult.InvalidQuery;
        }
    }

    private change<Key extends keyof JumproleModifyOptions>(key: keyof JumproleModifyOptions, value: JumproleModifyOptions[Key]) {
        let result = JumproleRT[key].check(value);
        if (result.succeeded === false) {
            log(`Jumprole.change: value failed structure test (key: ${key})`);
            log_stack(result, "Jumprole.change", DebugLogType.StructureCheckResult, false);
            return;
        }
        switch (key) {
            case "name": {
                this.#_name = result.normalized as string;
                break;
            }
            case "tier": {
                this.tier = result.normalized as Tier;
                break;
            }
            case "description": {
                this.#_description = result.normalized as string;
                break;
            }
            case "kingdom": {
                this.#_kingdom = result.normalized as Kingdom | null;
                break;
            }
            case "location": {
                this.#_location = result.normalized as string;
                break;
            }
            case "link": {
                this.#_link = result.normalized as string;
                break;
            }
            case "jump_type": {
                this.#_jump_type = result.normalized as string;
            }
        }
    }

    async delete(queryable: Queryable<MakesSingleRequest>): Promise<DeleteJumproleResult> {
        try {
            await queryable.query(DELETE_JUMPROLE_BY_ID, [this.id]);
            return DeleteJumproleResult.Success;
        } catch (err) {
            query_failure("Jumprole.Delete", DELETE_JUMPROLE_BY_ID, [this.id], err);
            return DeleteJumproleResult.QueryFailed;
        }
    }
}

export const JumproleStructure = new Structure<Jumprole>(
    "Structure",
    (input: unknown) => {
        if (input instanceof Jumprole) return { succeeded: true, result: input as Jumprole };
        else return { succeeded: false, error: StructureValidationFailedReason.IncorrectType, information: ["expected instanceof Jumprole"] };
    },
    <Input extends Jumprole>(result: Input): TransformResult<Input> => {
        if (result instanceof Jumprole) return { succeeded: true, result: result };
        else return { succeeded: false, error: StructureValidationFailedReason.IncorrectType, information: ["expected instanceof Jumprole"] };
    },
);

export type JumproleHandle = number | [string, Snowflake];

export const enum JumproleHandleType {
    Invalid = 0,
    ID,
    NameAndServer,
}

/*export interface Jumprole {
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
}*/

/*export interface PGJumprole {
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
}*/

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
        return ["null"];
    } else if (thing === undefined) {
        return ["undefined"];
    } else {
        // throw off attempts to place values that would hash the same way as null or undefined
        return [thing.toString(), string_hash(thing)];
    }
};

export const compute_jumprole_hash = function (jumprole_data: JumproleOptions): string {
    const hash = createHash("sha256");
    hash.update(jumprole_data.name);
    log(`compute_jumprole_hash: hashing jumprole.name ("${jumprole_data.name}")`, LogType.Status, DebugLogType.ComputeJumproleHashValues);
    hash.update(jumprole_data.description);
    log(
        `compute_jumprole_hash: hashing jumprole.description ("${jumprole_data.description}")`,
        LogType.Status,
        DebugLogType.ComputeJumproleHashValues,
    );
    // Make sure we hash null or undefined different than any string value
    optional_hashable(jumprole_data.kingdom).forEach(value => hash.update(value));
    log(
        `compute_jumprole_hash: hashing jumprole.kingdom (${jumprole_data.kingdom === null ? "null" : `"${jumprole_data.kingdom.toString()}"`})`,
        LogType.Status,
        DebugLogType.ComputeJumproleHashValues,
    );
    optional_hashable(jumprole_data.location).forEach(value => hash.update(value));
    log(
        `compute_jumprole_hash: hashing jumprole.location (${jumprole_data.location === null ? "null" : `"${jumprole_data.location}"`})`,
        LogType.Status,
        DebugLogType.ComputeJumproleHashValues,
    );
    optional_hashable(jumprole_data.jump_type).forEach(value => hash.update(value));
    log(
        `compute_jumprole_hash: hashing jumprole.jump_type (${jumprole_data.jump_type === null ? "null" : `"${jumprole_data.jump_type}"`})`,
        LogType.Status,
        DebugLogType.ComputeJumproleHashValues,
    );
    optional_hashable(jumprole_data.link).forEach(value => hash.update(value));
    log(
        `compute_jumprole_hash: hashing jumprole.link (${jumprole_data.link === null ? "null" : `"${jumprole_data.link}"`})`,
        LogType.Status,
        DebugLogType.ComputeJumproleHashValues,
    );
    log(`compute_jumprole_hash: hashing jumprole.tier.id (${jumprole_data.tier.id})`, LogType.Status, DebugLogType.ComputeJumproleHashValues);
    hash.update(jumprole_data.tier.id.toString());
    hash.update(jumprole_data.added_by);
    log(`compute_jumprole_hash: hashing jumprole.added_by ("${jumprole_data.added_by}")`, LogType.Status, DebugLogType.ComputeJumproleHashValues);
    /*
    Don't hash updated_at date
    hash.update(updated_at.toString());
    log(`compute_jumprole_hash: hashing jumprole.updated_at (${updated_at})`, LogType.Status, DebugLogType.ComputeJumproleHashValues);
    */
    hash.update(jumprole_data.server);

    log(`compute_jumprole_hash: hashing jumprole.server ("${jumprole_data.server}")`, LogType.Status, DebugLogType.ComputeJumproleHashValues);
    const digest = hash.digest("base64");
    log(`compute_jumprole_hash: final digest is ${digest}.`, LogType.Status, DebugLogType.ComputeJumproleHashValues);
    return digest;
};

/*export const check_jumprole_handle = function (thing?: unknown): JumproleHandleType {
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
};*/

/*export const PGJumproleSPECIFICATION: Specification<PGJumprole> = [
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
] as const;*/

/*
/**
 * Converts the result received from client.query to our Jumprole object.
 * @param object The supposed PGJumprole to convert to our Jumprole object. It is thoroughly type-checked for validity.
 * @returns Jumprole or null if it was invalid.
 *
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
    / @ts-expect-error
    if (compute_jumprole_hash(result as Jumprole) !== result.hash) {
        log(`PGJumprole_to_Jumprole: PGJumprole.hash unexpectedly did not match computed Jumprole hash value! Returning null.`, LogType.Mismatch);
        return null;
    }
    // If it isn't fully complete, we've already returned null; we're safe to return it
    // { ts-malfunction }
    / @ts-expect-error
    return result as Jumprole;
};
*/
