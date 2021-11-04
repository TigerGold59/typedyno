import { Message, Client } from "discord.js";
import { MakesSingleRequest, PoolInstance as Pool, Queryable, UsesClient, use_client, UsingClient } from "./pg_wrapper.js";
import {
    CommandManual,
    manual_of,
    is_no_use_no_see,
    permissions_of,
    SubcommandManual,
    argument_structure_from_manual,
    MultifacetedCommandManual,
    indent,
} from "./command_manual.js";
import { get_prefix } from "./integrations/server_prefixes.js";
import { GLOBAL_PREFIX, MODULES } from "./main.js";
import { performance } from "perf_hooks";
import { DebugLogType, log, LogType } from "./utilities/log.js";
import { allowed, Permissions } from "./utilities/permissions.js";
import { escape_reg_exp, is_boolean, is_string, is_text_channel, TextChannelMessage } from "./utilities/typeutils.js";
import { get_args, get_first_matching_subcommand, handle_GetArgsResult, is_call_of } from "./utilities/argument_processing/arguments.js";
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

export type AnyBotCommand = BotCommand<CommandManual>;
export abstract class BotCommand<ManualType extends CommandManual> {
    abstract readonly manual: ManualType;
    abstract readonly no_use_no_see: boolean;
    abstract readonly permissions: Permissions | undefined;

    constructor() {}

    // Command should return whether the command succeeded or not
    abstract process(message: Message, client: Client, queryable: Queryable<UsesClient>, prefix: string): PromiseLike<BotCommandProcessResults>;
}

export type ArgumentValues<Manual extends SubcommandManual> = Exclude<GetArgsResult<Manual["arguments"]>["values"], null>;

export type Replier = (response: string, use_prefix?: boolean) => Promise<void>;

export const MakeReplier = (message: TextChannelMessage, prefix: string, full_name: string) => {
    return async (response: string, use_prefix?: boolean) => {
        let use_prefix_intention = is_boolean(use_prefix) ? use_prefix : true;
        await message.channel.send(`${use_prefix_intention ? `${prefix}${full_name}: ` : ""}${response}`);
    };
};

export type ManualOf<Command extends Subcommand<SubcommandManual>> = Command extends Subcommand<infer T> ? T : never;

export abstract class Subcommand<Manual extends SubcommandManual> extends BotCommand<Manual> {
    readonly #_parent_name: string;

    get parent_name() {
        return this.#_parent_name;
    }

    abstract readonly manual: Manual;

    constructor(parent_name: string) {
        super();
        this.#_parent_name = parent_name;
        Object.freeze(this);
    }

    full_name(): string {
        return `${this.parent_name} ${this.manual.name}`;
    }

    uppercase_name() {
        let parts = this.full_name().split(" ");

        return parts
            .map(str => {
                let char = str[0];
                return char.toUpperCase() + str.slice(1);
            })
            .join("");
    }

    is_attempted_use(message: TextChannelMessage, _client: Client, prefix: string): boolean {
        let result = is_call_of(prefix, this.manual, message.content);
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
        pg_client: UsingClient,
        prefix: string,
        reply: Replier,
    ): PromiseLike<BotCommandProcessResults>;

    async run_activate(
        args: ValidatedArguments<Manual>,
        message: TextChannelMessage,
        client: Client,
        queryable: Queryable<MakesSingleRequest>,
        prefix: string,
    ): Promise<BotCommandProcessResults> {
        const pg_client = await use_client(queryable, `${this.uppercase_name()}.activate`);
        const manual = manual_of(this);
        const spec = argument_structure_from_manual(manual as SubcommandManual);
        const values = spec.check(args);

        if (values.succeeded === false) return { type: BotCommandProcessResultType.Invalid };

        if (is_text_channel(message)) {
            let result = await this.activate(args, message, client, pg_client, prefix, MakeReplier(message, prefix, this.full_name()));

            pg_client.handle_release();
            return result;
        } else {
            return {
                type: BotCommandProcessResultType.Unauthorized,
                not_authorized_message: "The command was used in a channel that either wasn't in a server or wasn't a text channel.",
            };
        }
    }

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

