import { Client, Message } from "discord.js";
import { PoolInstance as Pool } from "../../../pg_wrapper.js";

import { BotCommand, BotCommandProcessResults, BotCommandProcessResultType } from "../../../functions.js";
import { JumproleSet } from "./set.js";
import { JumproleUpdate } from "./update.js";
import { JumproleRemove } from "./remove.js";
import { automatic_dispatch, command } from "../../../module_decorators.js";
import { DebugLogType, log, LogType } from "../../../utilities/log.js";
import { JumproleChoose } from "./choose.js";
import { MAINTAINER_TAG } from "../../../main.js";
import { is_valid_Snowflake } from "../../../utilities/permissions.js";

const GET_SERVER_JUMPROLE_CHANNEL = `SELECT * FROM trickjump_guilds WHERE server=$1`;

// TODO: Implement parent_command to better utilize automatic_dispatch to pass in which subcommand is being called

@command()
export class Jumprole extends BotCommand {
    constructor() {
        super(Jumprole.manual, Jumprole.no_use_no_see, Jumprole.permissions);
    }

    static readonly manual = {
        name: "jumprole",
        subcommands: [JumproleSet.manual, JumproleUpdate.manual, JumproleRemove.manual, JumproleChoose.manual],
        description: "Manage Jumproles in the current server.",
    } as const;

    static readonly no_use_no_see = false;

    static readonly permissions = undefined;

    @automatic_dispatch(new JumproleSet(), new JumproleUpdate(), new JumproleRemove(), new JumproleChoose())
    async process(message: Message, _client: Client, pool: Pool, prefix: string): Promise<BotCommandProcessResults> {
        const reply = async (response: string) => {
            await message.channel.send(response);
        };
        if (message.content.toLowerCase().startsWith(`${prefix.toLowerCase()}jumprole choose`)) {
            return { type: BotCommandProcessResultType.PassThrough };
        }
        // Do before calling subcommand
        // Check whether this message is in the correct channel
        const authorized_channels = await pool.query(GET_SERVER_JUMPROLE_CHANNEL, [message.guild!.id]);
        if (authorized_channels.rowCount === 0) {
            await reply(
                `${prefix}jumprole: this server has not designated a jumprole commands channel. Have a user with designate privileges create one, using \`${prefix}jumprole choose\`. You can see available syntaxes using \`${prefix}commands\`.`,
            );
            return { type: BotCommandProcessResultType.DidNotSucceed };
        } else if (authorized_channels.rowCount > 1) {
            log(`jumprole: server with ID ${message.guild!.id} has multiple jumprole commands channels.`, LogType.Error);
            await reply(
                `${prefix}jumprole: this server has somehow managed to designate multiple jumprole commands channels. Contact @${MAINTAINER_TAG} for help.`,
            );
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
                    `jumprole: server with ID ${message.guild!.id} returned a non-Snowflake type when queried for the authorized channel ID.`,
                    LogType.Error,
                );
                await reply(
                    `${prefix}jumprole: an internal error occurred (is_valid_Snowflake returned false on channel_id). Contact @${MAINTAINER_TAG} for help.`,
                );
                return { type: BotCommandProcessResultType.DidNotSucceed };
            }
        } else {
            log(`jumprole: negative authorized_channels.rowCount. Notifying the user...`, LogType.Error);
            await reply(
                `${prefix}jumprole: an internal error occurred (negative authorized_channels.rowCount). Contact @${MAINTAINER_TAG} for help.`,
            );
            return { type: BotCommandProcessResultType.DidNotSucceed };
        }
    }
}

export const JumproleCMD = new Jumprole();
