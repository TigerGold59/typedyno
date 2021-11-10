import { Message, Client, User, Guild, Interaction, CommandInteraction, TextChannel, MessageEmbed } from "discord.js";
import { MakesSingleRequest, PoolInstance as Pool, Queryable, UsesClient, use_client, UsingClient } from "./pg_wrapper.js";
import {
    CommandManual,
    SubcommandManual,
    argument_structure_from_manual,
    MultifacetedCommandManual,
    indent,
    SimpleCommandManual,
} from "./command_manual.js";
import { get_prefix } from "./integrations/server_prefixes.js";
import { GLOBAL_PREFIX, MODULES } from "./main.js";
import { performance } from "perf_hooks";
import { DebugLogType, log, LogType } from "./utilities/log.js";
import { allowed, Permissions } from "./utilities/permissions.js";
import { escape_reg_exp, is_boolean, is_string, is_text_channel, TextChannelMessage } from "./utilities/typeutils.js";
import {
    GetDeterminationTagAsStringResultType,
    get_args,
    get_determination_tag_as_str,
    get_first_matching_subcommand,
    handle_GetArgsResult,
    is_call_of,
} from "./utilities/argument_processing/arguments.js";
import { ArgumentValues, ValidatedArguments } from "./utilities/argument_processing/arguments_types.js";
import { log_stack } from "./utilities/runtime_typeguard/runtime_typeguard.js";

export const GREEN_CHECK = "✅";

export const GiveCheck = async (message: Message): Promise<boolean> => {
    try {
        await message.react(GREEN_CHECK);
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
export abstract class BotCommand<ManualType extends CommandManual = CommandManual> {
    abstract readonly manual: ManualType;
    abstract readonly no_use_no_see: boolean;
    abstract readonly permissions: Permissions | undefined;
    readonly id = Symbol();

    constructor() {}

    // Command should return whether the command succeeded or not
    abstract process(message: Message, client: Client, queryable: Queryable<UsesClient>, prefix: string): PromiseLike<BotCommandProcessResults>;
}

export type Replier = (response: string, use_prefix?: boolean) => Promise<void>;

export const MakeReplier = (interaction: BotInteraction, determination_tag_string: string) => {
    return async (response: string, use_prefix?: boolean) => {
        let use_prefix_intention = is_boolean(use_prefix) ? use_prefix : true;
        await interaction.reply(`${use_prefix_intention ? `${determination_tag_string}: ` : ""}${response}`);
    };
};

export type ManualOf<Command extends Subcommand<SubcommandManual>> = Command extends Subcommand<infer T> ? T : never;

export const enum BotInteractionCreationResultType {
    NotMessageOrInteraction,
    NotCommandInteraction,
    NotInGuildTextChannel,
    Succeeded,
}

export type BotInteractionCreationResult =
    | { type: BotInteractionCreationResultType.Succeeded; interaction: BotInteraction }
    | { type: Exclude<BotInteractionCreationResultType, BotInteractionCreationResultType.Succeeded> };

type CompleteCommandInteraction = CommandInteraction & { channel: TextChannel } & { guild: Guild };
export class BotInteraction {
    readonly author: User;
    readonly guild: Guild;
    readonly channel: TextChannel;
    readonly #_reply: (message: string) => Promise<Message<boolean> | void>;
    readonly #_give_check: () => Promise<boolean>;
    readonly #_embed: (embed: MessageEmbed) => Promise<boolean>;
    readonly #_follow_up: (message: string) => Promise<Message<boolean> | boolean>;

    constructor(item: TextChannelMessage | CompleteCommandInteraction) {
        if (item instanceof Message) {
            this.author = item.author;
            this.#_reply = item.channel.send.bind(item.channel);
            this.#_give_check = GiveCheck.bind(globalThis, item);
            this.#_embed = async (embed: MessageEmbed) => {
                try {
                    await item.channel.send({
                        embeds: [embed],
                    });
                    return true;
                } catch (err) {
                    return false;
                }
            };
            this.#_follow_up = item.channel.send.bind(item.channel);
        } else {
            this.author = item.user;
            this.#_reply = async (message: string) => {
                return await item.reply({
                    content: message,
                });
            };
            this.#_give_check = async () => {
                try {
                    await item.reply({
                        content: GREEN_CHECK,
                        ephemeral: true,
                    });
                    return true;
                } catch (err) {
                    return false;
                }
            };
            this.#_embed = async (embed: MessageEmbed) => {
                try {
                    await item.reply({
                        embeds: [embed],
                    });
                    return true;
                } catch (err) {
                    return false;
                }
            };
            this.#_follow_up = async (message: string) => {
                try {
                    await item.followUp({
                        content: message,
                    });
                    return true;
                } catch (err) {
                    return false;
                }
            };
        }
        this.guild = item.guild;
        this.channel = item.channel;
    }

    async embed(embed: MessageEmbed): Promise<boolean> {
        return await this.#_embed(embed);
    }

    async reply(message: string) {
        await this.#_reply(message);
    }

    async follow_up(message: string) {
        return await this.#_follow_up(message);
    }

    async give_check() {
        return await this.#_give_check();
    }

    static readonly Create = (item: Message | Interaction): BotInteractionCreationResult => {
        if (item instanceof Message) {
            if (is_text_channel(item)) {
                return { type: BotInteractionCreationResultType.Succeeded, interaction: new BotInteraction(item) };
            } else {
                return { type: BotInteractionCreationResultType.NotInGuildTextChannel };
            }
        } else if (item instanceof Interaction) {
            if (item.isCommand()) {
                if (item.channel instanceof TextChannel && item.guild instanceof Guild) {
                    return { type: BotInteractionCreationResultType.Succeeded, interaction: new BotInteraction(item as CompleteCommandInteraction) };
                } else {
                    return { type: BotInteractionCreationResultType.NotInGuildTextChannel };
                }
            } else {
                return { type: BotInteractionCreationResultType.NotCommandInteraction };
            }
        } else {
            return { type: BotInteractionCreationResultType.NotMessageOrInteraction };
        }
    };
}

