import { Client } from "discord.js";
import { UsingClient } from "../../../pg_wrapper.js";

import { BotCommandProcessResults, BotCommandProcessResultType, GiveCheck, Replier, Subcommand } from "../../../functions.js";

import { log, LogType } from "../../../utilities/log.js";
import { MAINTAINER_TAG } from "../../../main.js";
import { ValidatedArguments } from "../../../utilities/argument_processing/arguments_types.js";
import { TextChannelMessage } from "../../../utilities/typeutils.js";
import { GetJumproleResultType } from "../jumprole/internals/jumprole_type.js";
import { Jumprole } from "../jumprole/internals/jumprole_type.js";
import { ConfirmJumproleEntryResult, GetJumproleEntryByJumproleAndHolderResultType, JumproleEntry } from "./internals/entry_type.js";

export class TJConfirm extends Subcommand<typeof TJConfirm.manual> {
    constructor() {
        super();
    }

    static readonly manual = {
        name: "confirm",
        arguments: [
            {
                name: "jump name",
                id: "jumprole_name",
                optional: false,
                slash_command_description: "current jump name",
            },
        ],
        syntax: "::<prefix>tj confirm:: NAME $1",
        description: "Confirm that a completion still applies to the updated version of a Jumprole.",
        supports_slash_commands: true,
    } as const;

    readonly manual = TJConfirm.manual;
    readonly no_use_no_see = false;
    readonly permissions = undefined;

    // eslint-disable-next-line complexity
    async activate(
        values: ValidatedArguments<typeof TJConfirm.manual>,
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
                    `tj confirm: Jumprole.Get with arguments [${values.jumprole_name}, ${message.guild.id}] failed with error GetJumproleResultType.InvalidServerSnowflake.`,
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
                    `tj confirm: Jumprole.Get with arguments [${values.jumprole_name}, ${message.guild.id}] unexpectedly failed with error GetJumproleResultType.GetTierWithIDFailed.`,
                    LogType.Error,
                );

                return failed;
            }
            case GetJumproleResultType.NoneMatched: {
                await reply(`a jump with that name doesn't exist in this server. You can list all roles with \`${prefix}tj all\`.`);

                return failed;
            }
            case GetJumproleResultType.QueryFailed: {
                await reply(`${prefix}tj confirm: an unknown error occurred (query failure). Contact @${MAINTAINER_TAG} for help.`);

                return failed;
            }
            case GetJumproleResultType.Unknown: {
                log(
                    `tj confirm: Jumprole.Get with arguments [${values.jumprole_name}, ${message.guild.id}] unexpectedly failed with error GetJumproleResultType.Unknown.`,
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
                        log(`tj confirm: JumproleEntry.Get returned a query failure. Notifying the user...`, LogType.Error);
                        await reply(`an unknown internal error occurred (query failure). Contact @${MAINTAINER_TAG} for help.`);
                        return failed;
                    }
                    case GetJumproleEntryByJumproleAndHolderResultType.InvalidHolderSnowflake: {
                        log(
                            `tj confirm: JumproleEntry.Get did not accept holder snowflake '${message.author.id}'. Returning status to indicate failure...'`,
                            LogType.Error,
                        );
                        await reply(`an unknown internal error occurred (did not accept holder snowflake). Contact @${MAINTAINER_TAG} for help.`);
                        return failed;
                    }
                    case GetJumproleEntryByJumproleAndHolderResultType.InvalidJumprole: {
                        log(
                            `tj confirm: JumproleEntry.Get did not accept Jumprole object (instance: ${
                                jumprole instanceof Jumprole
                            }). Returning status to indicate failure...'`,
                            LogType.Error,
                        );
                        await reply(`an unknown internal error occurred (did not accept Jumprole object). Contact @${MAINTAINER_TAG} for help.`);
                        return failed;
                    }
                    case GetJumproleEntryByJumproleAndHolderResultType.Success: {
                        let confirm = await result.entry.confirm(pg_client);
                        switch (confirm) {
                            case ConfirmJumproleEntryResult.Confirmed: {
                                await GiveCheck(message);
                                return { type: BotCommandProcessResultType.Succeeded };
                            }
                            case ConfirmJumproleEntryResult.QueryFailed: {
                                await reply(`an internal error has occurred (query failure). Contact @${MAINTAINER_TAG} for help.`);
                                return failed;
                            }
                        }
                        return failed;
                    }
                }
            }
        }
    }
}
