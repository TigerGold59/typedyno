import { CommandArgument } from "../command_manual.js";
import { GetArgsResult } from "./argument_processing/arguments_types.js";
import { DebugLogType, log, LogType } from "./log.js";
import { is_valid_Snowflake } from "./permissions.js";
import { is_string, is_number, is_boolean, safe_serialize } from "./typeutils.js";

export const enum ParameterTypeCheckResult {
    InvalidParameterType,
    IncorrectType,
    InvalidValue,
    Correct,
}

const UINT4 = 4294967296;
const UINT8 = 18446744073709551616n;

export enum ParamValueType {
    String = "string", // string
    Number = "number", // number
    Boolean = "boolean", // boolean
    BooleanS = "boolean represented as string",
    NumberLike = "number, safe-sized BigInt, or number-convertible string", // number
    IntegerLike = "integer, safe-sized BigInt, or integer-convertible string", // number
    UnsignedIntegerLike = "positive integer, safe-sized BigInt, or likewise convertible string", // number
    Snowflake = "snowflake", // string
    UInt4S = "4-byte-limited string-represented positive integer", // number
    UInt4N = "4-byte-limited number-represented positive integer", // number
    UInt4Like = "4-byte-limited positive BigInt, safe-sized integer Number, or likewise convertible string", // number
    DateAsUInt4Like = "time since UNIX epoch in seconds represented by 4-byte-limited positive BigInt, safe-sized integer Number, or likewise convertible string",
    UInt8S = "8-byte-limited string-represented positive integer", // bigint
    UInt8B = "8-byte-limited positive BigInt", // bigint
    UInt8Like = "8-byte-limited positive BigInt, safe-sized integer Number, or likewise convertible string", // bigint
    BigInt = "BigInt", // bigint
    BigIntLike = "BigInt, safe-sized Integer Number, or BigInt convertible string", // bigint
    Date = "JavaScript Date object",
    KingdomIndexS = "positive string-represented integer less than 19", // number
    KingdomIndexN = "positive number-represented integer less than 19", // number
}

export type HasMap<Union extends string, List extends readonly any[]> = {
    [P in Union]: List[number] extends Exclude<List[number], P> ? false : true;
};
export type HasAllMembers<Union extends string, List extends readonly any[]> = HasMap<Union, List>[keyof HasMap<Union, List>] extends true
    ? List
    : never;
export type HasAllKeys<Union extends string, Structure extends object, _Value extends any> = Union extends keyof Structure ? true : false;

const ParamValueTypeNormalizationMap = {
    [ParamValueType.String]: "string" as string,
    [ParamValueType.Number]: 0 as number,
    [ParamValueType.Boolean]: true as boolean,
    [ParamValueType.BooleanS]: true as boolean,
    [ParamValueType.NumberLike]: 0 as number,
    [ParamValueType.IntegerLike]: 0 as number,
    [ParamValueType.UnsignedIntegerLike]: 0 as number,
    [ParamValueType.Snowflake]: "string" as string,
    [ParamValueType.UInt4S]: 0 as number,
    [ParamValueType.UInt4N]: 0 as number,
    [ParamValueType.UInt4Like]: 0 as number,
    [ParamValueType.DateAsUInt4Like]: new Date(),
    [ParamValueType.UInt8S]: 0n as bigint,
    [ParamValueType.UInt8B]: 0n as bigint,
    [ParamValueType.UInt8Like]: 0n as bigint,
    [ParamValueType.BigInt]: 0n as bigint,
    [ParamValueType.BigIntLike]: 0n as bigint,
    [ParamValueType.Date]: new Date() as Date,
    [ParamValueType.KingdomIndexS]: 0 as number,
    [ParamValueType.KingdomIndexN]: 0 as number,
} as const;

export type ParamValueTypeMap = typeof ParamValueTypeNormalizationMap;

/**
 * ParamValueTypes that are completely symmetric
 */
export type BaseParamValueType =
    | ParamValueType.String
    | ParamValueType.Number
    | ParamValueType.Boolean
    | ParamValueType.Snowflake
    | ParamValueType.UInt4N
    | ParamValueType.UInt4S
    | ParamValueType.UInt8B
    | ParamValueType.UInt8S
    | ParamValueType.BigInt
    | ParamValueType.Date
    | ParamValueType.KingdomIndexN
    | ParamValueType.KingdomIndexS;
/**
 * ParamValueTypes that may give a different normalized type than is provided
 */