export abstract class NoParametersCommand extends BotCommand<SimpleCommandManual> {
    constructor() {
        super();
    }

    abstract run_activate(
        interaction: BotInteraction,
        client: Client,
        queryable: Queryable<UsesClient>,
        prefix: string,
    ): PromiseLike<BotCommandProcessResults>;

    async process(message: Message, client: Client, queryable: Queryable<UsesClient>, prefix: string): Promise<BotCommandProcessResults> {
        let full_interaction_result = BotInteraction.Create(message);

        switch (full_interaction_result.type) {
            case BotInteractionCreationResultType.NotMessageOrInteraction:
            case BotInteractionCreationResultType.NotInGuildTextChannel: {
                return {
                    type: BotCommandProcessResultType.Unauthorized,
                    not_authorized_message: "The command must be used in a guild text channel.",
                };
            }
            case BotInteractionCreationResultType.NotCommandInteraction: {
                return { type: BotCommandProcessResultType.Invalid };
            }
            case BotInteractionCreationResultType.Succeeded: {
                return await this.run_activate(full_interaction_result.interaction, client, queryable, prefix);
            }
        }
    }
}
export abstract class Subcommand<Manual extends SubcommandManual> extends BotCommand<Manual> {
    abstract readonly manual: Manual;

    constructor() {
        super();
    }

    determination_tag_string(prefix: string): string {
        let result = get_determination_tag_as_str(prefix, this.manual);
        if (result.type === GetDeterminationTagAsStringResultType.Failed) {
            throw new Error(`${this.manual.name}: failed to get determination tag`);
        } else {
            return result.result;
        }
    }

    is_attempted_use(message: TextChannelMessage, _client: Client, prefix: string): boolean {
        let result = is_call_of(prefix, this.manual, message.content);
        if (result.succeeded) {
            return result.is_call;
        } else {
            log(
                `is_attempted_use: syntax string parsing failed - error: ${result.syntax_string_error.reason}, location: ${result.syntax_string_error.index}`,
                LogType.Error,
            );
            return false;
        }
    }

    abstract activate(
        values: ValidatedArguments<Manual>,
        interaction: BotInteraction,
        client: Client,
        pg_client: UsingClient,
        prefix: string,
        reply: Replier,
    ): PromiseLike<BotCommandProcessResults>;

    async run_activate(
        args: ArgumentValues<Manual>,
        interaction: BotInteraction,
        client: Client,
        queryable: Queryable<MakesSingleRequest>,
        prefix: string,
    ): Promise<BotCommandProcessResults> {
        const pg_client = await use_client(queryable, this.determination_tag_string(prefix));
        const manual = this.manual;
        const spec = argument_structure_from_manual(manual);
        const values = spec.check(args);

        if (values.succeeded === false) return { type: BotCommandProcessResultType.Invalid };

        let result = await this.activate(
            // @ts-expect-error I am 99% sure this is just a bug
            values.normalized as ValidatedArguments<Manual>,
            interaction,
            client,
            pg_client,
            prefix,
            MakeReplier(interaction, this.determination_tag_string(prefix)),
        );

        pg_client.handle_release();
        return result;
    }

