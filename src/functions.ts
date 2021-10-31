import { Message, Client } from "discord.js";
import { PoolInstance as Pool, Queryable, UsesClient } from "./pg_wrapper.js";
import {
    CommandManual,
    manual_of,
    is_no_use_no_see,
    permissions_of,
    SubcommandManual,
    argument_structure_from_manual,
    MultifacetedCommandManual,
} from "./command_manual.js";
import { get_prefix } from "./integrations/server_prefixes.js";
import { GLOBAL_PREFIX, MODULES } from "./main.js";
import { performance } from "perf_hooks";
import { DebugLogType, log, LogType } from "./utilities/log.js";
import { allowed, Permissions } from "./utilities/permissions.js";
import { escape_reg_exp, is_string, is_text_channel, TextChannelMessage } from "./utilities/typeutils.js";
import { get_args, handle_GetArgsResult, is_call_of } from "./utilities/argument_processing/arguments.js";
import { GetArgsResult, ValidatedArguments } from "./utilities/argument_processing/arguments_types.js";
import { log_stack } from "./utilities/runtime_typeguard/runtime_typeguard.js";

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

export const BotCommandMetadataKey = {
    Permissions: Symbol("typedyno_botcommand:permissions"),
    Manual: Symbol("typedyno_botcommand:command_manual"),
    NoUseNoSee: Symbol("typedyno_botcommand:no_use_no_see"),
};
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
    abstract process(message: Message, client: Client, queryable: Queryable<UsesClient>, prefix: string): PromiseLike<BotCommandProcessResults>;
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
    readonly parent_manual: MultifacetedCommandManual;

    constructor(parent_manual: MultifacetedCommandManual, command_manual: Manual, no_use_no_see: boolean, permissions?: Permissions) {
        super(command_manual, no_use_no_see, permissions);
        this.parent_manual = parent_manual;
        Reflect.defineMetadata(BotCommandMetadataKey.Permissions, permissions, this);
        Reflect.defineMetadata(BotCommandMetadataKey.Manual, command_manual, this);
        Reflect.defineMetadata(BotCommandMetadataKey.NoUseNoSee, no_use_no_see, this);
    }

    full_name(): string {
        return `${this.parent_manual.name} ${manual_of(this).name}`;
    }

    is_attempted_use(message: TextChannelMessage, _client: Client, prefix: string): boolean {
        let result = is_call_of(prefix, manual_of(this) as SubcommandManual, message.content);
        if (result.succeeded) {
            return result.is_call;
        } else {
            log(
                `is_attempted_use: syntax string parsing failed - error: ${result.syntax_string_error.map(x => x.toString).join(", location: ")}`,
                LogType.Error,
            );
            return false;
        }
    }

    abstract activate(
        values: ValidatedArguments<Manual>,
        message: TextChannelMessage,
        client: Client,
        queryable: Queryable<UsesClient>,
        prefix: string,
    ): PromiseLike<BotCommandProcessResults>;

    async process(message: Message, client: Client, pool: Pool, prefix: string): Promise<BotCommandProcessResults> {
        const manual = manual_of(this) as SubcommandManual;
        const failed = { type: BotCommandProcessResultType.DidNotSucceed };

        const args = get_args(prefix, manual, message.content);

        if (is_text_channel(message)) {
            const result = await handle_GetArgsResult(message, manual_of(this).name, args, prefix);

            if (result === false) {
                return failed;
            }

            const spec = argument_structure_from_manual(manual);
            const values = spec.check(args.values);

            if (values.succeeded === false) {
                log_stack(values, `${manual.name} command process`);
                return { type: BotCommandProcessResultType.Invalid };
            }

            return await this.activate(values.normalized as ValidatedArguments<Manual>, message as TextChannelMessage, client, pool, prefix);
        } else {
            return { type: BotCommandProcessResultType.Unauthorized };
        }
    }
}

export const is_valid_BotCommand = function (thing: unknown): thing is BotCommand {
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
 * @returns Whether the message was found to be a valid command, and why not if not
 */
// eslint-disable-next-line complexity
export const process_message_for_commands = async function (
    stock_commands: BotCommand[],
    message: Message,
    client: Client,
    pool: Pool,
): Promise<ParseMessageResult> {
    const prefix = await get_prefix(message.guild, pool);

    let valid_command: BotCommand | null = null;

    // ALWAYS check stock bot commands first. NEVER let a module command override a stock command, although we would
    // hope that would've been caught earlier.
    for (const bot_command of stock_commands) {
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
            command_name: manual_of(valid_command).name,
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
