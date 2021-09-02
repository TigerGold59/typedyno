import { Client, Message, Snowflake } from "discord.js";
import { PoolInstance as Pool } from "../../../pg_wrapper.js";

import { BotCommandProcessResults, BotCommandProcessResultType, GiveCheck, Subcommand } from "../../../functions.js";
import { MAINTAINER_TAG } from "../../../main.js";
import { command, validate } from "../../../module_decorators.js";
import { log, LogType } from "../../../utilities/log.js";
import { Permissions } from "../../../utilities/permissions.js";
import { CreateJumproleResult, create_jumprole } from "./internals/jumprole_postgres.js";
import { Jumprole, KingdomNameToKingdom } from "./internals/jumprole_type.js";
import { ValidatedArguments } from "../../../utilities/argument_processing/arguments_types.js";

// TODO: Use INSERT INTO ... ON CONFLICT (name, server) DO UPDATE... query instead of checking if it already exists
@command()
export class JumproleSet extends Subcommand<typeof JumproleSet.manual> {
    constructor() {
        super(JumproleSet.manual, JumproleSet.no_use_no_see, JumproleSet.permissions);
    }

    static readonly manual = {
        name: "set",
        arguments: [
            {
                name: "name",
                id: "name",
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
        syntax: "<prefix>jumprole set NAME $1{opt $2}[ KINGDOM $2]{opt $3}[ LOCATION $3]{opt $4}[ JUMP TYPE $4]{opt $5}[ LINK $5] INFO $6",
    } as const;

    static readonly no_use_no_see = false;
    static readonly permissions = undefined as Permissions | undefined;

    @validate()
    async activate(
        args: ValidatedArguments<typeof JumproleSet.manual>,
        message: Message,
        _client: Client,
        pool: Pool,
        prefix: string | undefined,
    ): Promise<BotCommandProcessResults> {
        const reply = async function (response: string) {
            await message.channel.send(response);
        };
        const failed = { type: BotCommandProcessResultType.DidNotSucceed };

        const jumprole_object: Jumprole = {
            id: 0, // not used in create
            name: args.name,
            kingdom: args.kingdom === null ? null : KingdomNameToKingdom(args.kingdom),
            location: args.location,
            jump_type: args.jump_type,
            link: args.link,
            description: args.description,
            added_by: message.author.id,
            updated_at: Math.round(Date.now() / 1000),
            server: message.guild?.id as Snowflake,
            hash: "recomputed later",
        };

        const query_result = await create_jumprole(jumprole_object, pool);

        switch (query_result) {
            case CreateJumproleResult.Success: {
                await GiveCheck(message);
                return { type: BotCommandProcessResultType.Succeeded };
            }
            case CreateJumproleResult.QueryFailed: {
                await reply(
                    `${prefix}jumprole set: an unknown internal error caused the database query to fail. Contact @${MAINTAINER_TAG} for help.`,
                );
                return failed;
            }
            case CreateJumproleResult.InvalidJumproleObject: {
                await reply(
                    `${prefix}jumprole set: an unknown internal error caused the passed Jumprole object to be invalid. Contact @${MAINTAINER_TAG} for help.`,
                );
                return failed;
            }
            case CreateJumproleResult.JumproleAlreadyExists: {
                await reply(
                    `${prefix}jumprole set: A Jumprole with that name already exists. Please use '${prefix}jumprole update' in order to change already existing Jumproles.`,
                );
                return failed;
            }
            case CreateJumproleResult.NameTooLong: {
                await reply(`${prefix}jumprole set: The given name was too long (length: ${args.name.length.toString()} chars, limit: 100 chars).`);
                return failed;
            }
            case CreateJumproleResult.LinkTooLong: {
                await reply(
                    `${prefix}jumprole set: The given link was too long (length: ${(
                        args.link as string
                    ).length.toString()} chars, limit: 150 chars).`,
                );
                return failed;
            }
            case CreateJumproleResult.LocationTooLong: {
                await reply(
                    `${prefix}jumprole set: The given location was too long (length: ${(
                        args.location as string
                    ).length.toString()} chars, limit: 200 chars).`,
                );
                return failed;
            }
            case CreateJumproleResult.JumpTypeTooLong: {
                await reply(
                    `${prefix}jumprole set: The given jump type was too long (length: ${(
                        args.jump_type as string
                    ).length.toString()} chars, limit: 200 chars).`,
                );
                return failed;
            }
            case CreateJumproleResult.DescriptionTooLong: {
                await reply(
                    `${prefix}jumprole set: The given description was too long (length: ${(
                        args.description as string
                    ).length.toString()} chars, limit: 1500 chars).`,
                );
                return failed;
            }
            default: {
                log(
                    `jumprole_set: received invalid option in switch (CreateJumproleResult) that brought us to the default case. Informing the user of the error...`,
                    LogType.Error,
                );
                await reply(`${prefix}jumprole set: unknown internal error. Contact @${MAINTAINER_TAG} for help.`);
                return failed;
            }
        }
    }
}
