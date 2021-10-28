import { Client } from "discord.js";
import { BotCommandProcessResults, BotCommandProcessResultType, GiveCheck, Subcommand } from "../../../functions.js";
import { MAINTAINER_TAG } from "../../../main.js";
import { validate } from "../../../module_decorators.js";
import { null_to_undefined, TextChannelMessage } from "../../../utilities/typeutils.js";
import { GetTierResultType, ModifyTierResultType, Tier } from "./internals/tier_type.js";
import * as RT from "../../../utilities/runtime_typeguard/standard_structures.js";
import { Queryable, UsesClient, use_client } from "../../../pg_wrapper.js";
import { ValidatedArguments } from "../../../utilities/argument_processing/arguments_types.js";
import { Tier as TierCommand } from "./tier_cmd.js";

export class TierUpdate extends Subcommand<typeof TierUpdate.manual> {
    constructor() {
        super(TierCommand.manual, TierUpdate.manual, TierUpdate.no_use_no_see, TierUpdate.permissions);
    }

    static readonly manual = {
        name: "update",
        arguments: [
            {
                name: "current name",
                id: "name",
                optional: false,
            },
            {
                name: "new name",
                id: "new_name",
                optional: true,
            },
            {
                name: "rank number",
                id: "ordinal",
                optional: true,
                further_constraint: RT.UInt4Like,
            },
        ],
        description:
            "Updates a tier, changing its name or rank number or both, depending on which are provided. The higher the rank number, the higher the tier.",
        syntax: "<prefix>tier update NAME $1{opt $2}[ NEW NAME $2]${opt $3}[ RANK $3]",
        compact_syntaxes: false,
    } as const;

    static readonly no_use_no_see = false;

    static readonly permissions = undefined;

    @validate
    // eslint-disable-next-line complexity
    async activate(
        values: ValidatedArguments<typeof TierUpdate.manual>,
        message: TextChannelMessage,
        _client: Client,
        queryable: Queryable<UsesClient>,
        prefix: string,
    ): Promise<BotCommandProcessResults> {
        const reply = async function (response: string) {
            await message.channel.send(`${prefix}tier update: ${response}`);
        };

        const failed = { type: BotCommandProcessResultType.DidNotSucceed };

        const using_client = await use_client(queryable);

        const existing = await Tier.Get(message.guild.id, values.name, using_client);

        switch (existing.result) {
            case GetTierResultType.NoMatchingEntries: {
                await reply(`no tier with this name exists. Please use '${prefix}tier create' to create a new tier.`);
                return failed;
            }
            case GetTierResultType.InvalidName: {
                await reply(`the given current name is not a valid tier name. A tier's name must be between length 1 and 100.`);
                return failed;
            }
            case GetTierResultType.InvalidServer: {
                await reply(`an internal error occurred (Tier.Get returned GetTierResultType.InvalidServer). Contact @${MAINTAINER_TAG} for help.`);
                return failed;
            }
            case GetTierResultType.QueryFailed: {
                await reply(`an unknown internal error caused the database query to fail. Contact @${MAINTAINER_TAG} for help.`);
                return failed;
            }
            case GetTierResultType.Success: {
                let tier_object = existing.tier;
                let update_result = await tier_object.update(
                    { name: null_to_undefined(values.new_name), ordinal: null_to_undefined(values.ordinal) },
                    using_client,
                );
                switch (update_result) {
                    case ModifyTierResultType.Success: {
                        await GiveCheck(message);
                        return { type: BotCommandProcessResultType.Succeeded };
                    }
                    case ModifyTierResultType.QueryFailed: {
                        await reply(`an unknown internal error caused the database query to fail. Contact @${MAINTAINER_TAG} for help.`);
                        return failed;
                    }
                    case ModifyTierResultType.InvalidPropertyChange: {
                        await reply(
                            `an invalid value was given for either the new name or rank number. A tier's name must be between length 1 and 100, and its rank number must be an integer between 0 and 4294967296.`,
                        );
                        return failed;
                    }
                }
            }
            default: {
                return failed;
            }
        }
    }
}
