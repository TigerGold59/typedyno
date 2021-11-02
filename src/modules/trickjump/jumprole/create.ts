import { Client } from "discord.js";
import { Queryable, UsesClient, use_client } from "../../../pg_wrapper.js";

import { BotCommandProcessResults, BotCommandProcessResultType, GiveCheck, Replier, Subcommand } from "../../../functions.js";
import { MAINTAINER_TAG } from "../../../main.js";
import { validate } from "../../../module_decorators.js";
import { log, LogType } from "../../../utilities/log.js";
import { Permissions } from "../../../utilities/permissions.js";
//import { CreateJumproleResult, create_jumprole } from "./internals/jumprole_postgres.js";
import { Jumprole, KingdomNameToKingdom, CreateJumproleResultType } from "./internals/jumprole_type.js";
import { ValidatedArguments } from "../../../utilities/argument_processing/arguments_types.js";
import { TextChannelMessage } from "../../../utilities/typeutils.js";
import { GetTierResultType, Tier } from "../tier/internals/tier_type.js";
import { Jumprole as JumproleCommand } from "./jumprole_cmd.js";
export class JumproleCreate extends Subcommand<typeof JumproleCreate.manual> {
    constructor() {
        super(JumproleCommand.manual, JumproleCreate.manual, JumproleCreate.no_use_no_see, JumproleCreate.permissions);
    }

    static readonly manual = {
        name: "create",
        arguments: [
            {
                name: "name",
                id: "name",
                optional: false,
            },
            {
                name: "tier",
                id: "tier",
                optional: false,
            },
            {
                name: "kingdom",
                id: "kingdom",
                optional: true,
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
                optional: false,
            },
        ],
        description: "Creates or updates a Jumprole with the specified properties.",
        syntax: "::<prefix>jumprole create:: NAME $1 TIER $2{opt $3}[ KINGDOM $3]{opt $4}[ LOCATION $4]{opt $5}[ JUMP TYPE $5]{opt $6}[ LINK $6] INFO $7",
        compact_syntaxes: true,
    } as const;

    static readonly no_use_no_see = false;
    static readonly permissions = undefined as Permissions | undefined;

    @validate
    async activate(
        args: ValidatedArguments<typeof JumproleCreate.manual>,
        message: TextChannelMessage,
        _client: Client,
        queryable: Queryable<UsesClient>,
        prefix: string,
        reply: Replier,
    ): Promise<BotCommandProcessResults> {
        const failed = { type: BotCommandProcessResultType.DidNotSucceed };

        const client = await use_client(queryable, "JumproleCreate.activate");

        const get_tier = await Tier.Get(args.tier, message.guild.id, client);

        switch (get_tier.result) {
            case GetTierResultType.InvalidName: {
                await reply(`invalid tier name.`);
                client.handle_release();
                return failed;
            }
            case GetTierResultType.InvalidServer: {
                await reply(`an unknown internal error caused message.guild.id to be an invalid Snowflake. Contact @${MAINTAINER_TAG} for help.`);
                log(`jumprole create: Tier.get - an unknown internal error caused message.guild.id to be an invalid Snowflake.`, LogType.Error);
                client.handle_release();
                return failed;
            }
            case GetTierResultType.NoMatchingEntries: {
                await reply(`no tier with name "${args.tier} exists in this server."`);
                client.handle_release();
                return failed;
            }
            case GetTierResultType.QueryFailed: {
                await reply(`an unknown internal error caused the database query to fail. Contact @${MAINTAINER_TAG} for help.`);
                client.handle_release();
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
                        added_by: message.author.id,
                        server: message.guild.id,
                    },
                    queryable,
                );
                client.handle_release();

                switch (query_result.type) {
                    case CreateJumproleResultType.Success: {
                        await GiveCheck(message);
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
