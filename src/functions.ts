import { Message, Client, Guild } from "discord.js";
import { PoolInstance as Pool } from "./pg_wrapper.js";
import { CommandManual, manual_of, is_no_use_no_see as is_no_use_no_see, permissions_of, make_manual, SubcommandManual } from "./command_manual.js";
import { get_prefix, SetPrefixNonStringResult, set_prefix } from "./integrations/server_prefixes.js";
import { CONFIG } from "./config.js";
import { GLOBAL_PREFIX, MAINTAINER_TAG, MODULES } from "./main.js";
import { performance } from "perf_hooks";
import { DebugLogType, log, LogType } from "./utilities/log.js";
import { allowed, Permissions } from "./utilities/permissions.js";
import { escape_reg_exp, is_string, is_text_channel, safe_serialize } from "./utilities/typeutils.js";
import { Paste, url } from "./integrations/paste_ee.js";
import { argument_specification_from_manual, check_specification, ParamValueType } from "./utilities/runtime_typeguard.js";
import { get_args, handle_GetArgsResult } from "./utilities/argument_processing/arguments.js";
import { GetArgsResult, ValidatedArguments } from "./utilities/argument_processing/arguments_types.js";
import { automatic_dispatch, command, validate } from "./module_decorators.js";
import {
    create_designate_handle,
    DesignateRemoveUserResult,
    DesignateUserStatus,
    designate_remove_user,
    designate_set_user,
    designate_user_status,
} from "./designate.js";

export const GiveCheck = async (message: Message): Promise<boolean> => {
    try {
        await message.react("✅");
        return true;
    } catch (err) {
        return false;
    }
};

export const enum BotCommandProcessResultType {
    DidNotSucceed,
    Succeeded,
    Unauthorized,
    Invalid,
    PassThrough,
}

export interface BotCommandProcessResults {
    type: BotCommandProcessResultType;
    not_authorized_message?: string;
}

export type BotCommandProcess =
    | ((message: Message, client: Client, pool: Pool, prefix: string) => Promise<BotCommandProcessResults> | BotCommandProcessResults)
    | ((message: Message, client: Client, pool: Pool) => Promise<BotCommandProcessResults> | BotCommandProcessResults);

export const enum BotCommandMetadataKey {
    Permissions = "typedyno_botcommand:permissions",
    Manual = "typedyno_botcommand:command_manual",
    NoUseNoSee = "typedyno_botcommand:no_use_no_see",
}
export abstract class BotCommand {
    static readonly manual: CommandManual = { name: "blank", arguments: [], description: "You shouldn't be seeing this.", syntax: "" };

    static readonly no_use_no_see = false as boolean;
    static readonly permissions = undefined as Permissions | undefined;

    constructor(command_manual: CommandManual, no_use_no_see: boolean, permissions?: Permissions) {
        // Optional more specific permissions. If a module is unavailable, this command will be too,
        // however these permissions can further restrict certain commands.
        Reflect.defineMetadata(BotCommandMetadataKey.Permissions, permissions, this);
        // The command manual object which will be added to %commands results when the module (if it's part of a module) is available.
        Reflect.defineMetadata(BotCommandMetadataKey.Manual, command_manual, this);
        // Whether users that are restricted from using this command are also restricted from seeing that it exists
        Reflect.defineMetadata(BotCommandMetadataKey.NoUseNoSee, no_use_no_see, this);
    }

    // Command should return whether the command succeeded or not
    abstract process(message: Message, client: Client, pool: Pool, prefix: string): PromiseLike<BotCommandProcessResults>;
}

export type ArgumentValues<Manual extends SubcommandManual> = Exclude<GetArgsResult<Manual["arguments"]>["values"], null>;

/*export abstract class ParentCommand<Manual extends MultifacetedCommandManual> extends BotCommand {
    constructor(command_manual: Manual, no_use_no_see: boolean, permissions?: Permissions) {
        super(command_manual, no_use_no_see, permissions);
        Reflect.defineMetadata(BotCommandMetadataKey.Permissions, permissions, this);
        Reflect.defineMetadata(BotCommandMetadataKey.Manual, command_manual, this);
        Reflect.defineMetadata(BotCommandMetadataKey.NoUseNoSee, no_use_no_see, this);
    }

    abstract before_dispatch(subcommand_name: string, message: Message, client: Client, pool: Pool, prefix: string): Promise<BotCommandProcessResults>

    async process(message: Message, client: Client, pool: Pool, prefix: string): Promise<BotCommandProcessResults> {
    }
}*/

