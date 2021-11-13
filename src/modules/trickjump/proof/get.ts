import { Client } from "discord.js";
import { UsingClient } from "../../../pg_wrapper.js";

import { BotCommandProcessResults, BotCommandProcessResultType, BotInteraction, Replier, Subcommand } from "../../../functions.js";

import { log, LogType } from "../../../utilities/log.js";
import { MAINTAINER_TAG, NO_USER_EXISTS_MESSAGE } from "../../../main.js";
import { ValidatedArguments } from "../../../utilities/argument_processing/arguments_types.js";
import { GetJumproleResultType } from "../jumprole/internals/jumprole_type.js";
import { Jumprole } from "../jumprole/internals/jumprole_type.js";
import { GetJumproleEntryByJumproleAndHolderResultType, JumproleEntry } from "../tj/internals/entry_type.js";
import * as RT from "../../../utilities/runtime_typeguard/standard_structures.js";
import { get_user_tag } from "../../../utilities/typeutils.js";
export class ProofGet extends Subcommand<typeof ProofGet.manual> {
    constructor() {
        super();
    }

    static readonly manual = {
        name: "get",
        arguments: [
            {
                name: "jump name",
                id: "jumprole_name",
                optional: false,
                short_description: "jump name",
                base_type: "STRING",
            },
            {
                name: "user ID",
                id: "source",
                optional: true,
                further_constraint: RT.Snowflake,
                short_description: "user",
                base_type: "USER",
            },
        ],
        syntax: "::<prefix>proof get:: NAME $1{opt $2}[ USER $2]",
        description: "Get the proof for a Jumprole you or someone else has.",
    } as const;

    readonly manual = ProofGet.manual;
    readonly no_use_no_see = false;
    readonly permissions = undefined;

    // eslint-disable-next-line complexity
    async activate(
        values: ValidatedArguments<typeof ProofGet.manual>,
        interaction: BotInteraction,
        client: Client,
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
                    `proof get: Jumprole.Get with arguments [${values.jumprole_name}, ${interaction.guild.id}] failed with error GetJumproleResultType.InvalidServerSnowflake.`,
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
                    `proof get: Jumprole.Get with arguments [${values.jumprole_name}, ${interaction.guild.id}] unexpectedly failed with error GetJumproleResultType.GetTierWithIDFailed.`,
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
                    `proof get: Jumprole.Get with arguments [${values.jumprole_name}, ${interaction.guild.id}] unexpectedly failed with error GetJumproleResultType.Unknown.`,
                );
                await reply(`an unknown error occurred after Jumprole.Get. Contact @${MAINTAINER_TAG} for help.`);

                return failed;
            }
            case GetJumproleResultType.Success: {
                let jumprole = jumprole_result.jumprole;
                let user_intention = values.source === null ? interaction.author.id : values.source;
                let user_tag = await get_user_tag(user_intention, client);
                if (user_tag === false) {
                    await reply(NO_USER_EXISTS_MESSAGE);
                    return { type: BotCommandProcessResultType.DidNotSucceed };
                }
                let result = await JumproleEntry.Get(user_intention, jumprole_result.jumprole, pg_client);

                switch (result.type) {
                    case GetJumproleEntryByJumproleAndHolderResultType.NoneMatched: {
                        await reply(
                            `${user_intention === interaction.author.id ? "you don't" : `User ${user_tag} doesn't`} have that role on this server.`,
                        );
                        return failed;
                    }
                    case GetJumproleEntryByJumproleAndHolderResultType.QueryFailed: {
                        log(`proof get: JumproleEntry.Get returned a query failure. Notifying the user...`, LogType.Error);
                        await reply(`an unknown internal error occurred (query failure). Contact @${MAINTAINER_TAG} for help.`);
                        return failed;
                    }
                    case GetJumproleEntryByJumproleAndHolderResultType.InvalidHolderSnowflake: {
                        log(
                            `proof get: JumproleEntry.Get did not accept holder snowflake '${interaction.author.id}'. Returning status to indicate failure...'`,
                            LogType.Error,
                        );
                        await reply(`an unknown internal error occurred (did not accept holder snowflake). Contact @${MAINTAINER_TAG} for help.`);
                        return failed;
                    }
                    case GetJumproleEntryByJumproleAndHolderResultType.InvalidJumprole: {
                        log(
                            `proof get: JumproleEntry.Get did not accept Jumprole object (instance: ${
                                jumprole instanceof Jumprole
                            }). Returning status to indicate failure...'`,
                            LogType.Error,
                        );
                        await reply(`an unknown internal error occurred (did not accept Jumprole object). Contact @${MAINTAINER_TAG} for help.`);
                        return failed;
                    }
                    case GetJumproleEntryByJumproleAndHolderResultType.Success: {
                        let link = result.entry.link;

                        if (link === null) {
                            await reply(
                                `${
                                    user_intention === interaction.author.id ? "you don't" : `user ${user_tag} doesn't`
                                } have any proof posted for that jump.`,
                            );
                        } else await interaction.reply(link);
                        return { type: BotCommandProcessResultType.Succeeded };
                    }
                }
            }
        }
    }
}
