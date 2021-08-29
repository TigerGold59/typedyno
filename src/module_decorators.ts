import { CommandManual, CommandManualType, CommandManualValidation, MultifacetedCommandManual, SubcommandManual } from "./command_manual.js";
import { ArgumentValues, BotCommand, BotCommandMetadataKey, BotCommandProcessResults, BotCommandProcessResultType, Subcommand } from "./functions.js";
import { DebugLogType, log, LogType } from "./utilities/log.js";
import "reflect-metadata";
import { Client, Message } from "discord.js";
import { PoolInstance as Pool } from "./pg_wrapper.js";

import { get_first_matching_subcommand } from "./utilities/argument_processing/arguments.js";
import { argument_specification_from_manual, check_specification } from "./utilities/runtime_typeguard.js";
import { is_text_channel, safe_serialize } from "./utilities/typeutils.js";

type ClassType<Instance extends object> = Function & { prototype: Instance };
// type ConcreteClassType<Instance extends object> = new (...args: any[]) => Instance & { prototype: Instance };

export const subclasses = function <
    InstanceOne extends object,
    ConstructorOne extends ClassType<InstanceOne>,
    InstanceTwo extends object,
    ConstructorTwo extends ClassType<InstanceTwo>,
>(constructor_one: ConstructorOne, constructor_two: ConstructorTwo): boolean {
    return constructor_one.prototype instanceof constructor_two || Object.is(constructor_one, constructor_two);
};

export const value = function <T>(value: T): Promise<T> {
    return new Promise(res => res(value));
};

