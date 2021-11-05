// Wait before decorating
//await new Promise((res, _rej) => setInterval(res, 2000));
import { MakesSingleRequest, Queryable, UsingClient } from "./pg_wrapper.js";
import { make_manual, SimpleCommandManual, SubcommandManual } from "./command_manual.js";

import { Client, Guild, Message } from "discord.js";
import {
    DesignateRemoveUserResult,
    DesignateUserStatus,
    create_designate_handle,
    designate_remove_user,
    designate_set_user,
    designate_user_status,
} from "./designate.js";
import {
    BotCommand,
    BotCommandProcessResultType,
    BotCommandProcessResults,
    GiveCheck,
    Subcommand,
    Replier,
    ParentCommand,
    AnyBotCommand,
} from "./functions.js";
import { Paste, url } from "./integrations/paste_ee.js";

import { SetPrefixNonStringResult, get_prefix, set_prefix } from "./integrations/server_prefixes.js";
import { GLOBAL_PREFIX, MAINTAINER_TAG } from "./main.js";
import { ValidatedArguments } from "./utilities/argument_processing/arguments_types.js";
import { DebugLogType, LogType, log } from "./utilities/log.js";
import * as RT from "./utilities/runtime_typeguard/standard_structures.js";
import { is_string, safe_serialize, TextChannelMessage } from "./utilities/typeutils.js";

export class IDExplain extends BotCommand<SimpleCommandManual> {
    constructor() {
        super();
    }

    readonly manual = {
        name: "idexplain",
        arguments: [],
        description: "Explains the .",
        syntax: "::<prefix>idexplain::",
    } as const;

    readonly no_use_no_see = false;
    readonly permissions = undefined;

    async process(message: Message, _client: Client, _queryable: Queryable<MakesSingleRequest>, _prefix: string): Promise<BotCommandProcessResults> {
        await message.channel.send(
            `A Discord ID, or Snowflake, is a long string of numbers used to represent a specific server, channel, user, or message.\n**Q: How do I get it?**\n**A: **First, turn on Developer Mode. To do so, go to Settings -> Advanced and switch on Developer Mode. Then, simply right click on the server, channel, user, or message that you want the ID of and click 'Copy ID'.\nNote: You can also send a mention of a user or a link to a channel in place of their ID for the purpose of bot commands.`,
        );
        return { type: BotCommandProcessResultType.Succeeded };
    }
}

export class GetCommands extends BotCommand<SimpleCommandManual> {
    constructor() {
        super();
    }

    readonly manual = {
        name: "commands",
        arguments: [],
        description: "Links to a paste where you can view all the available bot commands.",
        syntax: "::<prefix>commands::",
    } as const;

    readonly no_use_no_see = false;

    readonly permissions = undefined;

    async process(message: Message, _client: Client, _queryable: Queryable<MakesSingleRequest>, prefix: string): Promise<BotCommandProcessResults> {
        const paste = await make_manual(message, prefix, STOCK_BOT_COMMANDS);

        if (is_string(paste.error)) {
            await message.channel.send(`paste.ee API failed to create paste: contact ${MAINTAINER_TAG} for help fixing this error.`);
            return { type: BotCommandProcessResultType.DidNotSucceed };
        } else if (is_string(paste.paste?.id)) {
            await message.channel.send(
                `You can find the command manual here: ${url(
                    <Paste>paste.paste,
                )}. Note that certain commands may be hidden if you lack permission to use them.`,
            );
            return { type: BotCommandProcessResultType.Succeeded };
        }

        const err = `'commands' process: internal error - make_manual neither returned an error nor a paste. Returning BotCommandProcessResultType.DidNotSucceed`;

        await message.channel.send(err);
        log(err, LogType.Error);
        return {
            type: BotCommandProcessResultType.DidNotSucceed,
        };
    }
}

export class PrefixGet extends Subcommand<typeof PrefixGet.manual> {
    constructor() {
        super();
    }

