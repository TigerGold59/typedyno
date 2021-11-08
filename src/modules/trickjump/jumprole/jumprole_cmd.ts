import { Client } from "discord.js";
import { PoolInstance as Pool } from "../../../pg_wrapper.js";

import { BotCommandProcessResults, BotCommandProcessResultType, ParentCommand, Subcommand } from "../../../functions.js";
import { JumproleCreate } from "./create.js";
import { JumproleUpdate } from "./update.js";
import { JumproleRemove } from "./remove.js";
import { DebugLogType, log, LogType } from "../../../utilities/log.js";
import { JumproleChoose } from "./choose.js";
import { MAINTAINER_TAG } from "../../../main.js";
import { is_valid_Snowflake } from "../../../utilities/permissions.js";
import { TextChannelMessage } from "../../../utilities/typeutils.js";
import { trickjump_guildsQueryResults } from "../table_types.js";
import { SubcommandManual } from "../../../command_manual.js";

export const GET_SERVER_JUMPROLE_CHANNEL = `SELECT * FROM trickjump_guilds WHERE server=$1`;

export class Jumprole extends ParentCommand {
    constructor() {
        super(new JumproleCreate(), new JumproleUpdate(), new JumproleRemove(), new JumproleChoose());
    }

    manual = {
        name: "jumprole",
        subcommands: this.subcommand_manuals,
        description: "Manage Jumproles in the current server.",
        supports_slash_commands: true,
    };

    readonly no_use_no_see = false;

    readonly permissions = undefined;

    async pre_dispatch(
        subcommand: Subcommand<SubcommandManual>,
        message: TextChannelMessage,
        _client: Client,
        pool: Pool,
        prefix: string,
    ): Promise<BotCommandProcessResults> {
        const reply = async (response: string) => {
            await message.channel.send(`${prefix}jumprole: ${response}`);
        };
        if (subcommand.manual.name === "choose") {
            return { type: BotCommandProcessResultType.PassThrough };
        }
        // Do before calling subcommand
        // Check whether this message is in the correct channel
        const authorized_channels = (await pool.query(GET_SERVER_JUMPROLE_CHANNEL, [message.guild.id])) as trickjump_guildsQueryResults;
        if (authorized_channels.rowCount === 0) {
            await reply(
                `this server has not designated a jumprole commands channel. Have a user with designate privileges create one, using \`${prefix}jumprole choose\`. You can see available syntaxes using \`${prefix}commands\`.`,
            );
            return { type: BotCommandProcessResultType.DidNotSucceed };
        } else if (authorized_channels.rowCount > 1) {
            log(`jumprole: server with ID ${message.guild.id} has multiple jumprole commands channels.`, LogType.Error);
            await reply(`this server has somehow managed to designate multiple jumprole commands channels. Contact @${MAINTAINER_TAG} for help.`);
            return { type: BotCommandProcessResultType.DidNotSucceed };
        } else if (authorized_channels.rowCount === 1) {
            const channel_id = authorized_channels.rows[0].jumprole_channel;
            if (is_valid_Snowflake(channel_id)) {
                if (message.channel.id === channel_id) {
                    log("jumprole: dispatching command call automatically to subcommand.", LogType.Status, DebugLogType.AutomaticDispatchPassThrough);
                    // Return { type: BotCommandProcessResultType.PassThrough to pass through to the subcommand }
                    return { type: BotCommandProcessResultType.PassThrough };
                } else {
                    return {
                        type: BotCommandProcessResultType.Unauthorized,
                        not_authorized_message: `You must use the jumprole commands (with the exception of choose) in the server's designated jumprole commands channel (channel with ID ${channel_id}).`,
                    };
                }
            } else {
                log(
                    `jumprole: server with ID ${message.guild.id} returned a non-Snowflake type when queried for the authorized channel ID.`,
                    LogType.Error,
                );
                await reply(`an internal error occurred (is_valid_Snowflake returned false on channel_id). Contact @${MAINTAINER_TAG} for help.`);
                return { type: BotCommandProcessResultType.DidNotSucceed };
            }
        } else {
            log(`jumprole: negative authorized_channels.rowCount. Notifying the user...`, LogType.Error);
            await reply(`an internal error occurred (negative authorized_channels.rowCount). Contact @${MAINTAINER_TAG} for help.`);
            return { type: BotCommandProcessResultType.DidNotSucceed };
        }
    }
}

export const JumproleCMD = new Jumprole();
