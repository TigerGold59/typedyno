import "reflect-metadata";
import { LogType, log } from "./utilities/log.js";
import { Structure, NormalizedStructure, AnyStructure, log_stack } from "./utilities/runtime_typeguard/runtime_typeguard.js";

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