            let pg_client = await use_client(pool, this.full_name());

            let activate_result = await this.run_activate(
                values.normalized as ValidatedArguments<Manual>,
                message as TextChannelMessage,
                client,
                pg_client,
                prefix,
            );

            pg_client.handle_release();

            return activate_result;
        } else {
            return { type: BotCommandProcessResultType.Unauthorized };
        }
    }
}

export type DispatchDecider = (
    subcommand: Subcommand<SubcommandManual>,
    message: TextChannelMessage,
    pool: Pool,
    prefix: string,
) => PromiseLike<BotCommandProcessResults>;
export abstract class ParentCommand extends BotCommand<MultifacetedCommandManual> {
    readonly subcommands: Subcommand<SubcommandManual>[];
    readonly subcommand_manuals: SubcommandManual[];

    constructor(...subcommands: Subcommand<SubcommandManual>[]) {
        super();
        this.subcommands = subcommands;
        this.subcommand_manuals = this.subcommands.map(x => x.manual);
        Object.freeze(this);
    }

    abstract pre_dispatch(
        subcommand: Subcommand<SubcommandManual>,
        message: TextChannelMessage,
        client: Client,
        pool: Pool,
        prefix: string,
        reply: Replier,
    ): PromiseLike<BotCommandProcessResults>;

    async process(message: Message, client: Client, pool: Pool, prefix: string): Promise<BotCommandProcessResults> {
        const match = get_first_matching_subcommand(prefix, message.content, this.subcommand_manuals);
        if (match === false) {
            await message.channel.send(
                `${prefix}${this.manual.name}: your message had no matching subcommands. Try using '${prefix}commands' to see the syntax for each subcommand.`,
            );
            return { type: BotCommandProcessResultType.DidNotSucceed };
        }

        let subcommand_index = null as number | null;

        const found = this.subcommand_manuals.find((tuple, index) => {
            const predicate = tuple.name === match;
            if (predicate) {
                subcommand_index = index;
                return true;
            }
        });

        // never
        if (found === undefined || subcommand_index === null) {
            await message.channel.send(
                `${prefix}${this.manual.name}: your message had no matching subcommands. Try using '${prefix}commands' to see the syntax for each subcommand.`,
            );
            return { type: BotCommandProcessResultType.DidNotSucceed };
        }

        if (is_text_channel(message)) {
            const found_command = this.subcommands[subcommand_index];

            const args_result = get_args(prefix, found, message.content);
            let res = await handle_GetArgsResult(message, `${this.manual.name} ${found.name}`, args_result, prefix);

            if (res === false) {
                return { type: BotCommandProcessResultType.DidNotSucceed };
            }

            const arg_value_specification = argument_structure_from_manual(found);
            const result = arg_value_specification.check(args_result.values);
            if (result.succeeded === false) {
                await message.channel.send(
                    `${prefix}${this.manual.name}: your message did not have the proper arguments for subcommand ${
                        found.name
                    }. Try using '${prefix}commands' to see the syntax for each subcommand.\n${result.information
                        .map(indent)
                        .map(x => `${x}.`)
                        .join("\n")}`,
                );
                return { type: BotCommandProcessResultType.DidNotSucceed };
            }
            const pre_dispatch_result = await this.pre_dispatch(
                found_command,
                message,
                client,
                pool,
                prefix,
                MakeReplier(message, prefix, this.manual.name),
            );

            switch (pre_dispatch_result.type) {
                case BotCommandProcessResultType.PassThrough: {
                    return await found_command.run_activate(result.normalized, message, client, pool, prefix);
                }
                default: {
                    return pre_dispatch_result;
                }
            }
        } else {
            return { type: BotCommandProcessResultType.Unauthorized };
        }
    }
}

export const is_valid_BotCommand = function (thing: unknown): thing is BotCommand<CommandManual> {
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
    stock_commands: AnyBotCommand[],
    message: Message,
    client: Client,
    pool: Pool,
): Promise<ParseMessageResult> {
    const prefix = await get_prefix(message.guild, pool);

    let valid_command: AnyBotCommand | null = null;

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
