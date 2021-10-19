import "reflect-metadata";
import { PoolInstance as Pool } from "./pg_wrapper.js";
import { ValidatedArguments } from "./utilities/argument_processing/arguments_types.js";
import { get_first_matching_subcommand } from "./utilities/argument_processing/arguments.js";
import { BotCommand, BotCommandProcessResultType, BotCommandProcessResults, Subcommand } from "./functions.js";
import { Client, Message } from "discord.js";
import {
    CommandManualType,
    CommandManualValidation,
    MultifacetedCommandManual,
    SubcommandManual,
    get_type,
    argument_structure_from_manual,
} from "./command_manual.js";
import { DebugLogType, LogType, log } from "./utilities/log.js";
import { Structure, NormalizedStructure, AnyStructure, log_stack } from "./utilities/runtime_typeguard/runtime_typeguard.js";
import { is_text_channel, safe_serialize, TextChannelMessage } from "./utilities/typeutils.js";

type ClassType<Instance extends unknown> = (new (...args: unknown[]) => Instance) & { prototype: Instance };
// type ConcreteClassType<Instance extends object> = new (...args: any[]) => Instance & { prototype: Instance };

export const subclasses = function <
    ConstructorOne extends { prototype: unknown },
    // TypeScript and ESLint fight to the death!
    // TypeScript needs me to use Function and ESLint hates it
    // TypeScript wins
    // eslint-disable-next-line @typescript-eslint/ban-types
    ConstructorTwo extends Function,
>(constructor_one: ConstructorOne, constructor_two: ConstructorTwo): boolean {
    return constructor_one.prototype instanceof constructor_two || Object.is(constructor_one, constructor_two);
};

export const value = function <T>(value: T): Promise<T> {
    return new Promise(res => res(value));
};

type ProcessMethodType = (message: Message, client: Client, pool: Pool, prefix: string) => Promise<BotCommandProcessResults>;

import { manual_of } from "./command_manual.js";