export type OffshootParamValueType =
    | ParamValueType.NumberLike
    | ParamValueType.IntegerLike
    | ParamValueType.UnsignedIntegerLike
    | ParamValueType.UInt4S
    | ParamValueType.UInt4Like
    | ParamValueType.DateAsUInt4Like
    | ParamValueType.UInt8S
    | ParamValueType.BigIntLike
    | ParamValueType.KingdomIndexS;

// TODO: Implement transforming from one compatible type to another, for instance for PGJumprole to Jumprole
export const TRANSFORM_TABLE: Record<ParamValueType, BaseParamValueType[]> = {
    [ParamValueType.String]: [],
    [ParamValueType.Number]: [],
    [ParamValueType.Boolean]: [],
    [ParamValueType.BooleanS]: [ParamValueType.Boolean],
    [ParamValueType.NumberLike]: [ParamValueType.String, ParamValueType.Number],
    [ParamValueType.IntegerLike]: [ParamValueType.String, ParamValueType.Number, ParamValueType.BigInt],
    [ParamValueType.UnsignedIntegerLike]: [ParamValueType.String, ParamValueType.Number, ParamValueType.BigInt],
    [ParamValueType.Snowflake]: [ParamValueType.String, ParamValueType.Snowflake, ParamValueType.BigInt, ParamValueType.UInt8B],
    [ParamValueType.UInt4S]: [ParamValueType.UInt4N, ParamValueType.Number, ParamValueType.BigInt],
    [ParamValueType.UInt4N]: [ParamValueType.Number, ParamValueType.UInt4S, ParamValueType.String, ParamValueType.BigInt],
    [ParamValueType.UInt4Like]: [ParamValueType.UInt4N, ParamValueType.Number, ParamValueType.UInt4S, ParamValueType.String, ParamValueType.BigInt],
    [ParamValueType.DateAsUInt4Like]: [ParamValueType.Date, ParamValueType.UInt4N, ParamValueType.UInt4S],
    [ParamValueType.UInt8S]: [ParamValueType.UInt8B, ParamValueType.String, ParamValueType.Snowflake],
    [ParamValueType.UInt8B]: [ParamValueType.UInt8S, ParamValueType.String, ParamValueType.Snowflake],
    [ParamValueType.UInt8Like]: [ParamValueType.UInt8S, ParamValueType.UInt8B, ParamValueType.String, ParamValueType.Snowflake],
    [ParamValueType.BigInt]: [ParamValueType.String],
    [ParamValueType.BigIntLike]: [ParamValueType.String, ParamValueType.BigInt],
    [ParamValueType.Date]: [ParamValueType.UInt4N, ParamValueType.UInt4S],
    [ParamValueType.KingdomIndexN]: [ParamValueType.KingdomIndexS],
    [ParamValueType.KingdomIndexS]: [ParamValueType.KingdomIndexN],
};

export interface OptionalParamType {
    value: ParamValueType;
    accepts_null: boolean;
    accepts_undefined: boolean;
    preserve_undefined: boolean;
}

export type ParamType = ParamValueType | OptionalParamType;

export interface NotRequiredCondition {
    property: string;
    equals: any;
}

export interface Parameter {
    type: ParamType;
    name: string;
    not_required_condition?: NotRequiredCondition;
    must_equal?: any;
}

const enum ParamTypeValidationResult {
    Invalid = 0,
    Optional,
    Value,
}

export type NormalizedParameterValue = string | number | boolean | bigint | Date | null | undefined;

export interface ParameterValidationResult {
    type_check: ParameterTypeCheckResult;
    normalized_value?: NormalizedParameterValue;
}

export const is_ParamValueType = function (object: any): object is ParamValueType {
    return Object.values(ParamValueType).includes(object);
};

export const validate_ParamType = function (object?: unknown): ParamTypeValidationResult {
    if (typeof object !== "string") {
        if (typeof object !== "object") {
            return ParamTypeValidationResult.Invalid;
        } else if (object === null || ("value" in object && "accepts_null" in object && "accepts_undefined" in object) === false) {
            return ParamTypeValidationResult.Invalid;
        } else if (
            // I did the check up there! stupid TypeScript compiler
            // { ts-malfunction }
            // @ts-expect-error
            is_ParamValueType(object.value) &&
            // @ts-expect-error
            is_boolean(object.accepts_null) &&
            // @ts-expect-error
            is_boolean(object.accepts_undefined) &&
            // @ts-expect-error
            (is_boolean(object.preserve_undefined) || object.preserve_undefined === undefined)
        ) {
            return ParamTypeValidationResult.Optional;
        } else {
            return ParamTypeValidationResult.Invalid;
        }
    } else {
        if (is_ParamValueType(object)) {
            return ParamTypeValidationResult.Value;
        } else {
            return ParamTypeValidationResult.Invalid;
        }
    }
};

