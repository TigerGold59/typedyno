import { Client } from "discord.js";
import { UsingClient } from "../../../pg_wrapper.js";

import { BotCommandProcessResults, BotCommandProcessResultType, BotInteraction, Replier, Subcommand } from "../../../functions.js";

import { log, LogType } from "../../../utilities/log.js";
import { format_date, get_user_tag, is_string, to_num_and_lower, UserTagManager } from "../../../utilities/typeutils.js";
import { MAINTAINER_TAG, NO_USER_EXISTS_MESSAGE } from "../../../main.js";
import { ValidatedArguments } from "../../../utilities/argument_processing/arguments_types.js";
import { BULK_ENTRY_JOIN, BULK_ENTRY_QUERY_FIELDS, FromQueryResultType, JumproleEntry } from "./internals/entry_type.js";
import { create_paste, Paste, url } from "../../../integrations/paste_ee.js";
import * as RT from "../../../utilities/runtime_typeguard/standard_structures.js";
import { KingdomNameToKingdom, KingdomString, KINGDOM_NAMES } from "../jumprole/internals/jumprole_type.js";

export class TJEntries extends Subcommand<typeof TJEntries.manual> {
    constructor() {
        super();
    }

    static readonly manual = {
        name: "entries",
        arguments: [
            {
                name: "user ID",
                id: "source",
                optional: true,
                further_constraint: RT.Snowflake,
                short_description: "holder",
                base_type: "USER",
            },
            {
                name: "yes or no",
                id: "link",
                optional: true,
                further_constraint: RT.BooleanS,
                short_description: "has link",
                base_type: "BOOLEAN",
            },
            {
                name: "jump name",
                id: "jump_name",
                optional: true,
                short_description: "jump name",
                base_type: "STRING",
            },
            {
                name: "jump kingdom",
                id: "jump_kingdom",
                optional: true,
                further_constraint: KingdomString,
                short_description: "jump kingdom",
                base_type: "STRING",
            },
            {
                name: "jump tier",
                id: "jump_tier",
                optional: true,
                short_description: "jump tier",
                base_type: "STRING",
            },
            {
                name: "value name",
                id: "sort_by",
                optional: true,
                base_type: "STRING",
                further_constraint: RT.Enum(
                    "value",
                    ["Jump ID", "Entry ID", "Jump Updated Date", "Entry Added Date", "Entry Updated Date", "Tier"],
                    to_num_and_lower,
                ),
                short_description: "sort by",
            },
        ],
        syntax: "::<prefix>tj entries::{opt $1}[ HOLDER $1]{opt $2}[ HAS LINK $2]{opt $3}[ JUMP NAME $3]{opt $4}[ JUMP KINGDOM $4]{opt $5}[ JUMP TIER $5]{opt $6}[ SORT BY $6]",
        description: "List all Jumprole entries with specified constraints.",
        compact_syntaxes: true,
    } as const;

    readonly manual = TJEntries.manual;
    readonly no_use_no_see = false;
    readonly permissions = undefined;

