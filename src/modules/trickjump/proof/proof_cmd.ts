import { Client, Message } from "discord.js";
import { Queryable, UsesClient } from "../../../pg_wrapper.js";

import { BotCommand, BotCommandProcessResults, BotCommandProcessResultType } from "../../../functions.js";
import { automatic_dispatch } from "../../../module_decorators.js";
import { ProofGet } from "./get.js";
import { ProofRemove } from "./remove.js";
import { ProofSet } from "./set.js";

export class Proof extends BotCommand {
    constructor() {
        super(Proof.manual, Proof.no_use_no_see, Proof.permissions);
    }

    static readonly manual = {
        name: "proof",
        subcommands: [ProofGet.manual, ProofSet.manual, ProofRemove.manual],
        description: "Manage and view the Proof people have set for Jumproles in the current server.",
    } as const;

    @automatic_dispatch(new ProofGet(), new ProofSet(), new ProofRemove())
    async process(_message: Message, _client: Client, _queryable: Queryable<UsesClient>, _prefix: string): Promise<BotCommandProcessResults> {
        return { type: BotCommandProcessResultType.PassThrough };
    }
}

export const ProofCMD = new Proof();
