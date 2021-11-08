import { Client, User } from "discord.js";
import { UsingClient } from "../../../pg_wrapper.js";

import { BotCommandProcessResults, BotCommandProcessResultType, Replier, Subcommand } from "../../../functions.js";

import { log, LogType } from "../../../utilities/log.js";
import { is_string, TextChannelMessage } from "../../../utilities/typeutils.js";
import { MAINTAINER_TAG, USER_ID_FAQ } from "../../../main.js";
import { ValidatedArguments } from "../../../utilities/argument_processing/arguments_types.js";
import { GetJumproleEntriesWithHolderResultType, JumproleEntry, JumproleEntryUpToDateResultType } from "./internals/entry_type.js";
import { create_paste, Paste, url } from "../../../integrations/paste_ee.js";
import * as RT from "../../../utilities/runtime_typeguard/standard_structures.js";

export class TJList extends Subcommand<typeof TJList.manual> {
    constructor() {
        super();
    }

    static readonly manual = {
        name: "list",
        arguments: [
            {
                name: "user ID",
                id: "source",
                optional: true,
                further_constraint: RT.Snowflake,
            },
            {
                name: "yes or no",
                id: "proof",
                optional: true,
                further_constraint: RT.BooleanS,
            },
            {
                name: "y/n",
                id: "proof_present",
                optional: true,
                further_constraint: RT.BooleanS,
            },
        ],
        syntax: "::<prefix>tj list::{opt $1}[ SOURCE $1]{opt $2}[ SHOW PROOF $2]{opt $3}[ PROOF PRESENT $3]",
        description: "Get Jumprole information.",
    } as const;

    readonly manual = TJList.manual;
    readonly no_use_no_see = false;
    readonly permissions = undefined;

    // eslint-disable-next-line complexity
    async activate(
        values: ValidatedArguments<typeof TJList.manual>,
        message: TextChannelMessage,
        client: Client,
        pg_client: UsingClient,
        prefix: string,
        reply: Replier,
    ): Promise<BotCommandProcessResults> {
        const failed = { type: BotCommandProcessResultType.DidNotSucceed };

        let user_intention = values.source === null ? message.author.id : values.source;
        let proof_intention = values.proof === null ? false : values.proof;
        const proof_present_filter = (val: JumproleEntry): boolean => {
            if (values.proof_present === null) return true;
            else {
                return (val.link !== null) === values.proof_present;
            }
        };

        let entry_results = await JumproleEntry.WithHolderInServer(user_intention, message.guild.id, pg_client);

        switch (entry_results.type) {
            case GetJumproleEntriesWithHolderResultType.Success: {
                let roles = entry_results.values;

                let user: User | null;
                try {
                    user = await client.users.fetch(user_intention);
                } catch (err) {
                    user = null;
                }
                if (user === null) {
                    await reply(`no user exists with that ID.`);
                    return { type: BotCommandProcessResultType.DidNotSucceed };
                } else {
                    if (roles.length === 0) {
                        await reply(`${user_intention === message.author.id ? "you have" : `user ${user.tag} has`} no jumproles.`);
                        return { type: BotCommandProcessResultType.Succeeded };
                    }

                    let qualifier = values.proof_present === null ? " " : values.proof_present ? " With Proof " : " Without Proof ";

                    const head = `Trickjumps${qualifier}for User ${user.tag}\n${"=".repeat(
                        19 + qualifier.length + user.tag.length,
                    )}\n\n* - the jump has been changed since it was given.\nConfirm that completion of the jump still applies using '${prefix}tj confirm'.\n\n`;

                    let tiered = roles.sort((a, b) => b.jumprole.tier.ordinal - a.jumprole.tier.ordinal).filter(proof_present_filter);

                    if (tiered.length < 1 && values.proof_present !== null) {
                        await reply(
                            `${user_intention === message.author.id ? "you have" : `user ${user.tag} has`} no jumproles for which proof was${
                                values.proof_present ? "" : "n't"
                            } set.`,
                        );
                    }

                    let last = tiered[0].jumprole.tier.id;

                    let tail = ``;

                    let partitioned: JumproleEntry[][] = [[]];

                    for (const entry of tiered) {
                        if (entry.jumprole.tier.id !== last) {
                            last = entry.jumprole.tier.id;
                            partitioned.push([entry]);
                        } else {
                            partitioned[partitioned.length - 1].push(entry);
                        }
                    }

                    partitioned.forEach(value => value.sort((a, b) => a.added_at - b.added_at));

                    for (const list of partitioned) {
                        let tier = list[0].jumprole.tier;
                        tail += `\n${tier.name}\n${"-".repeat(tier.name.length)}\n`;
                        for (const entry of list) {
                            let out_of_date = entry.up_to_date().type === JumproleEntryUpToDateResultType.Outdated;
                            let date = new Date(entry.added_at * 1000);
                            tail += `${entry.jumprole.name} - given ${date.toDateString()}${
                                proof_intention ? ` - ${entry.link === null ? "no proof" : `link: ${entry.link}`}` : ""
                            }${out_of_date ? " (*)" : ""}\n`;
                        }
                    }

                    let link = await create_paste(head + tail);
                    if (is_string(link.paste?.id)) {
                        await reply(
                            `${user_intention === message.author.id ? "you have" : `user with ID ${user_intention} has`} ${tiered.length} total jump${
                                tiered.length === 1 ? "" : "s"
                            }${values.proof_present === null ? " " : values.proof_present ? " with proof " : " without proof "}- view ${
                                tiered.length === 1 ? "it" : "them"
                            } at ${url(link.paste as Paste)}`,
                        );
                    } else {
                        await reply(`error creating paste. Contact @${MAINTAINER_TAG} for help.`);
                        log(link.error, LogType.Error);
                    }
                    return { type: BotCommandProcessResultType.Succeeded };
                }
            }
            case GetJumproleEntriesWithHolderResultType.InvalidHolderSnowflake: {
                await reply(`invalid user ID. ${USER_ID_FAQ}`);
                return failed;
            }
            case GetJumproleEntriesWithHolderResultType.InvalidServerSnowflake: {
                log(
                    `tj list: JumproleEntry.WithHolderInServer returned GetJumproleEntriesWithHolderResultType.InvalidServerSnowflake for server snowflake ${message.guild.id}. Returning failed.`,
                    LogType.Error,
                );
                await reply(
                    `an internal error has occurred (JumproleEntry.WithHolderInServer returned GetJumproleEntriesWithHolderResultType.InvalidServerSnowflake). Contact @${MAINTAINER_TAG} for help.`,
                );
                return failed;
            }
            case GetJumproleEntriesWithHolderResultType.QueryFailed: {
                await reply(`an internal error has occurred (query failure). Contact @${MAINTAINER_TAG} for help.`);
                return failed;
            }
            case GetJumproleEntriesWithHolderResultType.GetJumproleFailed: {
                log(
                    `tj list: JumproleEntry.WithHolderInServer returned GetJumproleEntriesWithHolderResultType.GetJumproleFailed for holder snowflake ${user_intention} and server snowflake ${message.guild.id}. Returning failed.`,
                    LogType.Error,
                );
                await reply(
                    `an internal error has occurred (JumproleEntry.WithHolderInServer returned GetJumproleEntriesWithHolderResultType.GetJumproleFailed). Contact @${MAINTAINER_TAG} for help.`,
                );
                return failed;
            }
        }
    }
}