    // eslint-disable-next-line complexity
    async activate(
        values: ValidatedArguments<typeof TJEntries.manual>,
        interaction: BotInteraction,
        client: Client,
        pg_client: UsingClient,
        _prefix: string,
        reply: Replier,
    ): Promise<BotCommandProcessResults> {
        const failed = { type: BotCommandProcessResultType.DidNotSucceed };
        let criteria_statements = [] as string[];
        let query_assertions: [string, unknown][] = [["e.server", interaction.guild.id]];
        const constraints = Object.entries(values).filter(val => val[0] !== "sort_by" && val[1] !== null) as [
            Exclude<keyof typeof values, "sort_by">,
            string,
        ][];
        if (constraints.length < 1) {
            await reply("you must set at least one constraint.");
            return { type: BotCommandProcessResultType.DidNotSucceed };
        }
        for (const [constraint, value] of constraints) {
            switch (constraint) {
                case "source": {
                    let user_tag = await get_user_tag(value, client);
                    if (user_tag === false) {
                        await reply(NO_USER_EXISTS_MESSAGE);
                        return { type: BotCommandProcessResultType.DidNotSucceed };
                    }
                    criteria_statements.push(`Holder: ${user_tag}`);
                    query_assertions.push(["e.holder", value]);
                    break;
                }
                case "jump_name": {
                    criteria_statements.push(`Jump: ${value}`);
                    query_assertions.push(["j.name", to_num_and_lower(value)]);
                    break;
                }
                case "jump_kingdom": {
                    criteria_statements.push(`Kingdom: ${value}`);
                    query_assertions.push(["j.kingdom", KingdomNameToKingdom(value)]);
                    break;
                }
                case "jump_tier": {
                    criteria_statements.push(`Tier: ${value}`);
                    query_assertions.push(["t.name", to_num_and_lower(value)]);
                    break;
                }
            }
        }

        const stringify_assertion = (val: [string, unknown], index: number) => {
            return `${val[0]}=$${index + 1}`;
        };

        if (values.link !== null) criteria_statements.push(`Link provided: ${values.link.toString()}`);
        const link_assertion = values.link === null ? "" : `e.link IS${values.link ? " NOT " : " "}NULL`;

        let order_intention_map = new Map<string | null, string>();
        order_intention_map.set("Jump ID", "j.id");
        order_intention_map.set("Entry ID", "e.id");
        order_intention_map.set("Jump ID", "j.id");
        order_intention_map.set("Jump Updated Date", "j.updated_at");
        order_intention_map.set("Entry Added Date", "e.added_at");
        order_intention_map.set("Entry Updated Date", "e.updated_at");
        order_intention_map.set("Tier", "t.ordinal");
        order_intention_map.set(null, "e.added_at");

        const order_intention = order_intention_map.get(values.sort_by) as string;

        const query_string = `SELECT ${BULK_ENTRY_QUERY_FIELDS} FROM trickjump_entries e ${BULK_ENTRY_JOIN} AND ${query_assertions
            .map(stringify_assertion)
            .join(" AND ")}${values.link !== null ? ` AND ${link_assertion}` : ""} ORDER BY ${order_intention}`;
        const query_params = query_assertions.map(x => x[1]);

        let entry_results = await JumproleEntry.FromQuery(query_string, query_params, pg_client);

        switch (entry_results.type) {
            case FromQueryResultType.Success: {
                let roles = entry_results.values;

                if (roles.length === 0) {
                    await reply(`No jumprole entries fit those criteria.`);
                    return { type: BotCommandProcessResultType.Succeeded };
                }

                const criteria = criteria_statements.join("\n");
                const ordering_by = `Sorted by: ${values.sort_by === null ? "Entry Added Date" : values.sort_by}`;

                const head = `Entries in ${interaction.guild.name} Matching Criteria\n${"=".repeat(
                    29 + interaction.guild.name.length,
                )}\n\n${criteria}\n${ordering_by}\n\n`;

                for (const entry of roles) {
                    if (entry.jumprole === undefined) {
                        log(`tj entries: entry with ID ${entry.id} had undefined jumprole property. Entry:`);
                        log(entry);
                        await reply(`an internal error has occurred (role.jumprole was undefined). Contact @${MAINTAINER_TAG} for help.`);
                        return { type: BotCommandProcessResultType.DidNotSucceed };
                    }
                }
                let tail = [];
                let tags = new UserTagManager(client);
                for (const entry of roles) {
                    let segment = [] as string[];
                    if (values.jump_tier === null) {
                        segment.push(`Tier: ${entry.jumprole.tier.name}`);
                    }
                    if (values.jump_name === null) {
                        segment.push(`Jump: ${entry.jumprole.name}`);
                    }
                    if (values.jump_kingdom === null && values.jump_name === null && entry.jumprole.kingdom !== null) {
                        segment.push(`Kingdom: ${KINGDOM_NAMES[entry.jumprole.kingdom]}`);
                    }
                    if (values.source === null) {
                        segment.push(`User: ${await tags.get(entry.holder)}`);
                    }
                    segment.push(`Proof: ${entry.link === null ? "none" : entry.link}`);
                    segment.push(`Added at: ${format_date(entry.added_at)}`);
                    segment.push(`Updated at: ${format_date(entry.updated_at)}`);
                    segment.push(`Jump changed at: ${format_date(entry.jumprole.updated_at)}`);
                    tail.push(segment.join("\n"));
                }

                let link = await create_paste(head + tail.join("\n\n"));
                if (is_string(link.paste?.id)) {
                    await reply(
                        `${roles.length} entr${roles.length === 1 ? "y" : "ies"} match your criteria - view ${
                            roles.length === 1 ? "it" : "them"
                        } at ${url(link.paste as Paste)}`,
                    );
                } else {
                    await reply(`error creating paste. Contact @${MAINTAINER_TAG} for help.`);
                    log(link.error, LogType.Error);
                }
                return { type: BotCommandProcessResultType.Succeeded };
            }
            case FromQueryResultType.QueryFailed: {
                await reply(`an internal error has occurred (query failure). Contact @${MAINTAINER_TAG} for help.`);
                return failed;
            }
        }
    }
}
