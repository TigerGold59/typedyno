import { Client } from "discord.js";
import { BotCommandProcessResults, BotCommandProcessResultType, GiveCheck, Subcommand } from "../../../functions";
import { MAINTAINER_TAG } from "../../../main";
import { validate } from "../../../module_decorators";
import { TextChannelMessage } from "../../../utilities/typeutils";
import { DeleteTierResultType, GetTierResultType, Tier } from "./internals/tier_type";
import { Queryable, UsesClient, use_client } from "../../../pg_wrapper";
import { ValidatedArguments } from "../../../utilities/argument_processing/arguments_types.js";

export class TierDelete extends Subcommand<typeof TierDelete.manual> {
    constructor() {
        super(TierDelete.manual, TierDelete.no_use_no_see, TierDelete.permissions);
    }

    static readonly manual = {
        name: "delete",
        arguments: [
            {
                name: "name",
                id: "name",
                optional: false,
            },
        ],
        description: "Deletes a tier.",
        syntax: "<prefix>tier delete NAME $1",
        compact_syntaxes: false,
    } as const;

    static readonly no_use_no_see = false;

    static readonly permissions = undefined;

    @validate
    // eslint-disable-next-line complexity
    async activate(
        values: ValidatedArguments<typeof TierDelete.manual>,
        message: TextChannelMessage,
        _client: Client,
        queryable: Queryable<UsesClient>,
        prefix: string,
    ): Promise<BotCommandProcessResults> {
        const reply = async function (response: string) {
            await message.channel.send(`${prefix}tier delete: ${response}`);
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
                let delete_result = await tier_object.delete(using_client);
                switch (delete_result) {
                    case DeleteTierResultType.QueryFailed: {
                        await reply(`an unknown internal error caused the database query to fail. Contact @${MAINTAINER_TAG} for help.`);
                        return failed;
                    }
                    case DeleteTierResultType.Success: {
                        await GiveCheck(message);
                        return { type: BotCommandProcessResultType.Succeeded };
                    }
                }
            }
            default: {
                return failed;
            }
        }
    }
}
