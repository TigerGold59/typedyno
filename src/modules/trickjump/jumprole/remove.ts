import { Client } from "discord.js";
import { UsingClient } from "../../../pg_wrapper.js";

import { BotCommandProcessResults, BotCommandProcessResultType, BotInteraction, Replier, Subcommand } from "../../../functions.js";
import { MAINTAINER_TAG } from "../../../main.js";

import { Jumprole, DeleteJumproleResult, GetJumproleResultType } from "./internals/jumprole_type.js";
//import { DeleteJumproleResult, delete_jumprole } from "./internals/jumprole_postgres.js";
import { ValidatedArguments } from "../../../utilities/argument_processing/arguments_types.js";
import { log, LogType } from "../../../utilities/log.js";

export class JumproleRemove extends Subcommand<typeof JumproleRemove.manual> {
    constructor() {
        super();
    }

    static readonly manual = {
        name: "remove",
        arguments: [
            {
                name: "name",
                id: "name",
                optional: false,
                short_description: "current jump name",
                base_type: "STRING",
            },
        ],
        description: "Removes the given Jumprole and clears it from all users' Jumprole lists.",
        syntax: "::<prefix>jumprole remove:: NAME $1",
        compact_syntaxes: true,
    } as const;

    readonly manual = JumproleRemove.manual;
    readonly no_use_no_see = false;
    readonly permissions = undefined;

    async activate(
        values: ValidatedArguments<typeof JumproleRemove.manual>,
        interaction: BotInteraction,
        _client: Client,
        pg_client: UsingClient,
        prefix: string,
        reply: Replier,
    ): Promise<BotCommandProcessResults> {
        const failed = { type: BotCommandProcessResultType.DidNotSucceed };
        const name = values.name;

        const instance = await Jumprole.Get(name, interaction.guild.id, pg_client);
        switch (instance.type) {
            case GetJumproleResultType.InvalidName: {
                await reply(`invalid jump name. Contact @${MAINTAINER_TAG} for help as this should have been caught earlier.`);

                return { type: BotCommandProcessResultType.Invalid };
            }
            case GetJumproleResultType.InvalidServerSnowflake: {
                log(
                    `jumprole remove: Jumprole.Get with arguments [${name}, ${interaction.guild.id}] failed with error GetJumproleResultType.InvalidServerSnowflake.`,
                    LogType.Error,
                );
                await reply(
                    `an unknown error caused Jumprole.Get to return GetJumproleResultType.InvalidServerSnowflake. Contact @${MAINTAINER_TAG} for help.`,
                );

                return failed;
            }
            case GetJumproleResultType.GetTierWithIDFailed: {
                await reply(
                    "an unknown error caused Jumprole.Get to fail with error GetJumproleResultType.GetTierWithIDFailed. It is possible that its tier was deleted.",
                );
                log(
                    `jumprole remove: Jumprole.Get with arguments [${name}, ${interaction.guild.id}] unexpectedly failed with error GetJumproleResultType.GetTierWithIDFailed.`,
                    LogType.Error,
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
            case GetJumproleResultType.Unknown: {
                log(
                    `jumprole remove: Jumprole.Get with arguments [${name}, ${interaction.guild.id}] unexpectedly failed with error GetJumproleResultType.Unknown.`,
                );
                await reply(`an unknown error occurred after Jumprole.Get. Contact @${MAINTAINER_TAG} for help.`);

                return failed;
            }
            case GetJumproleResultType.Success: {
                const result = await instance.jumprole.delete(pg_client);

                switch (result) {
                    case DeleteJumproleResult.Success: {
                        await interaction.give_check();
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