export function automatic_dispatch<DispatchTargets extends Subcommand<any>[]>(...args: DispatchTargets): MethodDecorator {
    return function (
        target: { constructor: new (...args: any[]) => BotCommand },
        _property_key: string | symbol,
        descriptor: TypedPropertyDescriptor<Function>,
    ): void | TypedPropertyDescriptor<Function> {
        const target_name = target.constructor.name;
        const method_body = descriptor.value;
        if (method_body === undefined) {
            log(
                `automatic_dispatch decorator: applied to method which took value of undefined (what?). Throwing a TypeError (unacceptable)`,
                LogType.Error,
            );
            throw new TypeError(`Invalid application of automatic_dispatch decorator to undefined method "${target_name}"`);
        }
        if (subclasses(target.constructor, BotCommand) === false) {
            log(
                `automatic_dispatch decorator: applied to constructor "${target_name}" which doesn't extend BotCommand. Throwing a TypeError (unacceptable)`,
                LogType.Error,
            );
            throw new TypeError(`Invalid application of automatic_dispatch decorator to non-BotCommand subclass type "${target_name}"`);
        }
        if (method_body instanceof Function === false) {
            log(`automatic_dispatch decorator: applied to non-method object. Throwing a TypeError (unacceptable)`, LogType.Error);
            throw new TypeError(`Invalid application of automatic_dispatch decorator to non-method.`);
        }
        const metadata_manual = Reflect.getMetadata(BotCommandMetadataKey.Manual, target);
        log(`metadata_manual is ${typeof metadata_manual}`, LogType.Status, DebugLogType.Decorators);
        log(safe_serialize(metadata_manual), LogType.Status, DebugLogType.Decorators);
        const static_manual = (target as any).constructor.manual;
        log(`static_manual is ${typeof static_manual}`, LogType.Status, DebugLogType.Decorators);
        log(safe_serialize(static_manual), LogType.Status, DebugLogType.Decorators);

        const manual: CommandManual | undefined = metadata_manual === undefined ? static_manual : metadata_manual;
        log(`manual is ${typeof manual}`, LogType.Status, DebugLogType.Decorators);
        log(safe_serialize(manual), LogType.Status, DebugLogType.Decorators);
        const manual_type = CommandManualValidation.get_type(manual);

        switch (manual_type) {
            case CommandManualType.Invalid: {
                log(`automatic_dispatch decorator: applied with invalid manual argument! Throwing a TypeError (unacceptable)`, LogType.Error);
                throw new TypeError(`Invalid application of automatic_dispatch decorator with non-CommandManual argument`);
            }
            case CommandManualType.MultifacetedCommandManual: {
                descriptor.value = async function (message: Message, client: Client, pool: Pool, prefix: string): Promise<BotCommandProcessResults> {
                    const subcommands = args.map(command_value =>
                        Reflect.getMetadata(BotCommandMetadataKey.Manual, command_value),
                    ) as SubcommandManual[];
                    const subcommands_and_name = subcommands.map(each => [each.name, each] as [string, SubcommandManual]) as [
                        string,
                        SubcommandManual,
                    ][];
                    const match = get_first_matching_subcommand(prefix, message.content, subcommands_and_name);
                    if (match === false) {
                        message.channel.send(
                            `${
                                (<MultifacetedCommandManual>manual).name
                            }: your message had no matching subcommands. Try using '${prefix}commands' to see the syntax for each subcommand.`,
                        );
                        return value({ type: BotCommandProcessResultType.DidNotSucceed });
                    }
                    let subcommand_index = null as number | null;
                    const found = subcommands_and_name.find((tuple, index) => {
                        const predicate = tuple[0] === match[0];
                        if (predicate) {
                            subcommand_index = index;
                            return true;
                        }
                    }) as [string, SubcommandManual];
                    // never
                    if (found === undefined) {
                        message.channel.send(
                            `${
                                (<MultifacetedCommandManual>manual).name
                            }: your message had no matching subcommands. Try using '${prefix}commands' to see the syntax for each subcommand.`,
                        );
                        return value({ type: BotCommandProcessResultType.DidNotSucceed });
                    }
                    const arg_value_specification = argument_specification_from_manual(found[1].arguments);
                    const result = check_specification(match[1].values, match[0], arg_value_specification);
                    if (result === false || result === null) {
                        message.channel.send(
                            `${(<MultifacetedCommandManual>manual).name}: your message did not have the proper arguments for subcommand ${
                                match[0]
                            }. Try using ${prefix}commands to see the syntax for each subcommand.`,
                        );
                        return value({ type: BotCommandProcessResultType.DidNotSucceed });
                    }
                    const should_call_subcommand = await method_body.apply(this, [message, client, pool, prefix]);
                    switch (should_call_subcommand.type) {
                        case BotCommandProcessResultType.PassThrough: {
                            return await args[subcommand_index as number].activate.apply(this, [result, message, client, pool, prefix]);
                        }
                        default: {
                            return should_call_subcommand;
                        }
                    }
                };
                return descriptor;
            }
            case CommandManualType.SimpleCommandManual: {
                log(
                    `automatic_dispatch decorator: applied to BotCommand subclass that had a manual type of SimpleCommandManual! Throwing a TypeError (unacceptable)`,
                    LogType.Error,
                );
                throw new TypeError(
                    `Invalid application of automatic_dispatch decorator to BotCommand subclass with manual type SimpleCommandManual.`,
                );
            }
        }
    } as MethodDecorator;
}

