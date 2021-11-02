import { Client } from "discord.js";
import { UsingClient } from "../../../pg_wrapper.js";

import { BotCommandProcessResults, BotCommandProcessResultType, GiveCheck, Replier, Subcommand } from "../../../functions.js";

import { TJ } from "./tj_cmd.js";
import { ValidatedArguments } from "../../../utilities/argument_processing/arguments_types.js";
import { query_failure, TextChannelMessage } from "../../../utilities/typeutils.js";
import * as RT from "../../../utilities/runtime_typeguard/standard_structures.js";
import { MAINTAINER_TAG } from "../../../main.js";

export class TJSet extends Subcommand<typeof TJSet.manual> {
    constructor() {
        super(TJ.manual, TJSet.manual, TJSet.no_use_no_see, TJSet.permissions);
    }

    static readonly manual = {
        name: "set",
        arguments: [
            {
                name: "yes or no",
                id: "all",
                optional: false,
                further_constraint: RT.BooleanS,
            },
        ],
        syntax: "::<prefix>tj set:: ALL $1",
        description: "Give yourself all or remove all of the Jumproles in the server.",
    } as const;

    static readonly no_use_no_see = false;
    static readonly permissions = undefined;

    // eslint-disable-next-line complexity
    async activate(
        values: ValidatedArguments<typeof TJSet.manual>,
        message: TextChannelMessage,
        _client: Client,
        pg_client: UsingClient,
        _prefix: string,
        reply: Replier,
    ): Promise<BotCommandProcessResults> {
        const failed = { type: BotCommandProcessResultType.DidNotSucceed };

        let query_string = `DELETE FROM trickjump_entries WHERE holder=$1 AND server=$2`;
        let query_params: unknown[] = [message.author.id, message.guild.id];

        try {
            await pg_client.query(query_string, query_params);
            query_string = `INSERT INTO trickjump_entries (jump_id, jump_hash, holder, server, added_at, updated_at) (SELECT id, hash, $1, trickjump_jumps.server, $2, $3 FROM trickjump_jumps WHERE server=$4)`;
            if (values.all) {
                let date = Math.round(Date.now() / 1000);
                query_params = [message.author.id, date, date, message.guild.id];
                await pg_client.query(query_string, query_params);
            }
            await GiveCheck(message);
            return { type: BotCommandProcessResultType.Succeeded };
        } catch (err) {
            await reply(`an internal error occurred (query failure). Contact @${MAINTAINER_TAG} for help.`);
            query_failure("TJSet.activate", query_string, query_params, err);
            return failed;
        }
    }
}
