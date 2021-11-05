import { Client } from "discord.js";
import { UsingClient } from "../../../pg_wrapper.js";

import { BotCommandProcessResults, BotCommandProcessResultType, GiveCheck, Replier, Subcommand } from "../../../functions.js";
import { MAINTAINER_TAG } from "../../../main.js";
import { ValidatedArguments } from "../../../utilities/argument_processing/arguments_types.js";
import * as RT from "../../../utilities/runtime_typeguard/standard_structures.js";
import { create_designate_handle, designate_user_status } from "../../../designate.js";
import { escape_reg_exp, query_failure, TextChannelMessage } from "../../../utilities/typeutils.js";

const UPSERT_GUILD_JUMPROLE_CHANNEL = `INSERT INTO trickjump_guilds VALUES ($1, $2) ON CONFLICT (server) DO UPDATE SET jumprole_channel=$2 WHERE trickjump_guilds.server=$1`;
export class JumproleChoose extends Subcommand<typeof JumproleChoose.manual> {
    constructor() {
        super();
    }

    static readonly manual = {
        name: "choose",
        arguments: [
            {
                name: "channel",
                id: "channel_snowflake",
                optional: false,
                further_constraint: RT.Snowflake,
            },
        ],
        description: "Designates the given channel as the server's channel authorized for all Jumprole commands (except this one).",
        syntax: "::<prefix>jumprole choose:: CHANNEL $1",
    } as const;

    manual = JumproleChoose.manual;

    no_use_no_see = false;
    permissions = undefined;

    is_attempted_use(message: TextChannelMessage, _client: Client, prefix: string): boolean {
        return new RegExp(`^${escape_reg_exp(prefix)}\s*jumprole choose`).test(message.content);
    }

    async activate(
        values: ValidatedArguments<typeof JumproleChoose.manual>,
        message: TextChannelMessage,
        _client: Client,
        pg_client: UsingClient,
        prefix: string,
        reply: Replier,
    ): Promise<BotCommandProcessResults> {
        const user_handle = create_designate_handle(message.author.id, message);
        const status = await designate_user_status(user_handle, pg_client);

        if (status >= 2) {
            const query_params = [message.guild.id, values.channel_snowflake];
            try {
                await pg_client.query(UPSERT_GUILD_JUMPROLE_CHANNEL, query_params);
                await GiveCheck(message);
                return { type: BotCommandProcessResultType.Succeeded };
            } catch (err) {
                await reply(`${prefix}jumprole choose: unknown internal error (query failure). Contact @${MAINTAINER_TAG} for help.`);
                query_failure(`JumproleChoose`, UPSERT_GUILD_JUMPROLE_CHANNEL, query_params, err);
                return { type: BotCommandProcessResultType.DidNotSucceed };
            }
        } else {
            return {
                type: BotCommandProcessResultType.Unauthorized,
                not_authorized_message: `The user does not have the necessary designate status to change the server jumprole channel.`,
            };
        }
    }
}