export const meets_not_required_condition = function (body: any, not_required_condition?: NotRequiredCondition) {
    if (not_required_condition instanceof Object === false || not_required_condition === undefined) {
        return false;
    } else {
        if (is_string(not_required_condition?.property)) {
            return body[not_required_condition.property] === not_required_condition.equals;
        } else {
            return false;
        }
    }
};

export const validate_parameter = function (property: unknown, type: ParamType): ParameterValidationResult {
    const type_classification = validate_ParamType(type);

    const value = (val: NormalizedParameterValue): ParameterValidationResult => {
        return {
            type_check: ParameterTypeCheckResult.Correct,
            normalized_value: val,
        };
    };
    const bad_type: ParameterValidationResult = {
        type_check: ParameterTypeCheckResult.IncorrectType,
    };
    const bad_value: ParameterValidationResult = {
        type_check: ParameterTypeCheckResult.InvalidValue,
    };

    switch (type_classification) {
        case ParamTypeValidationResult.Invalid: {
            return { type_check: ParameterTypeCheckResult.InvalidValue };
        }
        case ParamTypeValidationResult.Optional: {
            const optional_type = type as OptionalParamType;
            if (property === null) {
                if (optional_type.accepts_null) {
                    return value(null);
                } else {
                    return bad_type;
                }
            } else if (property === undefined) {
                if (optional_type.accepts_undefined) {
                    return value(optional_type.preserve_undefined !== false ? undefined : null);
                } else {
                    return bad_type;
                }
            } else {
                return validate_parameter(property, optional_type.value);
            }
        }
        case ParamTypeValidationResult.Value: {
            const value_type = type as ParamValueType;

            switch (value_type) {
                case ParamValueType.Boolean: {
                    if (is_boolean(property)) return value(property);
                    else return bad_type;
                }
                case ParamValueType.BooleanS: {
                    if (is_string(property) === false) return bad_type;
                    const lower = (property as string).toLowerCase();
                    if (lower === "y" || lower === "yes" || lower === "true") return value(true);
                    else if (lower === "n" || lower === "no" || lower === "false") return value(false);
                    else return bad_value;
                }
                case ParamValueType.String: {
                    if (is_string(property)) return value(property);
                    else return bad_type;
                }
                case ParamValueType.Snowflake: {
                    if (is_string(property) === false) return bad_type;
                    else if (is_valid_Snowflake(property)) return value((property as string).toString());
                    else return bad_value;
                }
                case ParamValueType.Number: {
                    if (is_number(property)) return value(property);
                    else return bad_type;
                }
                case ParamValueType.NumberLike: {
                    if (is_number(property)) return value(property);
                    else if (typeof property === "bigint") {
                        if (property <= Number.MAX_SAFE_INTEGER && property >= Number.MIN_SAFE_INTEGER) return value(Number(property));
                        else return bad_value;
                    } else if (is_string(property)) {
                        const converted = Number(property);
                        if (isNaN(converted) === false && isFinite(converted)) return value(converted);
                        else return bad_value;
                    } else return bad_type;
                }
                case ParamValueType.IntegerLike: {
                    if (is_number(property)) {
                        if (Number.isInteger(property)) return value(property);
                        else return bad_value;
                    } else if (typeof property === "bigint") {
                        if (property <= Number.MAX_SAFE_INTEGER && property >= Number.MIN_SAFE_INTEGER) return value(Number(property));
                        else return bad_value;
                    } else if (is_string(property)) {
                        const converted = Number(property);
                        if (Number.isInteger(converted)) return value(converted);
                        else return bad_value;
                    } else return bad_type;
                }
                case ParamValueType.UnsignedIntegerLike: {
                    if (is_number(property)) {
                        if (Number.isSafeInteger(property) && property >= 0) return value(property);
                        else return bad_value;
                    } else if (typeof property === "bigint") {
                        if (property >= 0n && property <= Number.MAX_SAFE_INTEGER) return value(Number(property));
                        else return bad_value;
                    } else if (is_string(property)) {
                        const converted = Number(property);
                        if (Number.isSafeInteger(converted) && converted >= 0) return value(converted);
                        else return bad_value;
                    } else return bad_type;
                }
                case ParamValueType.UInt4N: {
                    if (is_number(property)) {
                        if (Number.isInteger(property) && property >= 0 && property < UINT4) return value(property);
                        else return bad_value;
                    } else return bad_type;
                }
                case ParamValueType.UInt4S: {
                    if (is_string(property)) {
                        const converted = Number(property);
                        if (Number.isInteger(converted) && converted >= 0 && converted < UINT4) return value(converted);
                        else return bad_value;
                    } else return bad_type;
                }
                case ParamValueType.UInt4Like: {
                    if (is_number(property)) {
                        if (Number.isInteger(property) && property >= 0 && property < UINT4) return value(property);
                        else return bad_value;
                    } else if (typeof property === "bigint") {
                        if (property <= UINT4 && property >= 0) return value(Number(property));
                        else return bad_value;
                    } else if (is_string(property)) {
                        const converted = Number(property);
                        if (Number.isInteger(converted) && converted >= 0 && converted < UINT4) return value(converted);
                        else return bad_value;
                    } else return bad_type;
                }
                case ParamValueType.DateAsUInt4Like: {
                    if (is_number(property)) {
                        if (Number.isInteger(property) && property >= 0 && property < UINT4) return value(new Date(property * 1000));
                        else return bad_value;
                    } else if (typeof property === "bigint") {
                        if (property <= UINT4 && property >= 0) return value(new Date(Number(property) * 1000));
                        else return bad_value;
                    } else if (is_string(property)) {
                        const converted = Number(property);
                        if (Number.isInteger(converted) && converted >= 0 && converted < UINT4) return value(new Date(converted * 1000));
                        else return bad_value;
                    } else return bad_type;
                }
                case ParamValueType.UInt8S: {
                    if (is_string(property)) {
                        try {
                            const converted = BigInt(property);
                            if (converted >= 0n && converted < UINT8) return value(converted);
                            else return bad_value;
                        } catch (err) {
                            return bad_value;
                        }
                    } else return bad_type;
                }
                case ParamValueType.UInt8B: {
                    if (typeof property === "bigint") {
                        if ((property as bigint) >= 0n && (property as bigint) < UINT8) return value(property);
                        else return bad_value;
                    } else return bad_type;
                }
                case ParamValueType.UInt8Like: {
                    if (typeof property === "bigint") {
                        if ((property as bigint) >= 0n && (property as bigint) < UINT8) return value(property);
                        else return bad_value;
                    } else if (is_number(property)) {
                        if (Number.isSafeInteger(property) && property >= 0) return value(BigInt(property));
                        else return bad_value;
                    } else if (is_string(property)) {
                        try {
                            const converted = BigInt(property);
                            if (converted >= 0n && converted < UINT8) return value(converted);
                            else return bad_value;
                        } catch (err) {
                            return bad_value;
                        }
                    } else return bad_type;
                }
                case ParamValueType.BigInt: {
                    if (typeof property === "bigint") return value(property);
                    else return bad_type;
                }
                case ParamValueType.BigIntLike: {
                    if (typeof property === "bigint") {
                        return value(property);
                    } else if (is_number(property)) {
                        if (Number.isSafeInteger(property)) return value(BigInt(property));
                        else return bad_value;
                    } else if (is_string(property)) {
                        try {
                            const converted = BigInt(property);
                            return value(converted);
                        } catch (err) {
                            return bad_value;
                        }
                    } else return bad_type;
                }
                case ParamValueType.Date: {
                    if (property instanceof Date) return value(property);
                    else return bad_value;
                }
                case ParamValueType.KingdomIndexN: {
                    if (is_number(property)) {
                        if (Number.isInteger(property) && property < 19) return value(property);
                        else return bad_value;
                    } else return bad_value;
                }
                case ParamValueType.KingdomIndexS: {
                    if (is_string(property)) {
                        const converted = Number(property);
                        if (Number.isInteger(converted) && converted < 19) return value(converted);
                        else return bad_value;
                    } else return bad_value;
                }
                default: {
                    return {
                        type_check: ParameterTypeCheckResult.InvalidParameterType,
                    };
                }
            }
        }
        default: {
            return {
                type_check: ParameterTypeCheckResult.InvalidParameterType,
            };
        }
    }
};

