import { Client } from "discord.js";
import { Queryable, UsesClient, use_client } from "../../../pg_wrapper.js";

import { BotCommandProcessResults, BotCommandProcessResultType, GiveCheck, Replier, Subcommand } from "../../../functions.js";
import { MAINTAINER_TAG } from "../../../main.js";
import { validate } from "../../../module_decorators.js";
import { log, LogType } from "../../../utilities/log.js";
import { Permissions } from "../../../utilities/permissions.js";
import { is_string, is_text_channel, TextChannelMessage } from "../../../utilities/typeutils.js";
// import { ModifyJumproleResult, modify_jumprole } from "./internals/jumprole_postgres.js";
import {
    GetJumproleResultType,
    Jumprole,
    JumproleModifyOptions,
    KingdomNameToKingdom,
    KINGDOM_NAMES,
    KINGDOM_NAMES_LOWERCASE,
    ModifyJumproleResult,
} from "./internals/jumprole_type.js";
import { ValidatedArguments } from "../../../utilities/argument_processing/arguments_types.js";
import { GetTierResultType, Tier } from "../tier/internals/tier_type.js";
import { Jumprole as JumproleCommand } from "./jumprole_cmd.js";
import * as RT from "../../../utilities/runtime_typeguard/standard_structures.js";
import { StructureValidationFailedReason, TransformResult } from "../../../utilities/runtime_typeguard/runtime_typeguard.js";

export class JumproleUpdate extends Subcommand<typeof JumproleUpdate.manual> {
    constructor() {
        super(JumproleCommand.manual, JumproleUpdate.manual, JumproleUpdate.no_use_no_see, JumproleUpdate.permissions);
    }

    static readonly manual = {
        name: "update",
        arguments: [
            {
                name: "name",
                id: "name",
                optional: false,
            },
            {
                name: "tier",
                id: "tier",
                optional: true,
            },
            {
                name: "new name",
                id: "new_name",
                optional: true,
            },
            {
                name: "kingdom",
                id: "kingdom",
                optional: true,
                further_constraint: RT.string.validate(<Input extends string>(result: Input): TransformResult<Input> => {
                    if (KINGDOM_NAMES_LOWERCASE.includes(result.toLowerCase() as typeof KINGDOM_NAMES_LOWERCASE[number])) {
                        return { succeeded: true, result: result };
                    } else {
                        return {
                            succeeded: false,
                            error: StructureValidationFailedReason.InvalidValue,
                            information: [`input was a string but it wasn't a kingdom name. Valid kingdom names are: ${KINGDOM_NAMES.join()}.`],
                        };
                    }
                }),
            },
            {
                name: "location",
                id: "location",
                optional: true,
            },
            {
                name: "jump type",
                id: "jump_type",
                optional: true,
            },
            {
                name: "link",
                id: "link",
                optional: true,
            },
            {
                name: "description",
                id: "description",
                optional: true,
            },
        ],
        description:
            "Updates the specified properties of the jumprole. To unset a specific property, provide 'UNSET' as the argument. You cannot unset the NEW NAME property.",
        syntax: "::<prefix>jumprole update:: NAME $1{opt $2}[ TIER $2]{opt $3}[ NEW NAME $3]{opt $4}[ KINGDOM $4]{opt $5}[ LOCATION $5]{opt $6}[ JUMP TYPE $6]{opt $7}[ LINK $7]{opt $8}[ INFO $8]",
        compact_syntaxes: true,
    } as const;

    static readonly no_use_no_see = false;
    static readonly permissions = undefined as Permissions | undefined;

