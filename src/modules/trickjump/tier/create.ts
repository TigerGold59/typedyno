import { Client } from "discord.js";
import { BotCommandProcessResults, BotCommandProcessResultType, BotInteraction, Replier, Subcommand } from "../../../functions.js";
import { MAINTAINER_TAG } from "../../../main.js";

import { CreateTierResultType, Tier } from "./internals/tier_type.js";
import * as RT from "../../../utilities/runtime_typeguard/standard_structures.js";
import { UsingClient } from "../../../pg_wrapper.js";
import { ValidatedArguments } from "../../../utilities/argument_processing/arguments_types.js";
export class TierCreate extends Subcommand<typeof TierCreate.manual> {
    constructor() {
        super();
    }

    static readonly manual = {
        name: "create",
        arguments: [
            {
                name: "name",
                id: "name",
                optional: false,
                base_type: "STRING",
                short_description: "name",
            },
            {
                name: "rank number",
                id: "ordinal",
                optional: false,
                base_type: "INTEGER",
                further_constraint: RT.UInt4Like,
                short_description: "rank number",
            },
        ],
        description: "Creates a tier which may include jumproles. The higher the rank number, the higher the tier.",
        syntax: "::<prefix>tier create:: NAME $1 RANK $2",
        compact_syntaxes: false,
    } as const;

    readonly manual = TierCreate.manual;
    readonly no_use_no_see = false;
    readonly permissions = undefined;

    // eslint-disable-next-line complexity
    async activate(
        values: ValidatedArguments<typeof TierCreate.manual>,
        interaction: BotInteraction,
        _client: Client,
        using_client: UsingClient,
        prefix: string,
        reply: Replier,
    ): Promise<BotCommandProcessResults> {
        const failed = { type: BotCommandProcessResultType.DidNotSucceed };

        const exists = await Tier.Create(interaction.guild.id, values.ordinal, values.name, using_client);

        switch (exists.result) {
            case CreateTierResultType.TierAlreadyExists: {
                await reply(`a tier with this name already exists. Please use '${prefix}tier update' to change an existing tier's rank number.`);
                return failed;
            }
            case CreateTierResultType.InvalidName: {
                await reply(`the given name is not a valid tier name. A tier's name must be between length 1 and 100.`);
                return failed;
            }
            case CreateTierResultType.InvalidServer: {
                await reply(
                    `an internal error occurred (Tier.Create returned CreateTierResultType.InvalidServer). Contact @${MAINTAINER_TAG} for help.`,
                );
                return failed;
            }
            case CreateTierResultType.InvalidOrdinal: {
                await reply(`the given rank number is not valid. A tier's rank number must be an integer between 0 and 4294967296.`);
                return failed;
            }
            case CreateTierResultType.QueryFailed: {
                await reply(`an unknown internal error caused the database query to fail. Contact @${MAINTAINER_TAG} for help.`);
                return failed;
            }
            case CreateTierResultType.Success: {
                await interaction.give_check();
                return { type: BotCommandProcessResultType.Succeeded };
            }
            case CreateTierResultType.GetTierFailed: {
                await reply(
                    `an internal error occurred (Tier.Create returned CreateTierResultType.GetTierFailed). Contact @${MAINTAINER_TAG} for help.`,
                );
                return failed;
            }
            case CreateTierResultType.OrdinalAlreadyInUse: {
                await reply(`a tier already exists with that rank number. View tiers and their rank numbers using '${prefix}tj all'.`);
                return failed;
            }
            default: {
                return failed;
            }
        }
    }
}