export abstract class Subcommand<Manual extends SubcommandManual> extends BotCommand {
    constructor(command_manual: Manual, no_use_no_see: boolean, permissions?: Permissions) {
        super(command_manual, no_use_no_see, permissions);
        Reflect.defineMetadata(BotCommandMetadataKey.Permissions, permissions, this);
        Reflect.defineMetadata(BotCommandMetadataKey.Manual, command_manual, this);
        Reflect.defineMetadata(BotCommandMetadataKey.NoUseNoSee, no_use_no_see, this);
    }

    abstract activate(
        values: ValidatedArguments<Manual>,
        message: Message,
        client: Client,
        pool: Pool,
        prefix: string,
    ): PromiseLike<BotCommandProcessResults>;

    async process(message: Message, client: Client, pool: Pool, prefix: string): Promise<BotCommandProcessResults> {
        const manual = manual_of(this) as SubcommandManual;
        const failed = { type: BotCommandProcessResultType.DidNotSucceed };

        const args = get_args(prefix, manual, message.content);

        const result = await handle_GetArgsResult(message, args, prefix);

        if (result === false) {
            return failed;
        }

        const spec = argument_specification_from_manual(manual.arguments);
        const values = check_specification(args.values, "jumprole_set", spec);

        if (values === false || values === null) return { type: BotCommandProcessResultType.Invalid };

        if (is_text_channel(message) === false) {
            return { type: BotCommandProcessResultType.Unauthorized };
        }

        return await this.activate(values as ValidatedArguments<Manual>, message, client, pool, prefix);
    }
}

export const is_valid_BotCommand = function (thing: any): thing is BotCommand {
    return thing instanceof BotCommand;
};

export const is_valid_ModuleCommand = is_valid_BotCommand;

export const enum MakeCommandRegexResult {
    IllegalCommandName = "IllegalCommandName",
    IllegalPrefix = "IllegalPrefix",
}

export const make_command_regex = function (command_name: string, prefix: string): RegExp | MakeCommandRegexResult {
    let use_global_prefix = false;

    if (is_string(command_name) === false) {
        log(
            `Unable to check message compliance with command "${String(
                command_name,
            )}": Illegal non-string argument. This command will be skipped in the message-command checking process.`,
            LogType.Mismatch,
        );
        return MakeCommandRegexResult.IllegalCommandName;
    } else if (/\s{1,}/.test(command_name)) {
        log(
            `Unable to check message compliance with command "${command_name}": Command name contains whitespace characters, which could cause conflicts with other commands. This command will be skipped in the message-command checking process.`,
            LogType.Error,
        );
        return MakeCommandRegexResult.IllegalCommandName;
    } else if (is_string(prefix) === false && prefix !== GLOBAL_PREFIX) {
        log(
            `Unable to check message compliance under prefix "${String(
                prefix,
            )}": Illegal non-string argument. This prefix setting will be ignored in favor of the global prefix, "${GLOBAL_PREFIX}".`,
            LogType.FixedError,
        );
        use_global_prefix = true;
    } else if (is_string(prefix) === false) {
        log(
            `Unable to check message compliance under prefix "${String(
                prefix,
            )}": Illegal non-string argument. This prefix is also the same as the global prefix. NO COMMANDS WILL FUNCTION UNTIL THIS ERROR IS FIXED.`,
            LogType.Error,
        );
        return MakeCommandRegexResult.IllegalPrefix;
    }

    if (use_global_prefix === false) {
        return new RegExp(`^${escape_reg_exp(prefix)}\\s*${escape_reg_exp(command_name)}`, "i");
    } else {
        return new RegExp(`^${escape_reg_exp(GLOBAL_PREFIX)}\\s*${escape_reg_exp(command_name)}`, "i");
    }
};