    static readonly manual = {
        name: "get",
        arguments: [],
        description: "Tells you the only valid prefix that you can use on this server to activate the bot's commands.",
        syntax: "::<prefix>prefix get::",
    } as const;

    readonly manual = PrefixGet.manual;
    readonly no_use_no_see = false;
    readonly permissions = undefined;

    async activate(
        _args: ValidatedArguments<typeof PrefixGet.manual>,
        message: Message,
        _client: Client,
        pg_client: UsingClient,
        _prefix: string,
        _reply: Replier,
    ): Promise<BotCommandProcessResults> {
        const prefix_result = await get_prefix(message.guild, pg_client);

        if (prefix_result.trim() === GLOBAL_PREFIX.trim()) {
            await message.channel.send(`The global prefix is "${prefix_result}" and it hasn't been changed locally, but you already knew that.`);
            return {
                type: BotCommandProcessResultType.Succeeded,
            };
        } else {
            await message.channel.send(`The local prefix is "${prefix_result}", but you already knew that.`);
            return {
                type: BotCommandProcessResultType.Succeeded,
            };
        }
    }
}

export class PrefixSet extends Subcommand<typeof PrefixSet.manual> {
    constructor() {
        super();
    }

    static readonly manual = {
        name: "set",
        arguments: [
            {
                name: "string or symbol",
                id: "new_prefix",
                optional: false,
            },
            {
                name: "server ID",
                id: "guild_id",
                optional: true,
                further_constraint: RT.Snowflake,
            },
        ],
        description:
            "Sets the provided string as the local prefix, overriding the global prefix.\nYou must be a bot admin or have designated privileges to use this command.",
        syntax: "::<prefix>prefix set:: NEW $1{opt $2}[ SERVER $2]",
    } as const;

    readonly manual = PrefixSet.manual;
    readonly no_use_no_see = false;
    readonly permissions = undefined;

    async activate(
        args: ValidatedArguments<typeof PrefixSet.manual>,
        message: TextChannelMessage,
        client: Client,
        pg_client: UsingClient,
        _prefix: string,
        _reply: Replier,
    ): Promise<BotCommandProcessResults> {
        let designate_status = await designate_user_status({ user: message.author.id, server: message.guild.id }, pg_client);
        switch (designate_status) {
            case DesignateUserStatus.FullAccess:
            case DesignateUserStatus.UserIsAdmin: {
                const result = await set_prefix(
                    args.guild_id === null ? (message.guild as Guild) : await client.guilds.fetch(args.guild_id),
                    args.new_prefix,
                    pg_client,
                );

                if (result.did_succeed) {
                    const confirmed = await GiveCheck(message);
                    if (confirmed === true) {
                        return {
                            type: BotCommandProcessResultType.Succeeded,
                        };
                    } else {
                        return {
                            type: BotCommandProcessResultType.DidNotSucceed,
                        };
                    }
                } else {
                    if (result.result === SetPrefixNonStringResult.LocalPrefixArgumentSameAsGlobalPrefix) {
                        await message.channel.send(
                            "Setting a local prefix the same as the global prefix is not allowed for flexibility reasons. However, since the prefix you wanted to set was already the prefix, you can use it just like you would if this command had worked.",
                        );
                        return {
                            type: BotCommandProcessResultType.Succeeded,
                        };
                    } else {
                        await message.channel.send(`set_prefix failed: contact ${MAINTAINER_TAG} for help fixing this error.`);
                        log(`set_prefix unexpectedly threw an error:`, LogType.Error);
                        log(result.result, LogType.Error);
                        return {
                            type: BotCommandProcessResultType.DidNotSucceed,
                        };
                    }
                }
            }
            case DesignateUserStatus.UserNotInRegistry:
            case DesignateUserStatus.InvalidHandle: {
                return {
                    type: BotCommandProcessResultType.Unauthorized,
                    not_authorized_message: "You were not found in the authorized users database, so your authority could not verified.",
                };
            }
            case DesignateUserStatus.NoFullAccess: {
                return {
                    type: BotCommandProcessResultType.Unauthorized,
                    not_authorized_message: "You must be a bot admin or fully authorized (designated) person to set a server prefix.",
                };
            }
        }
    }
}

