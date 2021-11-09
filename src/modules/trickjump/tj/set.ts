import { Client } from "discord.js";
import { UsingClient } from "../../../pg_wrapper.js";

import { BotCommandProcessResults, BotCommandProcessResultType, BotInteraction, Replier, Subcommand } from "../../../functions.js";

import { ValidatedArguments } from "../../../utilities/argument_processing/arguments_types.js";
import { query_failure } from "../../../utilities/typeutils.js";
import * as RT from "../../../utilities/runtime_typeguard/standard_structures.js";
import { MAINTAINER_TAG } from "../../../main.js";

export class TJSet extends Subcommand<typeof TJSet.manual> {
    constructor() {
        super();
    }

    static readonly manual = {
        name: "set",
        arguments: [
            {
                name: "yes or no",
                id: "all",
                optional: false,
                base_type: "BOOLEAN",
                further_constraint: RT.BooleanS,
                short_description: "has all",
            },
        ],
        syntax: "::<prefix>tj set:: ALL $1",
        description: "Give yourself all or remove all of the Jumproles in the server.",
        //supports_slash_commands: true,
    } as const;

    readonly manual = TJSet.manual;
    readonly no_use_no_see = false;
    readonly permissions = undefined;

    // eslint-disable-next-line complexity
    async activate(
        values: ValidatedArguments<typeof TJSet.manual>,
        interaction: BotInteraction,
        _client: Client,
        pg_client: UsingClient,
        _prefix: string,
        reply: Replier,
    ): Promise<BotCommandProcessResults> {
        const failed = { type: BotCommandProcessResultType.DidNotSucceed };

        let query_string = "";
        let query_params: unknown[] = [];

        try {
            if (values.all) {
                let date = Math.round(Date.now() / 1000);
                query_string = `INSERT INTO trickjump_entries (jump_id, jump_hash, holder, server, added_at, updated_at) (SELECT id, hash, $1, trickjump_jumps.server, $2, $3 FROM trickjump_jumps WHERE server=$4) ON CONFLICT ON CONSTRAINT trickjump_entries_jump_id_holder_key DO NOTHING`;
                query_params = [interaction.author.id, date, date, interaction.guild.id];
                await pg_client.query(query_string, query_params);
            } else {
                query_string = `DELETE FROM trickjump_entries WHERE holder=$1 AND server=$2`;
                query_params = [interaction.author.id, interaction.guild.id];
                await pg_client.query(query_string, query_params);
            }
            await interaction.give_check();
            return { type: BotCommandProcessResultType.Succeeded };
        } catch (err) {
            await reply(`an internal error occurred (query failure). Contact @${MAINTAINER_TAG} for help.`);
            query_failure("TJSet.activate", query_string, query_params, err);
            return failed;
        }
    }
}