export function validate(): MethodDecorator {
    return function <Manual extends SubcommandManual>(
        target: Object,
        _property_key: string | any,
        descriptor: PropertyDescriptor,
    ): PropertyDescriptor {
        const target_name = target.constructor.name;
        log(`validate decorator: applying to target with class name ${target_name}...`, LogType.Status, DebugLogType.Decorators);
        const method_body = descriptor.value;
        if (method_body === undefined) {
            log(`validate decorator: applied to method which took value of undefined (what?). Throwing a TypeError (unacceptable)`, LogType.Error);
            throw new TypeError(`Invalid application of method_body decorator to undefined method "${target_name}"`);
        }
        if (subclasses(target.constructor, Subcommand) === false) {
            log(
                `validate decorator: applied to constructor "${target_name}" which doesn't extend Subcommand. Throwing a TypeError (unacceptable)`,
                LogType.Error,
            );
            throw new TypeError(`Invalid application of automatic_dispatch decorator to non-Subcommand type "${target_name}"`);
        }
        if (method_body instanceof Function === false) {
            log(`validate decorator: applied to non-method object. Throwing a TypeError (unacceptable)`, LogType.Error);
            throw new TypeError(`Invalid application of validate decorator to non-method (class: "${target_name})"`);
        }
        if (method_body.name !== "activate") {
            log(`validate decorator: applied to non-activate method. Throwing a TypeError (unacceptable)`, LogType.Error);
            throw new TypeError(`Invalid application of validate decorator to non-activate method "${method_body.name}"`);
        }
        const metadata_manual = Reflect.getMetadata(BotCommandMetadataKey.Manual, target);
        log(`metadata_manual is ${typeof metadata_manual}`, LogType.Status, DebugLogType.Decorators);
        log(safe_serialize(metadata_manual), LogType.Status, DebugLogType.Decorators);
        const static_manual = (target as any).constructor.manual;
        log(`static_manual is ${typeof static_manual}`, LogType.Status, DebugLogType.Decorators);
        log(safe_serialize(static_manual), LogType.Status, DebugLogType.Decorators);

        const manual: CommandManual | undefined = metadata_manual === undefined ? static_manual : metadata_manual;
        log(`manual is ${typeof manual}`, LogType.Status, DebugLogType.Decorators);
        log(safe_serialize(manual), LogType.Status, DebugLogType.Decorators);
        const manual_type = CommandManualValidation.get_type(manual);

        switch (manual_type) {
            case CommandManualType.Invalid: {
                log(
                    `validate decorator: applied with invalid manual on class target with class name "${target.constructor.name}"! Throwing a TypeError (unacceptable)`,
                    LogType.Error,
                );
                throw new TypeError(`Invalid application of validate decorator to class target with no valid manual`);
            }
            case CommandManualType.MultifacetedCommandManual: {
                log(
                    `validate decorator: applied to Subcommand subclass that had a manual type of MultifacetedCommandManual! Throwing a TypeError (unacceptable)`,
                    LogType.Error,
                );
                throw new TypeError(`Invalid application of validate decorator to Subcommand subclass with manual type MultifacetedCommandManual`);
            }
            case CommandManualType.SimpleCommandManual: {
                descriptor.value = async function activate(
                    this: any,
                    args: ArgumentValues<Manual>,
                    message: Message,
                    client: Client,
                    pool: Pool,
                    prefix: string | undefined,
                ): Promise<BotCommandProcessResults> {
                    const spec = argument_specification_from_manual((manual as SubcommandManual).arguments);
                    const values = check_specification(args, method_body.name, spec);

                    if (values === false || values === null) return { type: BotCommandProcessResultType.Invalid };

                    if (is_text_channel(message) === false) {
                        return {
                            type: BotCommandProcessResultType.Unauthorized,
                            not_authorized_message: "The command was used in a channel that either wasn't in a server or wasn't a text channel.",
                        };
                    }

                    return await method_body.apply(this, [args, message, client, pool, prefix]);
                } as (
                    args: ArgumentValues<Manual>,
                    message: Message,
                    client: Client,
                    pool: Pool,
                    prefix: string | undefined,
                ) => Promise<BotCommandProcessResults>;
                return descriptor as any;
            }
        }
    };
}

export function command(): ClassDecorator {
    return function <ConstructorType extends Function>(target: ConstructorType): void | ConstructorType {
        const manual = (target as any).manual;
        log(
            `Command with class name ${target.name} decorated with command():  applying manual with type ${typeof manual} to metadata.`,
            LogType.Status,
            DebugLogType.Decorators,
        );
        Object.seal(target);
        Object.seal(target.prototype);
        Reflect.defineMetadata(BotCommandMetadataKey.Manual, manual, target.constructor);
    };
}