/**
 * Returns the properties required if the object has all the proper requirements.
 * Returns false if the body does not meet the requirements or if there were none.
 * Logs the reasons it returned false also.
 * @param object The request object to check
 * @param properties The required properties the request must have
 */
export const require_properties = function (
    object: any,
    function_name: string,
    ...properties: Parameter[]
): Record<string, NormalizedParameterValue> | false {
    if (properties.length < 1) {
        return Object.keys(object).length === 0 ? {} : false;
    } else if (!object) {
        log(`require_properties: missing object entirely!`, LogType.Status, DebugLogType.RequirePropertiesFunctionDebug);
        return false;
    }

    let has_all_required = true;

    let record: Record<string, NormalizedParameterValue> = {};

    for (const required_param of properties) {
        if (meets_not_required_condition(object, required_param.not_required_condition) === false) {
            if (!!required_param.must_equal && required_param.must_equal !== object[required_param.name]) {
                log(
                    `${function_name}: require_properties - incorrect value for ${required_param.type} parameter ${required_param.name} - body does not have correct value.`,
                    LogType.Status,
                    DebugLogType.RequirePropertiesFunctionDebug,
                );
                has_all_required = false;
            } else if (!!required_param.must_equal && required_param.must_equal === object[required_param.name]) {
                record[required_param.name] = required_param.must_equal;
            } else {
                const value = object[required_param.name];
                const result = validate_parameter(value, required_param.type);
                switch (result.type_check) {
                    case ParameterTypeCheckResult.Correct: {
                        if (
                            result.normalized_value === undefined &&
                            (validate_ParamType(required_param.type) === ParamTypeValidationResult.Optional &&
                                (required_param.type as OptionalParamType).preserve_undefined === true &&
                                value === undefined) === false
                        ) {
                            log(
                                `${function_name}: require_properties - validate_parameter - property ${required_param.name} gave out a ParameterValidationResult that indicated the type was correct, but passed undefined as the normalized value! Returning false.`,
                                LogType.Mismatch,
                            );
                            return false;
                        } else record[required_param.name] = result.normalized_value;
                        continue;
                    }
                    case ParameterTypeCheckResult.InvalidParameterType: {
                        log(
                            `${function_name}: require_properties - property ${required_param.name} had an invalid type requirement! Returning false.`,
                            LogType.Error,
                        );
                        return false;
                    }
                    case ParameterTypeCheckResult.IncorrectType: {
                        switch (validate_ParamType(required_param.type)) {
                            case ParamTypeValidationResult.Invalid: {
                                log(
                                    `${function_name}: require_properties - property ${required_param.name} had an invalid type requirement! Returning false.`,
                                    LogType.Error,
                                );
                                return false;
                            }
                            case ParamTypeValidationResult.Optional: {
                                // Spaghetti code but its ok
                                const accepts = [
                                    (required_param.type as OptionalParamType).accepts_null,
                                    (required_param.type as OptionalParamType).accepts_undefined,
                                ]
                                    .map((val, index) => (val ? ["null", "undefined"][index] : false))
                                    .filter(val => val !== false)
                                    .join(" and ");
                                log(
                                    `${function_name}: require_properties - incorrect type for optional (also accepts ${accepts}) property of type ${
                                        (<OptionalParamType>required_param.type).value
                                    } named ${required_param.name} - got ${typeof value} from body`,
                                    LogType.Status,
                                    DebugLogType.RequirePropertiesFunctionDebug,
                                );
                                has_all_required = false;
                                continue;
                            }
                            case ParamTypeValidationResult.Value: {
                                log(
                                    `${function_name}: require_properties - incorrect type for property of type ${required_param.type} named ${
                                        required_param.name
                                    } - got ${typeof value} from body`,
                                    LogType.Status,
                                    DebugLogType.RequirePropertiesFunctionDebug,
                                );
                                has_all_required = false;
                                continue;
                            }
                        }
                    }
                    case ParameterTypeCheckResult.InvalidValue: {
                        switch (validate_ParamType(required_param.type)) {
                            case ParamTypeValidationResult.Invalid: {
                                log(
                                    `${function_name}: require_properties - property ${required_param.name} had an invalid type requirement! Returning false.`,
                                    LogType.Error,
                                );
                                return false;
                            }
                            case ParamTypeValidationResult.Optional: {
                                const accepts = [
                                    (required_param.type as OptionalParamType).accepts_null,
                                    (required_param.type as OptionalParamType).accepts_undefined,
                                ]
                                    .map((val, index) => (val ? ["null", "undefined"][index] : false))
                                    .filter(val => val !== false)
                                    .join(" and ");
                                log(
                                    `${function_name}: require_properties - incorrect value for optional ${
                                        required_param.type
                                    } (also accepts ${accepts}) property ${required_param.name} - got ${safe_serialize(value)} from body`,
                                    LogType.Status,
                                    DebugLogType.RequirePropertiesFunctionDebug,
                                );
                                has_all_required = false;
                                continue;
                            }
                            case ParamTypeValidationResult.Value: {
                                log(
                                    `${function_name}: require_properties - incorrect value for ${required_param.type} property ${
                                        required_param.name
                                    } - got ${safe_serialize(value)} from body`,
                                    LogType.Status,
                                    DebugLogType.RequirePropertiesFunctionDebug,
                                );
                                has_all_required = false;
                                continue;
                            }
                        }
                    }
                }
            }
        } else {
            log(
                `${function_name}: require_properties - property ${required_param.name} of type ${required_param.type} may or may not have been present, but it is not required due to body meeting the not-required condition.`,
                LogType.Status,
                DebugLogType.RequirePropertiesFunctionDebug,
            );
        }
    }

    if (has_all_required === false) {
        return false;
    } else {
        return record;
    }
};

