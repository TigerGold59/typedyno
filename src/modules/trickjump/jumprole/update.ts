import { Client } from "discord.js";
import { UsingClient } from "../../../pg_wrapper.js";

import { BotCommandProcessResults, BotCommandProcessResultType, BotInteraction, Replier, Subcommand } from "../../../functions.js";
import { MAINTAINER_TAG } from "../../../main.js";

import { log, LogType } from "../../../utilities/log.js";
import { is_string } from "../../../utilities/typeutils.js";
// import { ModifyJumproleResult, modify_jumprole } from "./internals/jumprole_postgres.js";
import {
    GetJumproleResultType,
    Jumprole,
    JumproleModifyOptions,
    KingdomNameToKingdom,
    KingdomString,
    ModifyJumproleResult,
    VideoLink,
} from "./internals/jumprole_type.js";
import { ValidatedArguments } from "../../../utilities/argument_processing/arguments_types.js";
import { GetTierResultType, Tier } from "../tier/internals/tier_type.js";

export class JumproleUpdate extends Subcommand<typeof JumproleUpdate.manual> {
    constructor() {
        super();
    }

    static readonly manual = {
        name: "update",
        arguments: [
            {
                name: "name",
                id: "name",
                optional: false,
                short_description: "current jump name",
                base_type: "STRING",
            },
            {
                name: "description",
                id: "description",
                optional: true,
                short_description: "new jump description",
                base_type: "STRING",
            },
            {
                name: "tier",
                id: "tier",
                optional: true,
                short_description: "new tier name",
                base_type: "STRING",
            },
            {
                name: "new name",
                id: "new_name",
                optional: true,
                short_description: "new jump name",
                base_type: "STRING",
            },
            {
                name: "kingdom",
                id: "kingdom",
                optional: true,
                base_type: "STRING",
                further_constraint: KingdomString,
                short_description: "kingdom of jump",
            },
            {
                name: "location",
                id: "location",
                optional: true,
                base_type: "STRING",
                short_description: "location of jump",
            },
            {
                name: "jump type",
                id: "jump_type",
                optional: true,
                short_description: "jump type",
                base_type: "STRING",
            },
            {
                name: "link",
                id: "link",
                optional: true,
                base_type: "STRING",
                further_constraint: VideoLink,
                short_description: "Twitter or YouTube link",
            },
        ],
        description: "Updates a jumprole. To unset a specific property (except NEW NAME), provide 'UNSET' as the argument.",
        syntax: "::<prefix>jumprole update:: NAME $1{opt $2}[ INFO $2]{opt $3}[ TIER $3]{opt $4}[ NEW NAME $4]{opt $5}[ KINGDOM $5]{opt $6}[ LOCATION $6]{opt $7}[ JUMP TYPE $7]{opt $8}[ LINK $8]",
        compact_syntaxes: true,
    } as const;

    readonly manual = JumproleUpdate.manual;
    readonly no_use_no_see = false;
    readonly permissions = undefined;

    // eslint-disable-next-line complexity
    async activate(
        values: ValidatedArguments<typeof JumproleUpdate.manual>,
        interaction: BotInteraction,
        _client: Client,
        pg_client: UsingClient,
        prefix: string,
        reply: Replier,
    ): Promise<BotCommandProcessResults> {
        const failed = { type: BotCommandProcessResultType.DidNotSucceed };

        const change_intention = (provided: string | null): string | null | undefined => {
            if (provided === "UNSET") return null;
            else if (is_string(provided)) return provided;
            else return undefined;
        };

        const name_change_intention = values.new_name === null ? undefined : values.new_name;

        let tier_intention = undefined;

        if (values.tier !== null) {
            const get_tier = await Tier.Get(values.tier, interaction.guild.id, pg_client);

            switch (get_tier.result) {
                case GetTierResultType.InvalidName: {
                    await reply(`invalid tier name.`);

                    return failed;
                }
                case GetTierResultType.InvalidServer: {
                    await reply(`an unknown internal error caused message.guild.id to be an invalid Snowflake. Contact @${MAINTAINER_TAG} for help.`);
                    log(`jumprole set: Tier.get - an unknown internal error caused message.guild.id to be an invalid Snowflake.`, LogType.Error);

                    return failed;
                }
                case GetTierResultType.NoMatchingEntries: {
                    await reply(`no tier with name "${values.tier}" exists in this server.`);

                    return failed;
                }
                case GetTierResultType.QueryFailed: {
                    await reply(`an unknown internal error caused the database query to fail. Contact @${MAINTAINER_TAG} for help.`);

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

        const get_result = await Jumprole.Get(values.name, interaction.guild.id, pg_client);

        switch (get_result.type) {
            case GetJumproleResultType.InvalidName: {
                await reply(`invalid jump name. Contact @${MAINTAINER_TAG} for help as this should have been caught earlier.`);

                return { type: BotCommandProcessResultType.Invalid };
            }
            case GetJumproleResultType.InvalidServerSnowflake: {
                log(
                    `jumprole update: Jumprole.Get with arguments [${values.name}, ${interaction.guild.id}] failed with error GetJumproleResultType.InvalidServerSnowflake.`,
                    LogType.Error,
                );
                await reply(
                    `an unknown error caused Jumprole.Get to return GetJumproleResultType.InvalidServerSnowflake. Contact @${MAINTAINER_TAG} for help.`,
                );

                return failed;
            }
            case GetJumproleResultType.NoneMatched: {
                await reply(`a jump with that name doesn't exist in this server. You can list all roles with '${prefix}tj all'.`);

                return failed;
            }
            case GetJumproleResultType.QueryFailed: {
                await reply(`an unknown error occurred (query failure). Contact @${MAINTAINER_TAG} for help.`);

                return failed;
            }
            case GetJumproleResultType.GetTierWithIDFailed: {
                await reply(
                    "an unknown error caused Jumprole.Get to fail with error GetJumproleResultType.GetTierWithIDFailed. It is possible that its tier was deleted.",
                );
                log(
                    `jumprole update: Jumprole.Get with arguments [${values.name}, ${interaction.guild.id}] unexpectedly failed with error GetJumproleResultType.GetTierWithIDFailed.`,
                    LogType.Error,
                );

                return failed;
            }
            case GetJumproleResultType.Unknown: {
                log(
                    `jumprole update: Jumprole.Get with arguments [${values.name}, ${interaction.guild.id}] unexpectedly failed with error GetJumproleResultType.Unknown.`,
                );
                await reply(`an unknown error occurred after Jumprole.Get. Contact @${MAINTAINER_TAG} for help.`);

                return failed;
            }
            case GetJumproleResultType.Success: {
                const result = await get_result.jumprole.update(jumprole_object, pg_client);

                switch (result) {
                    case ModifyJumproleResult.Success: {
                        await interaction.give_check();
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