export class Prefix extends ParentCommand {
    constructor() {
        super(new PrefixGet(), new PrefixSet());
    }

    readonly manual = {
        name: "prefix",
        subcommands: this.subcommand_manuals,
        description: "Manage or get the prefix for your current server.",
    } as const;

    readonly no_use_no_see = false;
    readonly permissions = undefined;

    async pre_dispatch(
        _subcommand: Subcommand<SubcommandManual>,
        _message: Message,
        _client: Client,
        _queryable: Queryable<MakesSingleRequest>,
        _prefix: string,
    ): Promise<BotCommandProcessResults> {
        log(`Prefix command: passing through to subcommand`, LogType.Status, DebugLogType.AutomaticDispatchPassThrough);
        return { type: BotCommandProcessResultType.PassThrough };
    }
}

export class Info extends BotCommand<SimpleCommandManual> {
    constructor() {
        super();
    }

    readonly manual = {
        name: "info",
        arguments: [],
        syntax: "::<prefix>info::",
        description: "Provides a description of useful commands and the design of the bot.",
    } as const;

    readonly no_use_no_see = false;

    readonly permissions = undefined;

    async process(message: Message, _client: Client, _queryable: Queryable<MakesSingleRequest>, prefix: string): Promise<BotCommandProcessResults> {
        let base_info = `**Useful commands**:\n${prefix}commands: Lists the commands this bot has.\n**GitHub**: https://github.com/TigerGold59/typedyno`;
        if (prefix === GLOBAL_PREFIX) {
            base_info += `\nThe prefix on this server is the same as the global prefix, ${GLOBAL_PREFIX}.`;
        } else {
            base_info += `\nThe global prefix, which applies to servers that haven't set a local prefix, is ${GLOBAL_PREFIX}.`;
        }

        await message.channel.send(base_info);
        return {
            type: BotCommandProcessResultType.Succeeded,
        };
    }
}

export class DesignateSet extends Subcommand<typeof DesignateSet.manual> {
    constructor() {
        super();
    }

    static readonly manual = {
        name: "set",
        description: "Designate people who have power in the server to do things like set a prefix, designate others, and set mod channels.",
        arguments: [
            {
                name: "user ID",
                id: "user_snowflake",
                optional: false,
                further_constraint: RT.Snowflake,
            },
            {
                name: "allow designating others",
                id: "allow_designating",
                optional: true,
                further_constraint: RT.BooleanS,
            },
        ],
        syntax: "::<prefix>designate set:: USER $1{opt $2}[ FULL $2]",
    } as const;

    readonly manual = DesignateSet.manual;
    readonly no_use_no_see = true;
    readonly permissions = undefined;

