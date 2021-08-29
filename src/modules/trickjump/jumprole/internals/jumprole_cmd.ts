import { Client, Message } from "discord.js";
import { PoolInstance as Pool } from "../../../../pg_wrapper.js";

import { BotCommand, BotCommandProcessResults, BotCommandProcessResultType } from "../../../../functions.js";
import { JumproleSet } from "../set.js";
import { JumproleUpdate } from "../update.js";
import { JumproleRemove } from "../remove.js";
import { automatic_dispatch, command } from "../../../../module_decorators.js";
import { DebugLogType, log, LogType } from "../../../../utilities/log.js";

@command()
export class Jumprole extends BotCommand {
    constructor() {
        super(Jumprole.manual, Jumprole.no_use_no_see, Jumprole.permissions);
    }

    static readonly manual = {
        name: "jumprole",
        subcommands: [JumproleSet.manual, JumproleUpdate.manual, JumproleRemove.manual],
        description: "Manage Jumproles in the current server.",
    } as const;

    static readonly no_use_no_see = false;

    static readonly permissions = undefined;

    @automatic_dispatch(new JumproleSet(), new JumproleUpdate(), new JumproleRemove())
    async process(_message: Message, _client: Client, _pool: Pool, _prefix: string | undefined): Promise<BotCommandProcessResults> {
        // Do before calling subcommand
        log("jumprole: dispatching command call automatically to subcommand.", LogType.Status, DebugLogType.AutomaticDispatchPassThrough);
        // Return { type: BotCommandProcessResultType.PassThrough to pass through to the subcommand }
        return { type: BotCommandProcessResultType.PassThrough };
    }
}

export const JumproleCMD = new Jumprole();
