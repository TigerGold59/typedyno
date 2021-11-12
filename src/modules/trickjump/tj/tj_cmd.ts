import { BotCommandProcessResultType, ParentCommand } from "../../../functions.js";
import { TJGive } from "./give.js";
import { TJList } from "./list.js";
import { TJRemove } from "./remove.js";
import { TJConfirm } from "./confirm.js";
import { TJAll } from "./all.js";
import { TJMissing } from "./missing.js";
import { TJInfo } from "./info.js";
import { TJSet } from "./set.js";
import { TJEntries } from "./entries.js";

export class TJ extends ParentCommand {
    constructor() {
        super(new TJGive(), new TJList(), new TJRemove(), new TJConfirm(), new TJAll(), new TJMissing(), new TJInfo(), new TJSet(), new TJEntries());
    }

    readonly manual = {
        name: "tj",
        subcommands: this.subcommand_manuals,
        description: "Manage and view the Jumproles people have in the current server.",
    } as const;

    readonly no_use_no_see = false;

    readonly permissions = undefined;

    async pre_dispatch() {
        return { type: BotCommandProcessResultType.PassThrough };
    }
}

export const TJCMD = new TJ();