type Mutable<Spec extends Specification<any>> = Spec extends Specification<infer _T> ? Parameter[] : never;

/**
 * Modifies a `Specification` object of a Partial of its original type
 * @param specification The original `Specification` object
 * @returns A new `Specification` object with all of its parameters set to accept undefined as well as the original type
 */
export const PartialSpecification = function <T>(specification: Specification<T>): Specification<Partial<T>> {
    let new_specification: Mutable<Specification<Partial<T>>> = [];
    for (const parameter of specification) {
        const parameter_type = validate_ParamType(parameter.type);

        switch (parameter_type) {
            case ParamTypeValidationResult.Invalid: {
                log(
                    `PartialSpecification: invalid Parameter element of specification - name "${parameter.name}" has type "${safe_serialize(
                        parameter.type,
                    )}". Ignoring parameter.`,
                    LogType.Error,
                );
                continue;
            }
            case ParamTypeValidationResult.Optional: {
                let type = parameter.type as OptionalParamType;
                if (type.accepts_undefined) {
                    log(`PartialSpecification: parameter with name "${parameter.name}" already is an optional that accepts undefined. Adding as is.`);
                    new_specification.push(parameter);
                } else {
                    let new_type = type;
                    new_type.accepts_undefined = true;
                    new_type.preserve_undefined = true;
                    new_specification.push(parameter);
                }
                continue;
            }
            case ParamTypeValidationResult.Value: {
                // TypeScript still doesn't know parameter.type is a ParamValueType
                let type = parameter.type as ParamValueType;
                // Construct a new OptionalParamType of the original type that also accepts undefined
                let optional: OptionalParamType = {
                    value: type,
                    accepts_null: false,
                    accepts_undefined: true,
                    preserve_undefined: true,
                };
                // Make a new, identical parameter except the type is of the new optional type
                let new_parameter = parameter;
                new_parameter.type = optional;
                new_specification.push(new_parameter);
            }
        }
    }
    Object.freeze(new_specification);
    return new_specification as Specification<Partial<T>>;
};