export interface ParseMessageResult {
    did_find_command: boolean;
    no_use_no_see?: boolean;
    command_worked?: boolean;
    command_authorized?: boolean;
    call_to_return_span_ms?: number;
    command_name?: string;
    did_use_module: boolean;
    module_name: string | null;
    not_authorized_reason?: string;
}

/**
 * Checks the message against global and modular commands.
 * @param message Message to parse
 * @param client Bot client object, may be used in action command requires
 * @returns Whether the message was found to be a valid command, and
 */
export const process_message_for_commands = async function (message: Message, client: Client, pool: Pool): Promise<ParseMessageResult> {
    const prefix = await get_prefix(message.guild, pool);

    let valid_command: BotCommand | null = null;

    // ALWAYS check stock bot commands first. NEVER let a module command override a stock command, although we would
    // hope that would've been caught earlier.
    for (const bot_command of STOCK_BOT_COMMANDS) {
        const manual = manual_of(bot_command);
        if (manual === undefined) {
            log(`process_message_for_commands skipped stock bot function: instance had no manual saved as metadata. Continuing...`, LogType.Error);
            continue;
        }

        const regex = make_command_regex(manual.name, prefix);

        if (regex instanceof RegExp) {
            log(
                `Made regex ${regex.source} to test for command "${manual.name}"...`,
                LogType.Status,
                DebugLogType.ProcessMessageForCommandsFunctionDebug,
            );
            log(`Checking message ${message.content}...`, LogType.Status, DebugLogType.ProcessMessageForCommandsFunctionDebug);
        }

        if (regex instanceof RegExp && regex.test(message.content) && valid_command === null) {
            log(`Regex match found!`, LogType.Status, DebugLogType.ProcessMessageForCommandsFunctionDebug);
            if (allowed(message, permissions_of(bot_command))) {
                log(`Match is valid, permissions are a go.`, LogType.Status, DebugLogType.ProcessMessageForCommandsFunctionDebug);
                valid_command = bot_command;
            } else if (is_no_use_no_see(bot_command) === false) {
                log(`Match is not valid, permissions are restrictive.`, LogType.Status, DebugLogType.ProcessMessageForCommandsFunctionDebug);
                return {
                    did_find_command: true,
                    command_authorized: false,
                    command_name: manual.name,
                    did_use_module: false,
                    module_name: null,
                };
            }
        }
    }

    let using_module: string | null = null;

    // Check loaded module commands
    for (const module of await MODULES) {
        if (allowed(message, module.permissions)) {
            // Skip checking command call if the module is already restricted here
            // Check module commands
            for (const bot_command of module.functions) {
                const manual = manual_of(bot_command);
                if (manual === undefined) {
                    log(
                        `process_message_for_commands skipped bot command from module "${module.name}": instance had no manual saved as metadata. Continuing...`,
                        LogType.Error,
                    );
                    continue;
                }

                const regex = make_command_regex(manual.name, prefix);
                if (regex instanceof RegExp && regex.test(message.content) && valid_command === null && using_module === null) {
                    if (allowed(message, permissions_of(bot_command))) {
                        valid_command = bot_command;
                        using_module = module.name;
                    } else if (is_no_use_no_see(bot_command) === false) {
                        return {
                            did_find_command: true,
                            command_authorized: false,
                            command_name: manual.name,
                            did_use_module: true,
                            module_name: module.name,
                        };
                    }
                }
            }
        }
    }

    // Check permissions validity of valid_command
    if (is_valid_BotCommand(valid_command) && allowed(message, permissions_of(valid_command))) {
        // Run the command
        const start_time = performance.now();
        const result = await valid_command.process(message, client, pool, prefix);
        const end_time = performance.now();

        return {
            did_find_command: true,
            no_use_no_see: is_no_use_no_see(valid_command),
            command_worked: result.type === BotCommandProcessResultType.Succeeded,
            command_authorized: result.type !== BotCommandProcessResultType.Unauthorized,
            call_to_return_span_ms: end_time - start_time,
            command_name: manual_of(valid_command)!.name,
            did_use_module: using_module !== null,
            module_name: using_module,
            not_authorized_reason: result.not_authorized_message,
        };
    } else {
        // Didn't find a command
        return {
            did_find_command: false,
            did_use_module: false,
            module_name: null,
        };
    }
};

