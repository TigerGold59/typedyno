import { Client, Guild, Message } from "discord.js";
import * as PG from "pg";

import { ArgumentValues, BotCommandProcessResults, BotCommandProcessResultType, GiveCheck, Subcommand } from "../../../functions.js";
import { MAINTAINER_TAG } from "../../../main.js";
import { validate } from "../../../module_decorators.js";
import { Permissions } from "../../../utilities/permissions.js";
import { DeleteJumproleResult, delete_jumprole } from "./internals/jumprole_postgres.js";

export class JumproleRemove extends Subcommand<typeof JumproleRemove.manual> {
    constructor() {
        super(JumproleRemove.manual, JumproleRemove.no_use_no_see, JumproleRemove.permissions);
    }

    static readonly manual = {
        name: "remove",
        arguments: [
            {
                name: "name",
                id: "name",
                optional: false,
            },
        ],
        description: "Removes the given Jumprole and clears it from all users' Jumprole lists.",
        syntax: "<prefix>jumprole remove $1",
    } as const;

    static readonly no_use_no_see = false;
    static readonly permissions = undefined as Permissions | undefined;

    @validate()
    async activate(
        values: ArgumentValues<typeof JumproleRemove.manual>,
        message: Message,
        _client: Client,
        pool: PG.Pool,
        prefix: string,
    ): Promise<BotCommandProcessResults> {
        const reply = message.channel.send;
        const failed = { type: BotCommandProcessResultType.DidNotSucceed };
        const name = values.name;

        const result = await delete_jumprole([name, (message.guild as Guild).id], pool);

        switch (result) {
            case DeleteJumproleResult.Success: {
                GiveCheck(message);
                return { type: BotCommandProcessResultType.Succeeded };
            }
            case DeleteJumproleResult.InvalidJumproleHandle: {
                await reply(
                    `${prefix}jumprole remove: an unknown internal error caused the JumproleHandle passed to delete_jumprole to be invalid. Contact @${MAINTAINER_TAG} for help.`,
                );
                return failed;
            }
            case DeleteJumproleResult.NoneMatchJumproleHandle: {
                await reply(`${prefix}jumprole remove: no Jumprole exists with that name.`);
                return failed;
            }
            case DeleteJumproleResult.QueryFailed: {
                await reply(
                    `${prefix}jumprole remove: an unknown internal error caused the database query to fail. Contact @${MAINTAINER_TAG} for help.`,
                );
                return failed;
            }
        }
    }
}