import { Client } from "discord.js";
import { UsingClient } from "../../../pg_wrapper.js";

import { BotCommandProcessResults, BotCommandProcessResultType, GiveCheck, Replier, Subcommand } from "../../../functions.js";

import { log, LogType } from "../../../utilities/log.js";
import { MAINTAINER_TAG } from "../../../main.js";
import { ValidatedArguments } from "../../../utilities/argument_processing/arguments_types.js";
import { TextChannelMessage } from "../../../utilities/typeutils.js";
import { GetJumproleResultType } from "../jumprole/internals/jumprole_type.js";
import { Jumprole } from "../jumprole/internals/jumprole_type.js";
import { DeleteJumproleEntryResult, GetJumproleEntryByJumproleAndHolderResultType, JumproleEntry } from "./internals/entry_type.js";

export class TJRemove extends Subcommand<typeof TJRemove.manual> {
    constructor() {
        super();
    }

    static readonly manual = {
        name: "remove",
        arguments: [
            {
                name: "jump name",
                id: "jumprole_name",
                optional: false,
            },
        ],
        syntax: "::<prefix>tj remove:: NAME $1",
        description: "Remove a Jumprole from your list.",
    } as const;

    readonly manual = TJRemove.manual;
    readonly no_use_no_see = false;
    readonly permissions = undefined;

    // eslint-disable-next-line complexity
    async activate(
        values: ValidatedArguments<typeof TJRemove.manual>,
        message: TextChannelMessage,
        _client: Client,
        pg_client: UsingClient,
        prefix: string,
        reply: Replier,
    ): Promise<BotCommandProcessResults> {
        const failed = { type: BotCommandProcessResultType.DidNotSucceed };

        let jumprole_result = await Jumprole.Get(values.jumprole_name, message.guild.id, pg_client);

        switch (jumprole_result.type) {
            case GetJumproleResultType.InvalidName: {
                await reply(`invalid jump name. Contact @${MAINTAINER_TAG} for help as this should have been caught earlier.`);

                return { type: BotCommandProcessResultType.Invalid };
            }
            case GetJumproleResultType.InvalidServerSnowflake: {
                log(
                    `tj remove: Jumprole.Get with arguments [${values.jumprole_name}, ${message.guild.id}] failed with error GetJumproleResultType.InvalidServerSnowflake.`,
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
                    `tj remove: Jumprole.Get with arguments [${values.jumprole_name}, ${message.guild.id}] unexpectedly failed with error GetJumproleResultType.GetTierWithIDFailed.`,
                    LogType.Error,
                );

                return failed;
            }
            case GetJumproleResultType.NoneMatched: {
                await reply(`a jump with that name doesn't exist in this server. You can list all roles with \`${prefix}tj all\`.`);

                return failed;
            }
            case GetJumproleResultType.QueryFailed: {
                await reply(`${prefix}tj remove: an unknown error occurred (query failure). Contact @${MAINTAINER_TAG} for help.`);

                return failed;
            }
            case GetJumproleResultType.Unknown: {
                log(
                    `tj remove: Jumprole.Get with arguments [${values.jumprole_name}, ${message.guild.id}] unexpectedly failed with error GetJumproleResultType.Unknown.`,
                );
                await reply(`an unknown error occurred after Jumprole.Get. Contact @${MAINTAINER_TAG} for help.`);

                return failed;
            }
            case GetJumproleResultType.Success: {
                let jumprole = jumprole_result.jumprole;
                let result = await JumproleEntry.Get(message.author.id, jumprole_result.jumprole, pg_client);

                switch (result.type) {
                    case GetJumproleEntryByJumproleAndHolderResultType.NoneMatched: {
                        await reply(`you don't have that role on this server.`);
                        return failed;
                    }
                    case GetJumproleEntryByJumproleAndHolderResultType.QueryFailed: {
                        log(`tj remove: JumproleEntry.Get returned a query failure. Notifying the user...`, LogType.Error);
                        await reply(`an unknown internal error occurred (query failure). Contact @${MAINTAINER_TAG} for help.`);
                        return failed;
                    }
                    case GetJumproleEntryByJumproleAndHolderResultType.InvalidHolderSnowflake: {
                        log(
                            `tj remove: JumproleEntry.Get did not accept holder snowflake '${message.author.id}'. Returning status to indicate failure...'`,
                            LogType.Error,
                        );
                        await reply(`an unknown internal error occurred (did not accept holder snowflake). Contact @${MAINTAINER_TAG} for help.`);
                        return failed;
                    }
                    case GetJumproleEntryByJumproleAndHolderResultType.InvalidJumprole: {
                        log(
                            `tj remove: JumproleEntry.Get did not accept Jumprole object (instance: ${
                                jumprole instanceof Jumprole
                            }). Returning status to indicate failure...'`,
                            LogType.Error,
                        );
                        await reply(`an unknown internal error occurred (did not accept Jumprole object). Contact @${MAINTAINER_TAG} for help.`);
                        return failed;
                    }
                    case GetJumproleEntryByJumproleAndHolderResultType.Success: {
                        let deleted = await result.entry.delete(pg_client);
                        switch (deleted) {
                            case DeleteJumproleEntryResult.QueryFailed: {
                                log(`tj remove: JumproleEntry.delete returned a query failure. Notifying the user...`, LogType.Error);
                                await reply(`an unknown internal error occurred (query failure). Contact @${MAINTAINER_TAG} for help.`);
                                return failed;
                            }
                            case DeleteJumproleEntryResult.Success: {
                                await GiveCheck(message);
                                return { type: BotCommandProcessResultType.Succeeded };
                            }
                        }
                        return failed;
                    }
                }
            }
        }
    }
}