namespace StockCommands {
    @command()
    export class GetCommands extends BotCommand {
        constructor() {
            super(GetCommands.manual, GetCommands.no_use_no_see, GetCommands.permissions);
        }

        static readonly manual = {
            name: "commands",
            arguments: [],
            description: "Links to a paste where you can view all the available bot commands.",
            syntax: "<prefix>commands",
        } as const;

        static readonly no_use_no_see = false;

        static readonly permissions = undefined;

        async process(message: Message, _client: Client, _pool: Pool, prefix: string): Promise<BotCommandProcessResults> {
            const paste = await make_manual(message, prefix);

            if (is_string(paste.error)) {
                message.channel.send(`paste.ee API failed to create paste: contact ${MAINTAINER_TAG} for help fixing this error.`);
                return { type: BotCommandProcessResultType.DidNotSucceed };
            } else if (is_string(paste.paste?.id)) {
                message.channel.send(
                    `You can find the command manual here: ${url(
                        <Paste>paste.paste,
                    )}. Note that certain commands may be hidden if you lack permission to use them.`,
                );
                return { type: BotCommandProcessResultType.Succeeded };
            }

            const err = `'commands' process: internal error - make_manual neither returned an error nor a paste. Returning BotCommandProcessResultType.DidNotSucceed`;

            message.channel.send(err);
            log(err, LogType.Error);
            return {
                type: BotCommandProcessResultType.DidNotSucceed,
            };
        }
    }

    @command()
    export class PrefixGet extends Subcommand<typeof PrefixGet.manual> {
        constructor() {
            super(PrefixGet.manual, PrefixGet.no_use_no_see, PrefixGet.permissions);
        }

        static readonly manual = {
            name: "get",
            arguments: [],
            description: "Tells you the only valid prefix that you can use on this server to activate the bot's commands.",
            syntax: "<prefix>prefix get",
        } as const;

        static readonly no_use_no_see = false;
        static readonly permissions = undefined as Permissions | undefined;

        @validate() async activate(
            _args: ValidatedArguments<typeof PrefixGet.manual>,
            message: Message,
            _client: Client,
            pool: Pool,
            _prefix: string,
        ) {
            const prefix_result = await get_prefix(message.guild, pool);
            if (prefix_result.trim() === GLOBAL_PREFIX.trim()) {
                message.channel.send(`The global prefix is "${prefix_result}" and it hasn't been changed locally, but you already knew that.`);
                return {
                    type: BotCommandProcessResultType.Succeeded,
                };
            } else {
                message.channel.send(`The local prefix is "${prefix_result}", but you already knew that.`);
                return {
                    type: BotCommandProcessResultType.Succeeded,
                };
            }
        }
    }

