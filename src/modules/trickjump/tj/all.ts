import { Client } from "discord.js";
import { UsingClient } from "../../../pg_wrapper.js";

import { BotCommandProcessResults, BotCommandProcessResultType, Replier, Subcommand } from "../../../functions.js";

import { log, LogType } from "../../../utilities/log.js";
import { TJ } from "./tj_cmd.js";
import { is_string, TextChannelMessage } from "../../../utilities/typeutils.js";
import { MAINTAINER_TAG } from "../../../main.js";
import { ValidatedArguments } from "../../../utilities/argument_processing/arguments_types.js";
import { create_paste, Paste, url } from "../../../integrations/paste_ee.js";
import { FromJumproleQueryResultType, Jumprole } from "../jumprole/internals/jumprole_type.js";

export class TJAll extends Subcommand<typeof TJAll.manual> {
    constructor() {
        super(TJ.manual, TJAll.manual, TJAll.no_use_no_see, TJAll.permissions);
    }

    static readonly manual = {
        name: "all",
        arguments: [],
        syntax: "::<prefix>tj all::",
        description: "List all the Jumproles in the current server.",
    } as const;

    static readonly no_use_no_see = false;
    static readonly permissions = undefined;

    // eslint-disable-next-line complexity
    async activate(
        _values: ValidatedArguments<typeof TJAll.manual>,
        message: TextChannelMessage,
        _client: Client,
        pg_client: UsingClient,
        _prefix: string,
        reply: Replier,
    ): Promise<BotCommandProcessResults> {
        const failed = { type: BotCommandProcessResultType.DidNotSucceed };

        let entry_results = await Jumprole.InServer(message.guild.id, pg_client);

        switch (entry_results.type) {
            case FromJumproleQueryResultType.Success: {
                let roles = entry_results.values;

                const head = `Trickjumps in ${message.guild.name}\n${"=".repeat(14 + message.guild.name.length)}\n\nTotal jumps: ${roles.length}\n\n`;

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
                        `there ${roles.length === 1 ? "is" : "are"} ${roles.length} total jump${roles.length === 1 ? "" : "s"} - view ${
                            roles.length === 1 ? "it" : "them"
                        } at ${url(link.paste as Paste)}`,
                    );
                } else {
                    await reply(`error creating paste. Contact @${MAINTAINER_TAG} for help.`);
                    log(link.error, LogType.Error);
                }
                return { type: BotCommandProcessResultType.Succeeded };
            }
            case FromJumproleQueryResultType.NoJumproles: {
                await reply(`there are no Jumproles in this server.`);
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