    @validate
    // eslint-disable-next-line complexity
    async activate(
        values: ValidatedArguments<typeof JumproleUpdate.manual>,
        message: TextChannelMessage,
        _client: Client,
        queryable: Queryable<UsesClient>,
        prefix: string,
        reply: Replier,
    ): Promise<BotCommandProcessResults> {
        const failed = { type: BotCommandProcessResultType.DidNotSucceed };

        if (is_text_channel(message) === false) {
            return { type: BotCommandProcessResultType.Unauthorized };
        }

        const change_intention = (provided: string | null): string | null | undefined => {
            if (provided === "UNSET") return null;
            else if (is_string(provided)) return provided;
            else return undefined;
        };

        const name_change_intention = values.new_name === null ? values.name : values.new_name;

        const client = await use_client(queryable, "JumproleUpdate.activate");

        let tier_intention = undefined;

        if (values.tier !== null) {
            const get_tier = await Tier.Get(values.tier, message.guild.id, client);

            switch (get_tier.result) {
                case GetTierResultType.InvalidName: {
                    await reply(`invalid tier name.`);
                    client.handle_release();
                    return failed;
                }
                case GetTierResultType.InvalidServer: {
                    await reply(`an unknown internal error caused message.guild.id to be an invalid Snowflake. Contact @${MAINTAINER_TAG} for help.`);
                    log(`jumprole set: Tier.get - an unknown internal error caused message.guild.id to be an invalid Snowflake.`, LogType.Error);
                    client.handle_release();
                    return failed;
                }
                case GetTierResultType.NoMatchingEntries: {
                    await reply(`no tier with name "${values.tier}" exists in this server.`);
                    client.handle_release();
                    return failed;
                }
                case GetTierResultType.QueryFailed: {
                    await reply(`an unknown internal error caused the database query to fail. Contact @${MAINTAINER_TAG} for help.`);
                    client.handle_release();
                    return failed;
                }
                case GetTierResultType.Success: {
                    tier_intention = get_tier.tier;
                }
            }
        }

        const jumprole_object: Partial<JumproleModifyOptions> = {
            name: name_change_intention,
            kingdom: is_string(values.kingdom)
                ? KingdomNameToKingdom(change_intention(values.kingdom) as string)
                : (change_intention(values.kingdom) as null | undefined),
            location: change_intention(values.location),
            jump_type: change_intention(values.jump_type),
            link: change_intention(values.link),
            tier: tier_intention,
            description: values.description === null ? undefined : values.description,
        };

        const get_result = await Jumprole.Get(values.name, message.guild.id, client);

        switch (get_result.type) {
            case GetJumproleResultType.InvalidName: {
                await reply(`invalid jump name. Contact @${MAINTAINER_TAG} for help as this should have been caught earlier.`);
                client.handle_release();
                return { type: BotCommandProcessResultType.Invalid };
            }
            case GetJumproleResultType.InvalidServerSnowflake: {
                log(
                    `jumprole update: Jumprole.Get with arguments [${values.name}, ${message.guild.id}] failed with error GetJumproleResultType.InvalidServerSnowflake.`,
                    LogType.Error,
                );
                await reply(
                    `an unknown error caused Jumprole.Get to return GetJumproleResultType.InvalidServerSnowflake. Contact @${MAINTAINER_TAG} for help.`,
                );
                client.handle_release();
                return failed;
            }
            case GetJumproleResultType.NoneMatched: {
                await reply(`a jump with that name doesn't exist in this server. You can list all roles with \`${prefix}tj all\`.`);
                client.handle_release();
                return failed;
            }
            case GetJumproleResultType.QueryFailed: {
                await reply(`an unknown error occurred (query failure). Contact @${MAINTAINER_TAG} for help.`);
                client.handle_release();
                return failed;
            }
            case GetJumproleResultType.GetTierWithIDFailed: {
                await reply(
                    "an unknown error caused Jumprole.Get to fail with error GetJumproleResultType.GetTierWithIDFailed. It is possible that its tier was deleted.",
                );
                log(
                    `jumprole update: Jumprole.Get with arguments [${values.name}, ${message.guild.id}] unexpectedly failed with error GetJumproleResultType.GetTierWithIDFailed.`,
                    LogType.Error,
                );
                client.handle_release();
                return failed;
            }
            case GetJumproleResultType.Unknown: {
                log(
                    `jumprole update: Jumprole.Get with arguments [${values.name}, ${message.guild.id}] unexpectedly failed with error GetJumproleResultType.Unknown.`,
                );
                await reply(`an unknown error occurred after Jumprole.Get. Contact @${MAINTAINER_TAG} for help.`);
                client.handle_release();
                return failed;
            }
            case GetJumproleResultType.Success: {
                const result = await get_result.jumprole.update(jumprole_object, client);
                client.handle_release();
                switch (result) {
                    case ModifyJumproleResult.Success: {
                        await GiveCheck(message);
                        return { type: BotCommandProcessResultType.Succeeded };
                    }
                    case ModifyJumproleResult.InvalidQuery: {
                        await reply(`an unknown internal error caused the database query to fail. Contact @${MAINTAINER_TAG} for help.`);
                        return failed;
                    }
                    case ModifyJumproleResult.InvalidPropertyChange: {
                        await reply(
                            `an unknown internal error caused the passed Partial<Jumprole> object to be invalid. Contact @${MAINTAINER_TAG} for help.`,
                        );
                        return failed;
                    }
                    case ModifyJumproleResult.NameTooLong: {
                        await reply(`the given name was too long (length: ${values.name.length.toString()} chars, limit: 100 chars).`);
                        return failed;
                    }
                    case ModifyJumproleResult.LinkTooLong: {
                        await reply(`the given link was too long (length: ${(values.link as string).length.toString()} chars, limit: 150 chars).`);
                        return failed;
                    }
                    case ModifyJumproleResult.LocationTooLong: {
                        await reply(
                            `the given location was too long (length: ${(values.location as string).length.toString()} chars, limit: 200 chars).`,
                        );
                        return failed;
                    }
                    case ModifyJumproleResult.JumpTypeTooLong: {
                        await reply(
                            `the given jump type was too long (length: ${(values.jump_type as string).length.toString()} chars, limit: 200 chars).`,
                        );
                        return failed;
                    }
                    case ModifyJumproleResult.DescriptionTooLong: {
                        await reply(
                            `the given description was too long (length: ${(
                                values.description as string
                            ).length.toString()} chars, limit: 1500 chars).`,
                        );
                        return failed;
                    }
                    default: {
                        log(
                            `jumprole_update: received invalid option in switch (ModifyJumproleResult) that brought us to the default case. Informing the user of the error...`,
                            LogType.Error,
                        );
                        await reply(`unknown internal error. Contact @${MAINTAINER_TAG} for help.`);
                        return failed;
                    }
                }
            }
        }
    }
}
