import { Module } from "../../module_loader.js";
import { InclusionSpecifierType } from "../../utilities/permissions.js";
import { JumproleCMD } from "./jumprole/jumprole_cmd.js";
import { ProofCMD } from "./proof/proof_cmd.js";
import { TierCMD } from "./tier/tier_cmd.js";
import { TJCMD } from "./tj/tj_cmd.js";

// Main module export object
const trickjump_module: Module = {
    name: "trickjump",
    servers_are_universes: true,
    hide_when_contradicts_permissions: true,
    tables: ["trickjump_jumps", "trickjump_entries", "trickjump_guilds"],
    permissions: {
        servers: {
            type: InclusionSpecifierType.Whitelist,
            // test server, main server, elite server, database server, 2P server, sky dram server
            // extra challenges elite server
            list: [
                "542766712785862666",
                "469869605570084886",
                "571956345415401472",
                "692474105332629514",
                "702296287617351740",
                "731690792380530738",
                "864860202645192704",
            ],
        },
    },
    functions: [JumproleCMD, TierCMD, TJCMD, ProofCMD],
};

export default trickjump_module;
