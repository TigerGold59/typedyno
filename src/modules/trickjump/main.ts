import { Module } from "../../module_loader.js";
import { InclusionSpecifierType } from "../../utilities/permissions.js";
import { JumproleCMD } from "./jumprole/jumprole_cmd.js";
import { TierCMD } from "./tier/tier_cmd.js";

// Main module export object
const trickjump_module: Module = {
    name: "trickjump",
    servers_are_universes: true,
    hide_when_contradicts_permissions: true,
    tables: ["trickjump_jumps", "trickjump_entries", "trickjump_guilds"],
    permissions: {
        servers: {
            type: InclusionSpecifierType.Whitelist,
            list: ["542766712785862666"],
        },
    },
    functions: [JumproleCMD, TierCMD],
};

export default trickjump_module;