export const check_specification = function <T>(object: any, function_name: string, specification: Specification<T>): T | false {
    const result = require_properties(object, function_name, ...specification);

    // Assume the specification is correct. If it isn't, we will have a different return type then stated.
    return result as T | false;
};

/**
 *
 * @param names The list of property names to filter
 * @param specification The `Specification` used to decide whether to include a property name
 * @returns The list of property names in the original list which are also represented as parameters in the `Specification`
 */
export const property_filter = function <T>(names: string[], specification: Specification<T>): string[] {
    let new_names = [];

    for (const name of names) {
        for (const parameter of specification) {
            if (parameter.name === name) {
                new_names.push(name);
            }
        }
    }

    return new_names;
};

export const argument_specification_from_manual = function <T extends readonly CommandArgument[]>(
    manual_args: T,
): Specification<GetArgsResult<typeof manual_args>["values"]> {
    let res: Parameter[] = [];
    for (const arg of manual_args) {
        let partial: Partial<Parameter> = { name: arg.id };
        if (is_ParamValueType(arg.further_constraint)) {
            partial.type = arg.further_constraint;
        } else partial.type = ParamValueType.String;

        if (arg.optional) {
            partial.type = {
                value: partial.type,
                accepts_null: true,
                accepts_undefined: false,
                preserve_undefined: false,
            };
        }

        res.push(partial as Parameter);
    }
    Object.freeze(res);
    return res as Specification<GetArgsResult<typeof manual_args>["values"]>;
};

export type Specification<_T> = readonly Parameter[];
