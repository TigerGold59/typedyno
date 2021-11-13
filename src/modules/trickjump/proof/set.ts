import { Client } from "discord.js";
import { UsingClient } from "../../../pg_wrapper.js";

import { BotCommandProcessResults, BotCommandProcessResultType, BotInteraction, Replier, Subcommand } from "../../../functions.js";

import { log, LogType } from "../../../utilities/log.js";
import { MAINTAINER_TAG } from "../../../main.js";
import { ValidatedArguments } from "../../../utilities/argument_processing/arguments_types.js";
import { GetJumproleResultType, TwitterLink } from "../jumprole/internals/jumprole_type.js";
import { Jumprole } from "../jumprole/internals/jumprole_type.js";
import { GetJumproleEntryByJumproleAndHolderResultType, JumproleEntry, SetJumproleEntryLinkResult } from "../tj/internals/entry_type.js";

export class ProofSet extends Subcommand<typeof ProofSet.manual> {
    constructor() {
        super();
    }

    static readonly manual = {
        name: "set",
        arguments: [
            {
                name: "jump name",
                id: "jumprole_name",
                optional: false,
                short_description: "name",
                base_type: "STRING",
            },
            {
                name: "link",
                id: "link",
                optional: false,
                further_constraint: TwitterLink,
                short_description: "Twitter link",
                base_type: "STRING",
            },
        ],
        syntax: "::<prefix>proof set:: NAME $1 LINK $2",
        description: "Set the proof for a jumprole you have.",
    } as const;

    readonly manual = ProofSet.manual;
    readonly no_use_no_see = false;
    readonly permissions = undefined;

    // eslint-disable-next-line complexity
    async activate(
        values: ValidatedArguments<typeof ProofSet.manual>,
        interaction: BotInteraction,
        _client: Client,
        pg_client: UsingClient,
        prefix: string,
        reply: Replier,
    ): Promise<BotCommandProcessResults> {
        const failed = { type: BotCommandProcessResultType.DidNotSucceed };

        let jumprole_result = await Jumprole.Get(values.jumprole_name, interaction.guild.id, pg_client);

        switch (jumprole_result.type) {
            case GetJumproleResultType.InvalidName: {
                await reply(`invalid jump name. Contact @${MAINTAINER_TAG} for help as this should have been caught earlier.`);

                return { type: BotCommandProcessResultType.Invalid };
            }
            case GetJumproleResultType.InvalidServerSnowflake: {
                log(
                    `proof set: Jumprole.Get with arguments [${values.jumprole_name}, ${interaction.guild.id}] failed with error GetJumproleResultType.InvalidServerSnowflake.`,
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
                    `proof set: Jumprole.Get with arguments [${values.jumprole_name}, ${interaction.guild.id}] unexpectedly failed with error GetJumproleResultType.GetTierWithIDFailed.`,
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
                    `proof set: Jumprole.Get with arguments [${values.jumprole_name}, ${interaction.guild.id}] unexpectedly failed with error GetJumproleResultType.Unknown.`,
                );
                await reply(`an unknown error occurred after Jumprole.Get. Contact @${MAINTAINER_TAG} for help.`);

                return failed;
            }
            case GetJumproleResultType.Success: {
                let jumprole = jumprole_result.jumprole;
                let result = await JumproleEntry.Get(interaction.author.id, jumprole_result.jumprole, pg_client);

                switch (result.type) {
                    case GetJumproleEntryByJumproleAndHolderResultType.NoneMatched: {
                        await reply(`you don't have that role on this server.`);
                        return failed;
                    }
                    case GetJumproleEntryByJumproleAndHolderResultType.QueryFailed: {
                        log(`proof set: JumproleEntry.Get returned a query failure. Notifying the user...`, LogType.Error);
                        await reply(`an unknown internal error occurred (query failure). Contact @${MAINTAINER_TAG} for help.`);
                        return failed;
                    }
                    case GetJumproleEntryByJumproleAndHolderResultType.InvalidHolderSnowflake: {
                        log(
                            `proof set: JumproleEntry.Get did not accept holder snowflake '${interaction.author.id}'. Returning status to indicate failure...'`,
                            LogType.Error,
                        );
                        await reply(`an unknown internal error occurred (did not accept holder snowflake). Contact @${MAINTAINER_TAG} for help.`);
                        return failed;
                    }
                    case GetJumproleEntryByJumproleAndHolderResultType.InvalidJumprole: {
                        log(
                            `proof set: JumproleEntry.Get did not accept Jumprole object (instance: ${
                                jumprole instanceof Jumprole
                            }). Returning status to indicate failure...'`,
                            LogType.Error,
                        );
                        await reply(`an unknown internal error occurred (did not accept Jumprole object). Contact @${MAINTAINER_TAG} for help.`);
                        return failed;
                    }
                    case GetJumproleEntryByJumproleAndHolderResultType.Success: {
                        let set_link_result = await result.entry.set_link(values.link, pg_client);
                        switch (set_link_result) {
                            case SetJumproleEntryLinkResult.Success: {
                                await interaction.give_check();
                                return { type: BotCommandProcessResultType.Succeeded };
                            }
                            case SetJumproleEntryLinkResult.QueryFailed: {
                                await reply(`an unknown error occurred (query failure). Contact @${MAINTAINER_TAG} for help.`);

                                return failed;
                            }
                            case SetJumproleEntryLinkResult.InvalidLink: {
                                await reply(
                                    `the link provided was not a valid Twitter link. Links must fit the following format: 'https://twitter.com/<username>/status/<tweet snowflake>'.`,
                                );
                            }
                        }
                        return failed;
                    }
                }
            }
        }
    }
}