    async process(message: Message, client: Client, pool: Pool, prefix: string): Promise<BotCommandProcessResults> {
        const manual = this.manual;
        const failed = { type: BotCommandProcessResultType.DidNotSucceed };

        const args = get_args(prefix, manual, message.content);

        let full_interaction_result = BotInteraction.Create(message);

        switch (full_interaction_result.type) {
            case BotInteractionCreationResultType.NotMessageOrInteraction:
            case BotInteractionCreationResultType.NotInGuildTextChannel: {
                return {
                    type: BotCommandProcessResultType.Unauthorized,
                    not_authorized_message: "The command must be used in a guild text channel.",
                };
            }
            case BotInteractionCreationResultType.NotCommandInteraction: {
                return { type: BotCommandProcessResultType.Invalid };
            }
            case BotInteractionCreationResultType.Succeeded: {
                const result = await handle_GetArgsResult(full_interaction_result.interaction, this.manual.name, args, prefix);

                if (result === false) {
                    return failed;
                }

                const spec = argument_structure_from_manual(manual);
                const values = spec.check(args.values);

                if (values.succeeded === false) {
                    log_stack(values, `${manual.name} command process`);
                    return { type: BotCommandProcessResultType.Invalid };
                }

                let pg_client = await use_client(pool, this.determination_tag_string(prefix));

                let activate_result = await this.run_activate(
                    // @ts-expect-error I have no clue why this errors
                    values.normalized as ValidatedArguments<Manual>,
                    message as TextChannelMessage,
                    client,
                    pg_client,
                    prefix,
                );

                pg_client.handle_release();

                return activate_result;
            }
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
    }

    abstract pre_dispatch(
        subcommand: Subcommand<SubcommandManual>,
        interaction: BotInteraction,
        client: Client,
        queryable: Queryable<MakesSingleRequest>,
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

        let full_interaction_result = BotInteraction.Create(message);

        switch (full_interaction_result.type) {
            case BotInteractionCreationResultType.NotMessageOrInteraction:
            case BotInteractionCreationResultType.NotInGuildTextChannel: {
                return {
                    type: BotCommandProcessResultType.Unauthorized,
                    not_authorized_message: "The command must be used in a guild text channel.",
                };
            }
            case BotInteractionCreationResultType.NotCommandInteraction: {
                return { type: BotCommandProcessResultType.Invalid };
            }
            case BotInteractionCreationResultType.Succeeded: {
                const found_command = this.subcommands[subcommand_index];
                const interaction = full_interaction_result.interaction;
                const args_result = get_args(prefix, found, message.content);
                let res = await handle_GetArgsResult(interaction, `${this.manual.name} ${found.name}`, args_result, prefix);

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
                    interaction,
                    client,
                    pool,
                    prefix,
                    MakeReplier(interaction, `${prefix}${this.manual.name}`),
                );

                switch (pre_dispatch_result.type) {
                    case BotCommandProcessResultType.PassThrough: {
                        return await found_command.run_activate(result.normalized, interaction, client, pool, prefix);
                    }
                    default: {
                        return pre_dispatch_result;
                    }
                }
            }
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
    stock_commands: BotCommand[],
    message: Message,
    client: Client,
    pool: Pool,
): Promise<ParseMessageResult> {
    const prefix = await get_prefix(message.guild, pool);

    let valid_command: BotCommand | null = null;

    const full_interaction_result = BotInteraction.Create(message);

    let interaction: BotInteraction;
    if (full_interaction_result.type === BotInteractionCreationResultType.Succeeded) {
        interaction = full_interaction_result.interaction;
    } else {
        return { did_find_command: false, command_authorized: false, did_use_module: false, module_name: null };
    }

    // ALWAYS check stock bot commands first. NEVER let a module command override a stock command, although we would
    // hope that would've been caught earlier.
    for (const bot_command of stock_commands) {
        const manual = bot_command.manual;
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
            if (allowed(interaction, bot_command.permissions)) {
                log(`Match is valid, permissions are a go.`, LogType.Status, DebugLogType.ProcessMessageForCommandsFunctionDebug);
                valid_command = bot_command;
            } else if (bot_command.no_use_no_see === false) {
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
        if (allowed(interaction, module.permissions)) {
            // Skip checking command call if the module is already restricted here
            // Check module commands
            for (const bot_command of module.functions) {
                const manual = bot_command.manual;
                if (manual === undefined) {
                    log(
                        `process_message_for_commands skipped bot command from module "${module.name}": instance had no manual saved as metadata. Continuing...`,
                        LogType.Error,
                    );
                    continue;
                }

                const regex = make_command_regex(manual.name, prefix);
                if (regex instanceof RegExp && regex.test(message.content) && valid_command === null && using_module === null) {
                    if (allowed(interaction, bot_command.permissions)) {
                        valid_command = bot_command;
                        using_module = module.name;
                    } else if (bot_command.no_use_no_see === false) {
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
    if (is_valid_BotCommand(valid_command) && allowed(interaction, valid_command.permissions)) {
        // Run the command
        const start_time = performance.now();
        const result = await valid_command.process(message, client, pool, prefix);
        const end_time = performance.now();

        return {
            did_find_command: true,
            no_use_no_see: valid_command.no_use_no_see,
            command_worked: result.type === BotCommandProcessResultType.Succeeded,
            command_authorized: result.type !== BotCommandProcessResultType.Unauthorized,
            call_to_return_span_ms: end_time - start_time,
            command_name: valid_command.manual.name,
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
