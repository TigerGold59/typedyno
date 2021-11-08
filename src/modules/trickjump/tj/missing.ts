import { Client } from "discord.js";
import { UsingClient } from "../../../pg_wrapper.js";

import { BotCommandProcessResults, BotCommandProcessResultType, Replier, Subcommand } from "../../../functions.js";

import { log, LogType } from "../../../utilities/log.js";
import { is_string, TextChannelMessage } from "../../../utilities/typeutils.js";
import { MAINTAINER_TAG, USER_ID_FAQ } from "../../../main.js";
import { ValidatedArguments } from "../../../utilities/argument_processing/arguments_types.js";
import { create_paste, Paste, url } from "../../../integrations/paste_ee.js";
import { BULK_JUMPROLE_JOIN, BULK_JUMPROLE_QUERY_FIELDS, FromJumproleQueryResultType, Jumprole } from "../jumprole/internals/jumprole_type.js";
import { is_valid_Snowflake } from "../../../utilities/permissions.js";
import * as RT from "../../../utilities/runtime_typeguard/standard_structures.js";
export class TJMissing extends Subcommand<typeof TJMissing.manual> {
    constructor() {
        super();
    }

    static readonly manual = {
        name: "missing",
        arguments: [
            {
                name: "user ID",
                id: "source",
                optional: true,
                further_constraint: RT.Snowflake,
                slash_command_description: "user",
            },
        ],
        syntax: "::<prefix>tj missing::{opt $1}[ SOURCE $1]",
        description: "List all the Jumproles that the source (or the user if source is not provided) is missing.",
        supports_slash_commands: true,
    } as const;

    readonly manual = TJMissing.manual;
    readonly no_use_no_see = false;
    readonly permissions = undefined;

    // eslint-disable-next-line complexity
    async activate(
        values: ValidatedArguments<typeof TJMissing.manual>,
        message: TextChannelMessage,
        _client: Client,
        pg_client: UsingClient,
        _prefix: string,
        reply: Replier,
    ): Promise<BotCommandProcessResults> {
        const failed = { type: BotCommandProcessResultType.DidNotSucceed };

        let user_intention = values.source === null ? message.author.id : values.source;

        if (is_valid_Snowflake(user_intention) === false) {
            await reply(`invalid user ID. ${USER_ID_FAQ}`);
            return failed;
        }

        let entry_results = await Jumprole.FromQuery(
            `SELECT ${BULK_JUMPROLE_QUERY_FIELDS} FROM trickjump_jumps ${BULK_JUMPROLE_JOIN} WHERE trickjump_jumps.server=$1 AND NOT EXISTS (SELECT * FROM trickjump_entries WHERE trickjump_entries.server=$2 AND trickjump_entries.holder=$3 AND trickjump_entries.jump_id=trickjump_jumps.id)`,
            [message.guild.id, message.guild.id, user_intention],
            pg_client,
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
