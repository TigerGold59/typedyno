import { Client } from "discord.js";
import { UsingClient } from "../../../pg_wrapper.js";

import { BotCommandProcessResults, BotCommandProcessResultType, GiveCheck, Replier, Subcommand } from "../../../functions.js";

import { log, LogType } from "../../../utilities/log.js";
import { ValidatedArguments } from "../../../utilities/argument_processing/arguments_types.js";
import { TextChannelMessage } from "../../../utilities/typeutils.js";
import { GetJumproleResultType, Jumprole, TwitterLink } from "../jumprole/internals/jumprole_type.js";
import { MAINTAINER_TAG } from "../../../main.js";
import { JumproleEntry, RegisterJumproleEntryResultType } from "./internals/entry_type.js";

export class TJGive extends Subcommand<typeof TJGive.manual> {
    constructor() {
        super();
    }

    static readonly manual = {
        name: "give",
        arguments: [
            {
                name: "jump name",
                id: "jumprole_name",
                optional: false,
                slash_command_description: "jump name",
            },
            {
                name: "link to Twitter video",
                id: "proof_link",
                optional: true,
                further_constraint: TwitterLink,
                slash_command_description: "Twitter link",
            },
        ],
        syntax: "::<prefix>tj give:: NAME $1{opt $2}[ PROOF $2]",
        description: "Give yourself a Jumprole in the current server.",
        supports_slash_commands: true,
    } as const;

    readonly manual = TJGive.manual;
    readonly no_use_no_see = false;
    readonly permissions = undefined;

    // eslint-disable-next-line complexity
    async activate(
        values: ValidatedArguments<typeof TJGive.manual>,
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
                    `tj give: Jumprole.Get with arguments [${values.jumprole_name}, ${message.guild.id}] failed with error GetJumproleResultType.InvalidServerSnowflake.`,
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
                    `tj give: Jumprole.Get with arguments [${values.jumprole_name}, ${message.guild.id}] unexpectedly failed with error GetJumproleResultType.GetTierWithIDFailed.`,
                    LogType.Error,
                );

                return failed;
            }
            case GetJumproleResultType.NoneMatched: {
                await reply(`a jump with that name doesn't exist in this server. You can list all roles with \`${prefix}tj all\`.`);

                return failed;
            }
            case GetJumproleResultType.QueryFailed: {
                await reply(`${prefix}tj give: an unknown error occurred (query failure). Contact @${MAINTAINER_TAG} for help.`);

                return failed;
            }
            case GetJumproleResultType.Unknown: {
                log(
                    `tj give: Jumprole.Get with arguments [${values.jumprole_name}, ${message.guild.id}] unexpectedly failed with error GetJumproleResultType.Unknown.`,
                );
                await reply(`an unknown error occurred after Jumprole.Get. Contact @${MAINTAINER_TAG} for help.`);

                return failed;
            }
            case GetJumproleResultType.Success: {
                let jumprole = jumprole_result.jumprole;
                let result = await JumproleEntry.Register(message.author.id, jumprole, values.proof_link, pg_client);

                switch (result.type) {
                    case RegisterJumproleEntryResultType.JumproleEntryAlreadyExists: {
                        await reply(`you already have that role on this server.`);
                        return failed;
                    }
                    case RegisterJumproleEntryResultType.QueryFailed: {
                        log(`tj give: JumproleEntry.Register returned a query failure. Notifying the user...`, LogType.Error);
                        await reply(`an unknown internal error occurred (query failure). Contact @${MAINTAINER_TAG} for help.`);
                        return failed;
                    }
                    case RegisterJumproleEntryResultType.InvalidHolderSnowflake: {
                        log(
                            `tj give: JumproleEntry.Register did not accept holder snowflake '${message.author.id}'. Returning status to indicate failure...'`,
                            LogType.Error,
                        );
                        await reply(`an unknown internal error occurred (did not accept holder snowflake). Contact @${MAINTAINER_TAG} for help.`);
                        return failed;
                    }
                    case RegisterJumproleEntryResultType.InvalidJumprole: {
                        log(
                            `tj give: JumproleEntry.Register did not accept Jumprole object (instance: ${
                                jumprole instanceof Jumprole
                            }). Returning status to indicate failure...'`,
                            LogType.Error,
                        );
                        await reply(`an unknown internal error occurred (did not accept Jumprole object). Contact @${MAINTAINER_TAG} for help.`);
                        return failed;
                    }
                    case RegisterJumproleEntryResultType.InvalidLink: {
                        await reply(
                            `invalid link. A jumprole entry's proof link must be between 1 and 150 characters, and be in the Twitter link format.`,
                        );
                        return failed;
                    }
                    case RegisterJumproleEntryResultType.Success: {
                        await GiveCheck(message);
                        return { type: BotCommandProcessResultType.Succeeded };
                    }
                }
            }
        }
    }
}
