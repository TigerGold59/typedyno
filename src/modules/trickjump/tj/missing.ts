import { Client } from "discord.js";
import { Queryable, UsesClient, use_client } from "../../../pg_wrapper.js";

import { BotCommandProcessResults, BotCommandProcessResultType, Subcommand } from "../../../functions.js";
import { validate } from "../../../module_decorators.js";
import { log, LogType } from "../../../utilities/log.js";
import { TJ } from "./tj_cmd.js";
import { is_string, TextChannelMessage } from "../../../utilities/typeutils.js";
import { MAINTAINER_TAG, USER_ID_FAQ } from "../../../main.js";
import { ValidatedArguments } from "../../../utilities/argument_processing/arguments_types.js";
import { create_paste, Paste, url } from "../../../integrations/paste_ee.js";
import { FromJumproleQueryResultType, Jumprole } from "../jumprole/internals/jumprole_type.js";
import { is_valid_Snowflake } from "../../../utilities/permissions.js";

export class TJMissing extends Subcommand<typeof TJMissing.manual> {
    constructor() {
        super(TJ.manual, TJMissing.manual, TJMissing.no_use_no_see, TJMissing.permissions);
    }

    static readonly manual = {
        name: "missing",
        arguments: [
            {
                name: "user ID",
                id: "source",
                optional: true,
            },
        ],
        syntax: "::<prefix>tj missing::{opt $1}[ SOURCE $1]",
        description: "List all the Jumproles that the source (or the user if source is not provided) is missing.",
    } as const;

    static readonly no_use_no_see = false;
    static readonly permissions = undefined;

    @validate
    // eslint-disable-next-line complexity
    async activate(
        values: ValidatedArguments<typeof TJMissing.manual>,
        message: TextChannelMessage,
        _client: Client,
        queryable: Queryable<UsesClient>,
        prefix: string,
    ): Promise<BotCommandProcessResults> {
        const reply = async function (response: string) {
            await message.channel.send(`${prefix}tj missing: ${response}`);
        };

        const client = await use_client(queryable, "TJMissing.activate");

        const failed = { type: BotCommandProcessResultType.DidNotSucceed };

        let user_intention = values.source === null ? message.author.id : values.source;

        if (is_valid_Snowflake(user_intention) === false) {
            await reply(`invalid user ID. ${USER_ID_FAQ}`);
            return failed;
        }

        let entry_results = await Jumprole.FromQuery(
            `SELECT * FROM trickjump_jumps WHERE server=$1 AND NOT EXISTS (SELECT * FROM trickjump_entries WHERE server=$2 AND holder=$3 AND trickjump_entries.jump_id=trickjump_jumps.id)`,
            [message.guild.id, message.guild.id, user_intention],
            client,
        );

        switch (entry_results.type) {
            case FromJumproleQueryResultType.Success: {
                let roles = entry_results.values;

                const head = `Missing Trickjumps for User with ID ${user_intention}\n${"=".repeat(36 + user_intention.length)}\n\nMissing jumps: ${
                    roles.length
                }\n\n`;

                let tiered = roles.sort((a, b) => b.tier.ordinal - a.tier.ordinal);

                let last = tiered[0].tier.id;

                let tiers = ``;

                let tail = ``;

                let partitioned: Jumprole[][] = [[]];

                for (const entry of tiered) {
                    if (entry.tier.id !== last) {
                        last = entry.tier.id;
                        partitioned.push([entry]);
                    } else {
                        partitioned[partitioned.length - 1].push(entry);
                    }
                }

                for (const list of partitioned) {
                    let tier = list[0].tier;
                    tail += `\n${tier.name} (${list.length.toString()})\n${"-".repeat(3 + tier.name.length + list.length.toString().length)}\n`;
                    tiers += `${tier.name} - Rank ${tier.ordinal}\n`;
                    for (const entry of list) {
                        tail += `${entry.name}\n`;
                    }
                }
                tiers += "\n";

                let link = await create_paste(head + tiers + tail);
                if (is_string(link.paste?.id)) {
                    await reply(
                        `${user_intention === message.author.id ? "you are missing" : `user with ID ${user_intention} is missing`} ${
                            roles.length
                        } jump${roles.length === 1 ? "" : "s"} - view ${roles.length === 1 ? "it" : "them"} at ${url(link.paste as Paste)}`,
                    );
                } else {
                    await reply(`error creating paste. Contact @${MAINTAINER_TAG} for help.`);
                    log(link.error, LogType.Error);
                }
                return { type: BotCommandProcessResultType.Succeeded };
            }
            case FromJumproleQueryResultType.NoJumproles: {
                await reply(
                    `${user_intention === message.author.id ? "you aren't missing" : `user with ID ${user_intention} isn't missing`} any jumps.`,
                );
                return failed;
            }
            case FromJumproleQueryResultType.QueryFailed: {
                await reply(`an internal error has occurred (query failure). Contact @${MAINTAINER_TAG} for help.`);
                return failed;
            }
            case FromJumproleQueryResultType.FromRowFailed: {
                await reply(
                    `an internal error has occurred (Jumprole.InServer returned InServerResultType.FromRowFailed). Contact @${MAINTAINER_TAG} for help.`,
                );
                return failed;
            }
        }
    }
}