    @command()
    export class PrefixSet extends Subcommand<typeof PrefixSet.manual> {
        constructor() {
            super(PrefixSet.manual, PrefixSet.no_use_no_see, PrefixSet.permissions);
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
                    further_constraint: ParamValueType.Snowflake,
                },
            ],
            description:
                "Sets the provided string as the local prefix, overriding the global prefix.\nYou must be a bot admin or have designated privileges to use this command.",
            syntax: "<prefix>prefix set NEW $1{opt $2}[ SERVER $2]",
        } as const;

        static readonly no_use_no_see = false;
        static readonly permissions = undefined as Permissions | undefined;

        @validate() async activate(
            args: ValidatedArguments<typeof PrefixSet.manual>,
            message: Message,
            client: Client,
            pool: Pool,
            _prefix: string,
        ): Promise<BotCommandProcessResults> {
            if (CONFIG.admins.includes(message.author.id)) {
                const result = await set_prefix(
                    args.guild_id === null ? (message.guild as Guild) : await client.guilds.fetch(args.guild_id as string),
                    pool,
                    args.new_prefix,
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
                        message.channel.send(
                            "Setting a local prefix the same as the global prefix is not allowed for flexibility reasons. However, since the prefix you wanted to set was already the prefix, you can use it just like you would if this command had worked.",
                        );
                        return {
                            type: BotCommandProcessResultType.Succeeded,
                        };
                    } else {
                        message.channel.send(`set_prefix failed: contact ${MAINTAINER_TAG} for help fixing this error.`);
                        log(`set_prefix unexpectedly threw an error:`, LogType.Error);
                        log(result.result as string, LogType.Error);
                        return {
                            type: BotCommandProcessResultType.DidNotSucceed,
                        };
                    }
                }
            } else {
                return {
                    type: BotCommandProcessResultType.Unauthorized,
                    not_authorized_message: "You must be a bot admin or otherwise authorized person to set a server prefix.",
                };
            }
        }
    }

    @command()
    export class Prefix extends BotCommand {
        constructor() {
            super(Prefix.manual, Prefix.no_use_no_see, Prefix.permissions);
        }

        static readonly manual = {
            name: "prefix",
            subcommands: [PrefixGet.manual, PrefixSet.manual],
            description: "Manage or get the prefix for your current server.",
        } as const;

        static readonly no_use_no_see = false;
        static readonly permissions = undefined;

        @automatic_dispatch(new PrefixGet(), new PrefixSet()) async process(
            _message: Message,
            _client: Client,
            _pool: Pool,
            _prefix: string,
        ): Promise<BotCommandProcessResults> {
            log(`Prefix command: passing through to subcommand`, LogType.Status, DebugLogType.AutomaticDispatchPassThrough);
            return { type: BotCommandProcessResultType.PassThrough };
        }
    }

    @command()
    export class Info extends BotCommand {
        constructor() {
            super(Info.manual, Info.no_use_no_see, Info.permissions);
        }

        static readonly manual = {
            name: "info",
            arguments: [],
            syntax: "<prefix>info",
            description: "Provides a description of useful commands and the design of the bot.",
        } as const;

        static readonly no_use_no_see = false;

        static readonly permissions = undefined;

        async process(message: Message, _client: Client, _pool: Pool, prefix: string): Promise<BotCommandProcessResults> {
            let base_info = `**Useful commands**:\n${prefix}commands: Lists the commands this bot has.\n**GitHub**: https://github.com/TigerGold59/typedyno`;
            if (prefix === GLOBAL_PREFIX) {
                base_info += `\nThe prefix on this server is the same as the global prefix, ${GLOBAL_PREFIX}.`;
            } else {
                base_info += `\nThe global prefix, which applies to servers that haven't set a local prefix, is ${GLOBAL_PREFIX}.`;
            }

            message.channel.send(base_info);
            return {
                type: BotCommandProcessResultType.Succeeded,
            };
        }
    }

    @command()
    export class DesignateSet extends Subcommand<typeof DesignateSet.manual> {
        constructor() {
            super(DesignateSet.manual, DesignateSet.no_use_no_see, DesignateSet.permissions);
        }

        static readonly manual = {
            name: "set",
            description: "Designate people who have power in the server to do things like set a prefix, designate others, and set mod channels.",
            arguments: [
                {
                    name: "user ID",
                    id: "user_snowflake",
                    optional: false,
                    further_constraint: ParamValueType.Snowflake,
                },
                {
                    name: "allow designating others",
                    id: "allow_designating",
                    optional: true,
                    further_constraint: ParamValueType.BooleanS,
                },
            ],
            syntax: "<prefix>designate set USER $1{opt $2}[ FULL $2]",
        } as const;

        static readonly no_use_no_see = true;
        static readonly permissions = undefined as Permissions | undefined;

        @validate() async activate(
            args: ValidatedArguments<typeof DesignateSet.manual>,
            message: Message,
            _client: Client,
            pool: Pool,
            prefix: string,
        ): Promise<BotCommandProcessResults> {
            const reply = async (response: string): Promise<void> => {
                await message.channel.send(response);
            };

            const target_handle = create_designate_handle(args.user_snowflake, message);
            const asker_handle = create_designate_handle(message.author.id, message);
            const user_status = await designate_user_status(asker_handle, pool);
            const intention = args.allow_designating === true;
            switch (user_status) {
                case DesignateUserStatus.UserIsAdmin:
                case DesignateUserStatus.FullAccess: {
                    const new_status = await designate_set_user(target_handle, intention, pool);
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

    @command()
    export class DesignateRemove extends Subcommand<typeof DesignateRemove.manual> {
        constructor() {
            super(DesignateRemove.manual, DesignateRemove.no_use_no_see, DesignateRemove.permissions);
        }

        static readonly manual = {
            name: "remove",
            description: "Remove the power of people who have designate privileges.",
            arguments: [
                {
                    name: "user ID",
                    id: "user_snowflake",
                    optional: false,
                    further_constraint: ParamValueType.Snowflake,
                },
            ],
            syntax: "<prefix>designate remove USER $1",
        } as const;

        static readonly no_use_no_see = true;
        static readonly permissions = undefined as Permissions | undefined;

        @validate() async activate(
            args: ValidatedArguments<typeof DesignateSet.manual>,
            message: Message,
            _client: Client,
            pool: Pool,
            prefix: string,
        ): Promise<BotCommandProcessResults> {
            const reply = async (response: string): Promise<void> => {
                await message.channel.send(response);
            };

            const target_handle = create_designate_handle(args.user_snowflake, message);
            const asker_handle = create_designate_handle(message.author.id, message);
            const user_status = await designate_user_status(asker_handle, pool);
            switch (user_status) {
                case DesignateUserStatus.UserIsAdmin:
                case DesignateUserStatus.FullAccess: {
                    const result = await designate_remove_user(target_handle, pool);
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

    @command()
    export class DesignateGet extends Subcommand<typeof DesignateGet.manual> {
        constructor() {
            super(DesignateGet.manual, DesignateGet.no_use_no_see, DesignateGet.permissions);
        }

        static readonly manual = {
            name: "get",
            description: "Check someone's designate privileges.",
            arguments: [
                {
                    name: "user ID",
                    id: "user_snowflake",
                    optional: true,
                    further_constraint: ParamValueType.Snowflake,
                },
            ],
            syntax: "<prefix>designate get{opt $1}[ USER $1]",
        } as const;

        static readonly no_use_no_see = false;
        static readonly permissions = undefined;

        @validate() async activate(
            args: ValidatedArguments<typeof DesignateGet.manual>,
            message: Message,
            _client: Client,
            pool: Pool,
            prefix: string,
        ): Promise<BotCommandProcessResults> {
            const reply = async (response: string): Promise<void> => {
                await message.channel.send(response);
            };
            const target_id = args.user_snowflake === null ? message.author.id : args.user_snowflake;
            const start_string = args.user_snowflake === null ? `You're` : `The user with ID ${args.user_snowflake} is`;
            const target_handle = create_designate_handle(target_id, message);

            const status = await designate_user_status(target_handle, pool);

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
                    await reply(`${start_string} currently at the level of partial access (unable to designate others, but otherwise priviledged).`);
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

    @command()
    export class Designate extends BotCommand {
        constructor() {
            super(Designate.manual, Designate.no_use_no_see, Designate.permissions);
        }
        static readonly manual = {
            name: "designate",
            description: "Manage user permissions in this server.",
            subcommands: [DesignateSet.manual, DesignateRemove.manual, DesignateGet.manual],
        } as const;

        static readonly no_use_no_see = false;
        static readonly permissions = undefined;

        @automatic_dispatch(new DesignateSet(), new DesignateRemove(), new DesignateGet()) async process(
            _message: Message,
            _client: Client,
            _pool: Pool,
            _prefix: string,
        ): Promise<BotCommandProcessResults> {
            log(`Designate command: passing through to subcommand`, LogType.Status, DebugLogType.AutomaticDispatchPassThrough);
            return { type: BotCommandProcessResultType.PassThrough };
        }
    }
}

export const STOCK_BOT_COMMANDS: BotCommand[] = [
    new StockCommands.GetCommands(),
    new StockCommands.Info(),
    new StockCommands.Prefix(),
    new StockCommands.Designate(),
];
