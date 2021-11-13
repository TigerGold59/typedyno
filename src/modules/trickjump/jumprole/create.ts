import { Client } from "discord.js";
import { UsingClient } from "../../../pg_wrapper.js";

import { BotCommandProcessResults, BotCommandProcessResultType, BotInteraction, Replier, Subcommand } from "../../../functions.js";
import { MAINTAINER_TAG } from "../../../main.js";
import { log, LogType } from "../../../utilities/log.js";
import { Jumprole, KingdomNameToKingdom, CreateJumproleResultType, KingdomString, VideoLink } from "./internals/jumprole_type.js";
import { ValidatedArguments } from "../../../utilities/argument_processing/arguments_types.js";
import { GetTierResultType, Tier } from "../tier/internals/tier_type.js";
export class JumproleCreate extends Subcommand<typeof JumproleCreate.manual> {
    constructor() {
        super();
    }

    static readonly manual = {
        name: "create",
        arguments: [
            {
                name: "name",
                id: "name",
                optional: false,
                short_description: "jump name",
                base_type: "STRING",
            },
            {
                name: "tier",
                id: "tier",
                optional: false,
                short_description: "tier name",
                base_type: "STRING",
            },
            {
                name: "description",
                id: "description",
                optional: false,
                short_description: "jump description",
                base_type: "STRING",
            },
            {
                name: "kingdom",
                id: "kingdom",
                optional: true,
                further_constraint: KingdomString,
                short_description: "kingdom of jump",
                base_type: "STRING",
            },
            {
                name: "location",
                id: "location",
                optional: true,
                short_description: "location of jump",
                base_type: "STRING",
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
                further_constraint: VideoLink,
                short_description: "Twitter or YouTube link",
                base_type: "STRING",
            },
        ],
        description: "Creates or updates a Jumprole with the specified properties.",
        syntax: "::<prefix>jumprole create:: NAME $1 TIER $2 INFO $3{opt $4}[ KINGDOM $4]{opt $5}[ LOCATION $5]{opt $6}[ JUMP TYPE $6]{opt $7}[ LINK $7]",
        compact_syntaxes: true,
    } as const;

    readonly manual = JumproleCreate.manual;
    readonly no_use_no_see = false;
    readonly permissions = undefined;

    async activate(
        args: ValidatedArguments<typeof JumproleCreate.manual>,
        interaction: BotInteraction,
        _client: Client,
        pg_client: UsingClient,
        prefix: string,
        reply: Replier,
    ): Promise<BotCommandProcessResults> {
        const failed = { type: BotCommandProcessResultType.DidNotSucceed };

        const get_tier = await Tier.Get(args.tier, interaction.guild.id, pg_client);

        switch (get_tier.result) {
            case GetTierResultType.InvalidName: {
                await reply(`invalid tier name.`);

                return failed;
            }
            case GetTierResultType.InvalidServer: {
                await reply(`an unknown internal error caused message.guild.id to be an invalid Snowflake. Contact @${MAINTAINER_TAG} for help.`);
                log(`jumprole create: Tier.get - an unknown internal error caused message.guild.id to be an invalid Snowflake.`, LogType.Error);

                return failed;
            }
            case GetTierResultType.NoMatchingEntries: {
                await reply(`no tier with name "${args.tier}" exists in this server.`);
                return failed;
            }
            case GetTierResultType.QueryFailed: {
                await reply(`an unknown internal error caused the database query to fail. Contact @${MAINTAINER_TAG} for help.`);

                return failed;
            }
            case GetTierResultType.Success: {
                const query_result = await Jumprole.Create(
                    {
                        name: args.name,
                        kingdom: args.kingdom === null ? null : KingdomNameToKingdom(args.kingdom),
                        location: args.location,
                        tier: get_tier.tier,
                        jump_type: args.jump_type,
                        link: args.link,
                        description: args.description,
                        added_by: interaction.author.id,
                        server: interaction.guild.id,
                    },
                    pg_client,
                );

                switch (query_result.type) {
                    case CreateJumproleResultType.Success: {
                        await interaction.give_check();
                        return { type: BotCommandProcessResultType.Succeeded };
                    }
                    case CreateJumproleResultType.QueryFailed: {
                        await reply(`an unknown internal error caused the database query to fail. Contact @${MAINTAINER_TAG} for help.`);
                        return failed;
                    }
                    case CreateJumproleResultType.JumproleAlreadyExists: {
                        await reply(
                            `a Jumprole with that name already exists. Please use '${prefix}jumprole update' in order to change already existing Jumproles.`,
                        );
                        return failed;
                    }
                    case CreateJumproleResultType.InvalidName: {
                        await reply(`the given name was too long (length: ${args.name.length.toString()} chars, limit: 100 chars).`);
                        return failed;
                    }
                    case CreateJumproleResultType.InvalidLink: {
                        await reply(`the given link was too long (length: ${(args.link as string).length.toString()} chars, limit: 150 chars).`);
                        return failed;
                    }
                    case CreateJumproleResultType.InvalidLocation: {
                        await reply(
                            `the given location was too long (length: ${(args.location as string).length.toString()} chars, limit: 200 chars).`,
                        );
                        return failed;
                    }
                    case CreateJumproleResultType.InvalidJumpType: {
                        await reply(
                            `the given jump type was too long (length: ${(args.jump_type as string).length.toString()} chars, limit: 200 chars).`,
                        );
                        return failed;
                    }
                    case CreateJumproleResultType.InvalidDescription: {
                        await reply(`the given description was too long (length: ${args.description.length.toString()} chars, limit: 1500 chars).`);
                        return failed;
                    }
                    case CreateJumproleResultType.InvalidJumproleOptionsObject: {
                        await reply(`an unknown internal error occurred (invalid JumproleOptions object). Contact @${MAINTAINER_TAG} for help.`);
                        return failed;
                    }
                    default: {
                        log(
                            `jumprole create: received invalid option in switch (CreateJumproleResultType.${query_result.type}) that brought us to the default case. Informing the user of the error...`,
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