    async activate(
        args: ValidatedArguments<typeof DesignateSet.manual>,
        message: Message,
        _client: Client,
        pg_client: UsingClient,
        prefix: string,
    ): Promise<BotCommandProcessResults> {
        const reply = async (response: string): Promise<void> => {
            await message.channel.send(response);
        };

        const target_handle = create_designate_handle(args.user_snowflake, message);
        const asker_handle = create_designate_handle(message.author.id, message);
        const user_status = await designate_user_status(asker_handle, pg_client);
        const intention = args.allow_designating === true;
        switch (user_status) {
            case DesignateUserStatus.UserIsAdmin:
            case DesignateUserStatus.FullAccess: {
                const new_status = await designate_set_user(target_handle, intention, pg_client);
                switch (new_status) {
                    case null: {
                        await reply(`${prefix}designate set: an internal error occurred (query failure). Contact @${MAINTAINER_TAG} for help.`);
                        return { type: BotCommandProcessResultType.DidNotSucceed };
                    }
                    case DesignateUserStatus.UserNotInRegistry: {
                        await reply(
                            `${prefix}designate set: an internal error occurred (new status was UserNotInRegistry even after calling designate_set_user). Contact @${MAINTAINER_TAG} for help.`,
                        );
                        return { type: BotCommandProcessResultType.DidNotSucceed };
                    }
                    case DesignateUserStatus.UserIsAdmin: {
                        return {
                            type: BotCommandProcessResultType.Unauthorized,
                            not_authorized_message: "The user whose designation you are trying to set is a bot admin.",
                        };
                    }
                    default: {
                        await GiveCheck(message);
                        return { type: BotCommandProcessResultType.Succeeded };
                    }
                }
            }
            case DesignateUserStatus.InvalidHandle: {
                log(`DesignateAdd: invalid designate handle for asker (${safe_serialize(asker_handle)})`, LogType.Error);
                await reply(
                    `${prefix}designate set: an internal error occurred (invalid designate handle for asker). Contact @${MAINTAINER_TAG} for help.`,
                );
                return { type: BotCommandProcessResultType.DidNotSucceed };
            }
            default: {
                return {
                    type: BotCommandProcessResultType.Unauthorized,
                    not_authorized_message: "The user of this command does not have designate full access power.",
                };
            }
        }
    }
}

export class DesignateRemove extends Subcommand<typeof DesignateRemove.manual> {
    constructor() {
        super();
    }

    static readonly manual = {
        name: "remove",
        description: "Remove the power of people who have designate privileges.",
        arguments: [
            {
                name: "user ID",
                id: "user_snowflake",
                optional: false,
                further_constraint: RT.Snowflake,
            },
        ],
        syntax: "::<prefix>designate remove:: USER $1",
    } as const;

    readonly manual = DesignateRemove.manual;
    readonly no_use_no_see = true;
    readonly permissions = undefined;

    async activate(
        args: ValidatedArguments<typeof DesignateSet.manual>,
        message: Message,
        _client: Client,
        pg_client: UsingClient,
        prefix: string,
    ): Promise<BotCommandProcessResults> {
        const reply = async (response: string): Promise<void> => {
            await message.channel.send(response);
        };

        const target_handle = create_designate_handle(args.user_snowflake, message);
        const asker_handle = create_designate_handle(message.author.id, message);
        const user_status = await designate_user_status(asker_handle, pg_client);
        switch (user_status) {
            case DesignateUserStatus.UserIsAdmin:
            case DesignateUserStatus.FullAccess: {
                const result = await designate_remove_user(target_handle, pg_client);
                switch (result) {
                    case DesignateRemoveUserResult.UserAlreadyNotInRegistry: {
                        await reply(`${prefix}designate remove: User already had no designate privileges.`);
                        return { type: BotCommandProcessResultType.Succeeded };
                    }
                    case DesignateRemoveUserResult.InvalidHandle: {
                        log(`DesignateRemove: invalid designate handle for target (${safe_serialize(target_handle)})`, LogType.Error);
                        await reply(
                            `${prefix}designate remove: an internal error occurred (invalid designate handle for target). Contact @${MAINTAINER_TAG} for help.`,
                        );
                        return { type: BotCommandProcessResultType.DidNotSucceed };
                    }
                    case DesignateRemoveUserResult.QueryError: {
                        await reply(`${prefix}designate set: an internal error occurred (query failure). Contact @${MAINTAINER_TAG} for help.`);
                        return { type: BotCommandProcessResultType.DidNotSucceed };
                    }
                    case DesignateRemoveUserResult.UserRemoved: {
                        await GiveCheck(message);
                        return { type: BotCommandProcessResultType.Succeeded };
                    }
                    case DesignateRemoveUserResult.UserIsAdmin: {
                        return {
                            type: BotCommandProcessResultType.Unauthorized,
                            not_authorized_message: "The user whose designation you are trying to remove is a bot admin.",
                        };
                    }
                }
                break;
            }
            case DesignateUserStatus.InvalidHandle: {
                log(`DesignateAdd: invalid designate handle for asker (${safe_serialize(asker_handle)})`, LogType.Error);
                await reply(
                    `${prefix}designate remove: an internal error occurred (invalid designate handle for asker). Contact @${MAINTAINER_TAG} for help.`,
                );
                return { type: BotCommandProcessResultType.DidNotSucceed };
            }
            default: {
                return {
                    type: BotCommandProcessResultType.Unauthorized,
                    not_authorized_message: "The user of this command must have designate full access power.",
                };
            }
        }
    }
}