export function automatic_dispatch<DispatchTargets extends Subcommand<SubcommandManual>[]>(...args: DispatchTargets): MethodDecorator {
    return function (
        target: { constructor: new (...args: unknown[]) => BotCommand },
        _property_key: string | symbol,
        descriptor: TypedPropertyDescriptor<ProcessMethodType>,
    ): void | TypedPropertyDescriptor<ProcessMethodType> {
        const target_name = target.constructor.name;
        const method_body = descriptor.value;
        if (method_body === undefined) {
            log(
                "automatic_dispatch decorator: applied to method which took value of undefined (what?). Throwing a TypeError (unacceptable)",
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
            log("automatic_dispatch decorator: applied to non-method object. Throwing a TypeError (unacceptable)", LogType.Error);
            throw new TypeError("Invalid application of automatic_dispatch decorator to non-method.");
        }

        const subcommands = args.map(command_value => manual_of(command_value)) as SubcommandManual[];
        const subcommands_and_name = subcommands.map(each => [each.name, each] as [string, SubcommandManual]);

        descriptor.value = async function (message: Message, client: Client, pool: Pool, prefix: string): Promise<BotCommandProcessResults> {
            const manual = manual_of(target) as unknown;
            log(`manual is ${typeof manual}`, LogType.Status, DebugLogType.Decorators);
            log(safe_serialize(manual), LogType.Status, DebugLogType.Decorators);
            const manual_type = CommandManualValidation.get_type(manual);
            switch (manual_type) {
                case CommandManualType.Invalid: {
                    log("automatic_dispatch decorator: applied with invalid manual argument! Throwing a TypeError (unacceptable)", LogType.Error);
                    throw new TypeError("Invalid application of automatic_dispatch decorator with non-CommandManual argument");
                }
                case CommandManualType.MultifacetedCommandManual: {
                    if (is_text_channel(message)) {
                        const match = get_first_matching_subcommand(prefix, message.content, subcommands_and_name);
                        if (match === false) {
                            await message.channel.send(
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
                            await message.channel.send(
                                `${
                                    (<MultifacetedCommandManual>manual).name
                                }: your message had no matching subcommands. Try using '${prefix}commands' to see the syntax for each subcommand.`,
                            );
                            return value({ type: BotCommandProcessResultType.DidNotSucceed });
                        }
                        const arg_value_specification = argument_structure_from_manual(found[1]);
                        const result = arg_value_specification.check(match[1].values);
                        if (result.succeeded === false) {
                            await message.channel.send(
                                `${(<MultifacetedCommandManual>manual).name}: your message did not have the proper arguments for subcommand ${
                                    match[0]
                                }. Try using ${prefix}commands to see the syntax for each subcommand.`,
                            );
                            return value({ type: BotCommandProcessResultType.DidNotSucceed });
                        }
                        const should_call_subcommand = await method_body.apply(this, [message, client, pool, prefix]);
                        switch (should_call_subcommand.type) {
                            case BotCommandProcessResultType.PassThrough: {
                                return await args[subcommand_index as number].activate.apply(this, [
                                    result.normalized,
                                    message,
                                    client,
                                    pool,
                                    prefix,
                                ]);
                            }
                            default: {
                                return should_call_subcommand;
                            }
                        }
                    } else {
                        return {
                            type: BotCommandProcessResultType.Unauthorized,
                            not_authorized_message: "The command was used in a channel that either wasn't in a server or wasn't a text channel.",
                        };
                    }
                }
                case CommandManualType.SimpleCommandManual: {
                    log(
                        "automatic_dispatch decorator: applied to BotCommand subclass that had a manual type of SimpleCommandManual! Throwing a TypeError (unacceptable)",
                        LogType.Error,
                    );
                    throw new TypeError(
                        "Invalid application of automatic_dispatch decorator to BotCommand subclass with manual type SimpleCommandManual.",
                    );
                }
            }
        };
    } as MethodDecorator;
}

type ActivateMethodType<Manual extends SubcommandManual> = (
    this: Subcommand<Manual>,
    args: ValidatedArguments<Manual>,
    message: TextChannelMessage,
    client: Client,
    pool: Pool,
    prefix: string,
) => Promise<BotCommandProcessResults>;

export function validate<Manual extends SubcommandManual>(
    target: Subcommand<Manual>,
    _property_key: string | symbol,
    descriptor: TypedPropertyDescriptor<ActivateMethodType<Manual>>,
): TypedPropertyDescriptor<ActivateMethodType<Manual>> {
    const target_name = target.constructor.name;
    log(`validate decorator: applying to target with class name ${target_name}...`, LogType.Status, DebugLogType.Decorators);
    const method_body = descriptor.value;
    if (method_body === undefined) {
        log("validate decorator: applied to method which took value of undefined (what?). Throwing a TypeError (unacceptable)", LogType.Error);
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
        log("validate decorator: applied to non-method object. Throwing a TypeError (unacceptable)", LogType.Error);
        throw new TypeError(`Invalid application of validate decorator to non-method (class: "${target_name})"`);
    }
    if (method_body.name !== "activate") {
        log("validate decorator: applied to non-activate method. Throwing a TypeError (unacceptable)", LogType.Error);
        throw new TypeError(`Invalid application of validate decorator to non-activate method "${method_body.name}"`);
    }

    descriptor.value = async function activate(
        this: Subcommand<Manual>,
        args: ValidatedArguments<Manual>,
        message: Message,
        client: Client,
        pool: Pool,
        prefix: string,
    ): Promise<BotCommandProcessResults> {
        const manual = manual_of(target);
        log(`manual is ${typeof manual}`, LogType.Status, DebugLogType.Decorators);
        log(safe_serialize(manual), LogType.Status, DebugLogType.Decorators);
        const manual_type = get_type(manual);

        switch (manual_type) {
            case CommandManualType.Invalid: {
                log(
                    `validate decorator: applied with invalid manual on class target with class name "${target.constructor.name}"! Throwing a TypeError (unacceptable)`,
                    LogType.Error,
                );
                throw new TypeError("Invalid application of validate decorator to class target with no valid manual");
            }
            case CommandManualType.MultifacetedCommandManual: {
                log(
                    "validate decorator: applied to Subcommand subclass that had a manual type of MultifacetedCommandManual! Throwing a TypeError (unacceptable)",
                    LogType.Error,
                );
                throw new TypeError("Invalid application of validate decorator to Subcommand subclass with manual type MultifacetedCommandManual");
            }
            case CommandManualType.SimpleCommandManual: {
                const spec = argument_structure_from_manual(manual as SubcommandManual);
                const values = spec.check(args);

                if (values.succeeded === false) return { type: BotCommandProcessResultType.Invalid };

                if (is_text_channel(message)) {
                    return await method_body.apply(this, [args, message, client, pool, prefix]);
                } else {
                    return {
                        type: BotCommandProcessResultType.Unauthorized,
                        not_authorized_message: "The command was used in a channel that either wasn't in a server or wasn't a text channel.",
                    };
                }
            }
        }
    } as (
        args: ValidatedArguments<Manual>,
        message: Message,
        client: Client,
        pool: Pool,
        prefix: string | undefined,
    ) => Promise<BotCommandProcessResults>;

    return descriptor;
}

const StructureMetadataKey = Symbol("ParamType metadata key");

interface ParamTypeMetadataStructure {
    [key: string]: { [key: number]: AnyStructure };
}

export function type<Instance, NormalizedType extends NormalizedStructure>(
    type: Structure<NormalizedType>,
): (target: ClassType<Instance>, property_key: string | symbol, parameter_index: number) => void {
    return function (target: ClassType<Instance>, property_key: string | symbol, parameter_index: number) {
        const valid_type = type instanceof Structure;
        if (valid_type) {
            if (typeof property_key === "symbol") {
                log("type decorator: applied with invalid property_key of type symbol. Throwing a TypeError (unacceptable)", LogType.Error);
                throw new TypeError("Invalid application of type decorator with property_key of type symbol.");
            }
            let metadata = Reflect.getOwnMetadata(StructureMetadataKey, target) as ParamTypeMetadataStructure | undefined;
            if (metadata === undefined) metadata = {};
            if (metadata[property_key] === undefined) {
                metadata[property_key] = { [parameter_index]: type };
            } else metadata[property_key][parameter_index] = type;
            Reflect.defineMetadata(StructureMetadataKey, metadata, target);
        } else {
            log("type decorator: applied with invalid ParamType argument. Throwing a TypeError (unacceptable)", LogType.Error);
            throw new TypeError("Invalid application of type decorator with non-ParamType type.");
        }
    };
}

export function check_new<Instance>(type: AnyStructure) {
    return function (_target: Instance, property_key: string | symbol, descriptor: PropertyDescriptor): PropertyDescriptor {
        const old = descriptor.set?.bind(descriptor);
        if (old === undefined) throw new TypeError("check_new: applied to decorator without setter!");
        if (type instanceof Structure === false) throw new TypeError("check_new: applied with non-Structure type...");
        descriptor.set = function (new_value: unknown) {
            const correct = type.check(new_value);
            if (correct.succeeded) {
                return old.apply(this, [new_value]);
            } else {
                log_stack(correct, `check_new ${property_key.toString()}`);
                throw new TypeError("check_new: Structure.check failed");
            }
        };
        return descriptor;
    };
}
type NonConstructor<Arguments extends unknown[], ReturnType extends unknown> = (...args: Arguments) => ReturnType;
type Constructor<Arguments extends unknown[], ReturnType extends unknown> = new (...args: Arguments) => ReturnType;

export const is_constructor = function <Arguments extends unknown[], ReturnType extends unknown>(
    func: NonConstructor<Arguments, ReturnType> | Constructor<Arguments, ReturnType>,
): func is Constructor<Arguments, ReturnType> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return (func && typeof func === "function" && func.prototype && func.prototype.constructor) === func;
};

/*export function validate_args<Arguments extends unknown[], ReturnType extends unknown>(
    target: ClassType<unknown>,
    property_key: string | symbol,
    descriptor: TypedPropertyDescriptor<NonConstructor<Arguments, ReturnType>>,
): TypedPropertyDescriptor<NonConstructor<Arguments, ReturnType>> {
    if (typeof property_key === "symbol") {
        log("validate_args decorator: applied with invalid property_key of type symbol. Throwing a TypeError (unacceptable)", LogType.Error);
        throw new TypeError("Invalid application of validate_args decorator with property_key of type symbol.");
    }
    const metadata = Reflect.getOwnMetadata(StructureMetadataKey, target) as ParamTypeMetadataStructure | undefined;
    if (metadata === undefined || property_key in metadata === false) return descriptor;

    const old = descriptor.value;
    if (old instanceof Function === false || old === undefined) {
        log("validate_args decorator: applied with invalid non-Function method. Throwing a TypeError (unacceptable)", LogType.Error);
        throw new TypeError("Invalid application of validate_args decorator to non-Function method.");
    }

    descriptor.value = function (...args: Arguments): ReturnType {
        const to_validate = metadata[property_key];
        const keys = Object.keys(to_validate).map(x => Number(x));
        keys.forEach(key => {
            const value = args[key];
            const arg_type = to_validate[key];
            const result = arg_type.check(value);
            if (result.succeeded === false) {
                log_stack(result, `validate_args ${target.name}.${property_key}`);
                throw new TypeError("validate_args: specification check failed. See logs for more information.");
            }
        });
        return old.apply(this, args);
    };

    return descriptor;
}*/

// Mixins are special-cased in TS decorators; you must use any (I hope this is fixed soon, it seems like a temporary thing)
export function validate_constructor<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Class extends new (...args: any[]) => any,
>(target: Class): Class {
    const new_constructor = class extends target {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        constructor(...args: any[]) {
            const metadata = Reflect.getOwnMetadata(StructureMetadataKey, target) as ParamTypeMetadataStructure | undefined;
            if (metadata === undefined || "constructor" in metadata === false) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-call
                super(...args);
                return;
            }
            const to_validate = metadata["constructor"];
            const keys = Object.keys(to_validate).map(x => Number(x));
            keys.forEach(key => {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                const value = args[key];
                const arg_type = to_validate[key];
                const result = arg_type.check(value);
                if (result.succeeded === false) {
                    log_stack(result, `validate_args ${target.name}.constructor`);
                    throw new TypeError("validate_args: specification check failed. See logs for more information.");
                }
            });
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            super(...args);
        }
    };
    Object.freeze(new_constructor);
    Object.freeze(new_constructor.prototype);
    return new_constructor;
}
