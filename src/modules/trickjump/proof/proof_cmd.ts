import { BotCommandProcessResultType, ParentCommand } from "../../../functions.js";
import { ProofGet } from "./get.js";
import { ProofRemove } from "./remove.js";
import { ProofSet } from "./set.js";

export class Proof extends ParentCommand {
    constructor() {
        super(new ProofGet(), new ProofSet(), new ProofRemove());
    }

    manual = {
        name: "proof",
        subcommands: this.subcommand_manuals,
        description: "Manage and view the Proof people have set for Jumproles in the current server.",
        supports_slash_commands: true,
    } as const;

    no_use_no_see = false;

    permissions = undefined;

    async pre_dispatch() {
        return { type: BotCommandProcessResultType.PassThrough };
    }
}

export const ProofCMD = new Proof();
