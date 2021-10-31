import { Client } from "discord.js";
import { Queryable, UsesClient, use_client } from "../../../pg_wrapper.js";

import { BotCommandProcessResults, BotCommandProcessResultType, GiveCheck, Subcommand } from "../../../functions.js";
import { MAINTAINER_TAG } from "../../../main.js";
import { validate } from "../../../module_decorators.js";
import { Permissions } from "../../../utilities/permissions.js";
import { Jumprole, DeleteJumproleResult, GetJumproleResultType } from "./internals/jumprole_type.js";
//import { DeleteJumproleResult, delete_jumprole } from "./internals/jumprole_postgres.js";
import { ValidatedArguments } from "../../../utilities/argument_processing/arguments_types.js";
import { TextChannelMessage } from "../../../utilities/typeutils.js";
import { log, LogType } from "../../../utilities/log.js";
import { Jumprole as JumproleCommand } from "./jumprole_cmd.js";

export class JumproleRemove extends Subcommand<typeof JumproleRemove.manual> {
    constructor() {
        super(JumproleCommand.manual, JumproleRemove.manual, JumproleRemove.no_use_no_see, JumproleRemove.permissions);
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
        syntax: "::<prefix>jumprole remove:: NAME $1",
        compact_syntaxes: true,
    } as const;

    static readonly no_use_no_see = false;
    static readonly permissions = undefined as Permissions | undefined;

    @validate
    async activate(
        values: ValidatedArguments<typeof JumproleRemove.manual>,
        message: TextChannelMessage,
        _client: Client,
        queryable: Queryable<UsesClient>,
        prefix: string,
    ): Promise<BotCommandProcessResults> {
        const reply = async function (response: string, use_prefix = true) {
            await message.channel.send(`${use_prefix ? `${prefix}jumprole remove: ` : ""}${response}`);
        };
        const failed = { type: BotCommandProcessResultType.DidNotSucceed };
        const name = values.name;

        const client = await use_client(queryable, "JumproleRemove.activate");

        const instance = await Jumprole.Get(name, message.guild.id, client);
        switch (instance.type) {
            case GetJumproleResultType.InvalidName: {
                await reply(`invalid jump name. Contact @${MAINTAINER_TAG} for help as this should have been caught earlier.`);
                client.handle_release();
                return { type: BotCommandProcessResultType.Invalid };
            }
            case GetJumproleResultType.InvalidServerSnowflake: {
                log(
                    `jumprole remove: Jumprole.Get with arguments [${name}, ${message.guild.id}] failed with error GetJumproleResultType.InvalidServerSnowflake.`,
                    LogType.Error,
                );
                await reply(
                    `an unknown error caused Jumprole.Get to return GetJumproleResultType.InvalidServerSnowflake. Contact @${MAINTAINER_TAG} for help.`,
                );
                client.handle_release();
                return failed;
            }
            case GetJumproleResultType.GetTierWithIDFailed: {
                await reply(
                    "an unknown error caused Jumprole.Get to fail with error GetJumproleResultType.GetTierWithIDFailed. It is possible that its tier was deleted.",
                );
                log(
                    `jumprole remove: Jumprole.Get with arguments [${name}, ${message.guild.id}] unexpectedly failed with error GetJumproleResultType.GetTierWithIDFailed.`,
                    LogType.Error,
                );
                client.handle_release();
                return failed;
            }
            case GetJumproleResultType.NoneMatched: {
                await reply(`a jump with that name doesn't exist in this server. You can list all roles with \`${prefix}tj list\`.`);
                client.handle_release();
                return failed;
            }
            case GetJumproleResultType.QueryFailed: {
                await reply(`an unknown error occurred (query failure). Contact @${MAINTAINER_TAG} for help.`);
                client.handle_release();
                return failed;
            }
            case GetJumproleResultType.Unknown: {
                log(
                    `jumprole remove: Jumprole.Get with arguments [${name}, ${message.guild.id}] unexpectedly failed with error GetJumproleResultType.Unknown.`,
                );
                await reply(`an unknown error occurred after Jumprole.Get. Contact @${MAINTAINER_TAG} for help.`);
                client.handle_release();
                return failed;
            }
            case GetJumproleResultType.Success: {
                const result = await instance.jumprole.delete(client);
                client.handle_release();

                switch (result) {
                    case DeleteJumproleResult.Success: {
                        await GiveCheck(message);
                        return { type: BotCommandProcessResultType.Succeeded };
                    }
                    case DeleteJumproleResult.QueryFailed: {
                        await reply(`an unknown internal error caused the database query to fail. Contact @${MAINTAINER_TAG} for help.`);
                        return failed;
                    }
                }
            }
        }
    }
}