export class DesignateGet extends Subcommand<typeof DesignateGet.manual> {
    constructor() {
        super();
    }

    static readonly manual = {
        name: "get",
        description: "Check someone's designate privileges.",
        arguments: [
            {
                name: "user ID",
                id: "user_snowflake",
                optional: true,
                further_constraint: RT.Snowflake,
            },
        ],
        syntax: "::<prefix>designate get::{opt $1}[ USER $1]",
    } as const;

    readonly manual = DesignateGet.manual;

    readonly no_use_no_see = false;
    readonly permissions = undefined;

    async activate(
        args: ValidatedArguments<typeof DesignateGet.manual>,
        message: Message,
        _client: Client,
        queryable: Queryable<MakesSingleRequest>,
        prefix: string,
    ): Promise<BotCommandProcessResults> {
        const reply = async (response: string): Promise<void> => {
            await message.channel.send(response);
        };
        const target_id = args.user_snowflake === null ? message.author.id : args.user_snowflake;
        const start_string = args.user_snowflake === null ? `You're` : `The user with ID ${args.user_snowflake} is`;
        const target_handle = create_designate_handle(target_id, message);

        const status = await designate_user_status(target_handle, queryable);

        switch (status) {
            case DesignateUserStatus.FullAccess: {
                await reply(`${start_string} currently at the level of full access (able to designate others).`);
                return { type: BotCommandProcessResultType.Succeeded };
            }
            case DesignateUserStatus.UserIsAdmin: {
                await reply(`${start_string} a bot admin (able to designate others, unable to be removed from designate).`);
                return { type: BotCommandProcessResultType.Succeeded };
            }
            case DesignateUserStatus.NoFullAccess: {
                await reply(`${start_string} currently at the level of partial access (unable to designate others, but otherwise privileged).`);
                return { type: BotCommandProcessResultType.Succeeded };
            }
            case DesignateUserStatus.UserNotInRegistry: {
                await reply(`${start_string} not in the designate registry for this server (no designate privileges).`);
                return { type: BotCommandProcessResultType.Succeeded };
            }
            case DesignateUserStatus.InvalidHandle: {
                await reply(
                    `${prefix}designate get: unknown internal error (designate_user_status returned InvalidHandle). Contact @${MAINTAINER_TAG} for help.`,
                );
                return { type: BotCommandProcessResultType.DidNotSucceed };
            }
        }
    }
}

export class Designate extends ParentCommand {
    constructor() {
        super(new DesignateSet(), new DesignateRemove(), new DesignateGet());
    }
    readonly manual = {
        name: "designate",
        description: "Manage user permissions in this server.",
        subcommands: this.subcommand_manuals,
    } as const;

    readonly no_use_no_see = false;
    readonly permissions = undefined;

    async pre_dispatch(
        _subcommand: Subcommand<SubcommandManual>,
        _message: Message,
        _client: Client,
        _queryable: Queryable<MakesSingleRequest>,
        _prefix: string,
    ): Promise<BotCommandProcessResults> {
        log(`Designate command: passing through to subcommand`, LogType.Status, DebugLogType.AutomaticDispatchPassThrough);
        return { type: BotCommandProcessResultType.PassThrough };
    }
}

export const STOCK_BOT_COMMANDS: AnyBotCommand[] = [new GetCommands(), new Info(), new Prefix(), new Designate()];
