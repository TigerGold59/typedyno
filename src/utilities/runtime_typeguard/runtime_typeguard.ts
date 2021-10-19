import { indent } from "../../command_manual.js";
import { Tier } from "../../modules/trickjump/jumprole/internals/tier_type.js";
import { DebugLogType, log, LogType } from "../log.js";

export const enum ParameterTypeCheckResult {
    InvalidParameterType = "InvalidParameterType",
    IncorrectType = "IncorrectType",
    InvalidValue = "InvalidValue",
    Correct = "Correct",
}

export const UINT4 = 4294967296;
export const UINT8 = 18446744073709551616n;

export type NormalizedStructureValue = string | number | boolean | bigint | Date | null | undefined | symbol | never | AnyStructure | Tier;
export type NormalizedStructure =
    | NormalizedStructureValue
    | { [key: string]: NormalizedStructure }
    | NormalizedStructure[]
    | readonly NormalizedStructure[]
    | unknown;

export type PreprocessorResult =
    | { succeeded: false; error: StructureValidationFailedReason; information: string[] }
    | { succeeded: true; changed: unknown };

export type Preprocessor = (input: unknown) => PreprocessorResult;

export const CauseValidateFailureSymbol = Symbol("cause_structure_validation_failure");

export type NormalizedStructureValidator<NormalizedType extends NormalizedStructure> = <Input extends NormalizedType>(
    result: Input,
) => TransformResult<Input>;

export const enum StructureValidationFailedReason {
    IncorrectType = "IncorrectType",
    InvalidValue = "InvalidValue",
    NoMatchingUnionMember = "NoMatchingUnionMember",
}

export type Transformer<NormalizedType extends NormalizedStructure> = (input: unknown) => TransformResult<NormalizedType>;
/*type TransformerAddition<NormalizedType extends NormalizedStructure, NewNormalizedType extends NormalizedStructure> = (
    input: NormalizedType,
) => TransformResult<NewNormalizedType>;*/

export type TransformResult<NormalizedType extends NormalizedStructure> =
    | { succeeded: false; error: StructureValidationFailedReason; information: readonly string[] }
    | { succeeded: true; result: NormalizedType };

export type ValidatedResult<NormalizedType extends NormalizedStructure> =
    | { succeeded: false; error: StructureValidationFailedReason; information: readonly string[] }
    | { succeeded: true; normalized: NormalizedType; structure_name: string };

export type InferNormalizedType<Schema extends AnyStructure> = Schema extends Structure<infer NormalizedType> ? NormalizedType : never;

export const PassthroughValidator = <NormalizedType extends NormalizedStructure>(): NormalizedStructureValidator<NormalizedType> => {
    return <Input extends NormalizedType>(input: Input): TransformResult<Input> => {
        return { succeeded: true, result: input };
    };
};

export const value = (value: unknown): PreprocessorResult => {
    return { succeeded: true, changed: value };
};

export const error = (
    message: string,
    type: StructureValidationFailedReason,
): {
    succeeded: false;
    error: StructureValidationFailedReason;
    information: string[];
} => {
    return { succeeded: false, error: type, information: [message] } as {
        succeeded: false;
        error: StructureValidationFailedReason;
        information: string[];
    };
};

export const add_errors = (messages: readonly string[], addition: string, add_to: string[]): void => {
    messages.forEach(message => {
        add_to.push(addition + message);
    });
};

export class Structure<NormalizedType extends NormalizedStructure> {
    readonly name: string;
    readonly transform: Transformer<NormalizedType>;
    readonly validate_transformed: NormalizedStructureValidator<NormalizedType>;

    constructor(name: string, transform: Transformer<NormalizedType>, validate_transformed: NormalizedStructureValidator<NormalizedType>) {
        this.name = name;
        this.transform = transform;
        this.validate_transformed = validate_transformed;
    }

    before(preprocessor: Preprocessor): Structure<NormalizedType> {
        return new Structure(
            this.name,
            (input: unknown): TransformResult<NormalizedType> => {
                const preprocessed = preprocessor(input);
                if (preprocessed.succeeded) {
                    return this.transform(preprocessed.changed);
                } else return preprocessed;
            },
            this.validate_transformed,
        );
    }

    validate(validator: NormalizedStructureValidator<NormalizedType>): Structure<NormalizedType> {
        return new Structure(this.name, this.transform, <Input extends NormalizedType>(result: Input): TransformResult<Input> => {
            const validated_using_previous = this.validate_transformed(result);
            if (validated_using_previous.succeeded) {
                return validator(result);
            } else return validated_using_previous;
        });
    }

    with_name(new_name: string): Structure<NormalizedType> {
        return new Structure(new_name, this.transform, this.validate_transformed);
    }

    check(input: unknown): ValidatedResult<NormalizedType> {
        const normalized = this.transform(input);
        if (normalized.succeeded) {
            const validated = this.validate_transformed(normalized.result);
            if (validated.succeeded) {
                return { succeeded: true, normalized: normalized.result, structure_name: this.name };
            } else return { succeeded: false, error: validated.error, information: validated.information };
        } else {
            return { succeeded: false, error: normalized.error, information: normalized.information };
        }
    }

    static readonly after = <OldNormalizedType extends NormalizedStructure, NewNormalizedType extends NormalizedStructure>(
        old_structure: Structure<OldNormalizedType>,
        transformer: (result: OldNormalizedType) => TransformResult<NewNormalizedType>,
    ): Structure<NewNormalizedType> => {
        return new Structure(
            old_structure.name,
            (input: unknown): TransformResult<NewNormalizedType> => {
                const old_result = old_structure.transform(input);
                if (old_result.succeeded) {
                    const validated = old_structure.validate_transformed(old_result.result);
                    if (validated.succeeded) {
                        const new_result = transformer(old_result.result);
                        return new_result;
                    } else {
                        return validated;
                    }
                } else {
                    return old_result;
                }
            },
            PassthroughValidator<NewNormalizedType>(),
        );
    };
}

export type AnyStructure = Structure<NormalizedStructure>;

export const log_stack = (
    result: { succeeded: false; error: StructureValidationFailedReason; information: readonly string[] },
    function_name = "Structure.check",
    debug_log_type = DebugLogType.StructureCheckResult,
): void => {
    log(`${function_name}: ${result.error}`, LogType.Error, debug_log_type);
    for (const str of result.information) {
        log(`${function_name}: ${indent(str)}`, LogType.Error, debug_log_type);
    }
};

// export enum RuntimeType {
//     String = "string", // string
//     Number = "number", // number
//     Boolean = "boolean", // boolean
//     BooleanS = "boolean represented as string",
//     NumberLike = "number, safe-sized BigInt, or number-convertible string", // number
//     IntegerLike = "integer, safe-sized BigInt, or integer-convertible string", // number
//     UnsignedIntegerLike = "positive integer, safe-sized BigInt, or likewise convertible string", // number
//     Snowflake = "snowflake", // string
//     UInt4S = "4-byte-limited string-represented positive integer", // number
//     UInt4N = "4-byte-limited number-represented positive integer", // number
//     UInt4Like = "4-byte-limited positive BigInt, safe-sized integer Number, or likewise convertible string", // number
//     DateAsUInt4Like = "time since UNIX epoch in seconds represented by 4-byte-limited positive BigInt, safe-sized integer Number, or likewise convertible string",
//     UInt8S = "8-byte-limited string-represented positive integer", // bigint
//     UInt8B = "8-byte-limited positive BigInt", // bigint
//     UInt8Like = "8-byte-limited positive BigInt, safe-sized integer Number, or likewise convertible string", // bigint
//     BigInt = "BigInt", // bigint
//     BigIntLike = "BigInt, safe-sized Integer Number, or BigInt convertible string", // bigint
//     Date = "JavaScript Date object",
//     KingdomIndexS = "positive string-represented integer less than 19", // number
//     KingdomIndexN = "positive number-represented integer less than 19", // number
// }

// export type HasMap<Union extends string, List extends readonly unknown[]> = {
//     [P in Union]: List[number] extends Exclude<List[number], P> ? false : true;
// };
// export type HasAllMembers<Union extends string, List extends readonly unknown[]> = HasMap<Union, List>[keyof HasMap<Union, List>] extends true
//     ? List
//     : never;
// export type HasAllKeys<Union extends string, Structure extends Record<string, unknown>> = Union extends keyof Structure ? true : false;

// const ParamValueTypeNormalizationMap = {
//     [RuntimeType.String]: "string" as string,
//     [RuntimeType.Number]: 0 as number,
//     [RuntimeType.Boolean]: true as boolean,
//     [RuntimeType.BooleanS]: true as boolean,
//     [RuntimeType.NumberLike]: 0 as number,
//     [RuntimeType.IntegerLike]: 0 as number,
//     [RuntimeType.UnsignedIntegerLike]: 0 as number,
//     [RuntimeType.Snowflake]: "string" as string,
//     [RuntimeType.UInt4S]: 0 as number,
//     [RuntimeType.UInt4N]: 0 as number,
//     [RuntimeType.UInt4Like]: 0 as number,
//     [RuntimeType.DateAsUInt4Like]: new Date(),
//     [RuntimeType.UInt8S]: 0n as bigint,
//     [RuntimeType.UInt8B]: 0n as bigint,
//     [RuntimeType.UInt8Like]: 0n as bigint,
//     [RuntimeType.BigInt]: 0n as bigint,
//     [RuntimeType.BigIntLike]: 0n as bigint,
//     [RuntimeType.Date]: new Date(),
//     [RuntimeType.KingdomIndexS]: 0 as number,
//     [RuntimeType.KingdomIndexN]: 0 as number,
// } as const;

// export type ParamValueTypeMap = typeof ParamValueTypeNormalizationMap;

// /**
//  * ParamValueTypes that are completely symmetric
//  */
// export type BaseParamValueType =
//     | RuntimeType.String
//     | RuntimeType.Number
//     | RuntimeType.Boolean
//     | RuntimeType.Snowflake
//     | RuntimeType.UInt4N
//     | RuntimeType.UInt4S
//     | RuntimeType.UInt8B
//     | RuntimeType.UInt8S
//     | RuntimeType.BigInt
//     | RuntimeType.Date
//     | RuntimeType.KingdomIndexN
//     | RuntimeType.KingdomIndexS;
// /**
//  * ParamValueTypes that may give a different normalized type than is provided
//  */
// export type OffshootParamValueType =
//     | RuntimeType.NumberLike
//     | RuntimeType.IntegerLike
//     | RuntimeType.UnsignedIntegerLike
//     | RuntimeType.UInt4S
//     | RuntimeType.UInt4Like
//     | RuntimeType.DateAsUInt4Like
//     | RuntimeType.UInt8S
//     | RuntimeType.BigIntLike
//     | RuntimeType.KingdomIndexS;

// // TODO: Implement transforming from one compatible type to another, for instance for PGJumprole to Jumprole
// /*export const TRANSFORM_TABLE: Record<ParamValueType, BaseParamValueType[]> = {
//     [ParamValueType.String]: [],
//     [ParamValueType.Number]: [],
//     [ParamValueType.Boolean]: [],
//     [ParamValueType.BooleanS]: [ParamValueType.Boolean],
//     [ParamValueType.NumberLike]: [ParamValueType.String, ParamValueType.Number],
//     [ParamValueType.IntegerLike]: [ParamValueType.String, ParamValueType.Number, ParamValueType.BigInt],
//     [ParamValueType.UnsignedIntegerLike]: [ParamValueType.String, ParamValueType.Number, ParamValueType.BigInt],
//     [ParamValueType.Snowflake]: [ParamValueType.String, ParamValueType.Snowflake, ParamValueType.BigInt, ParamValueType.UInt8B],
//     [ParamValueType.UInt4S]: [ParamValueType.UInt4N, ParamValueType.Number, ParamValueType.BigInt],
//     [ParamValueType.UInt4N]: [ParamValueType.Number, ParamValueType.UInt4S, ParamValueType.String, ParamValueType.BigInt],
//     [ParamValueType.UInt4Like]: [ParamValueType.UInt4N, ParamValueType.Number, ParamValueType.UInt4S, ParamValueType.String, ParamValueType.BigInt],
//     [ParamValueType.DateAsUInt4Like]: [ParamValueType.Date, ParamValueType.UInt4N, ParamValueType.UInt4S],
//     [ParamValueType.UInt8S]: [ParamValueType.UInt8B, ParamValueType.String, ParamValueType.Snowflake],
//     [ParamValueType.UInt8B]: [ParamValueType.UInt8S, ParamValueType.String, ParamValueType.Snowflake],
//     [ParamValueType.UInt8Like]: [ParamValueType.UInt8S, ParamValueType.UInt8B, ParamValueType.String, ParamValueType.Snowflake],
//     [ParamValueType.BigInt]: [ParamValueType.String],
//     [ParamValueType.BigIntLike]: [ParamValueType.String, ParamValueType.BigInt],
//     [ParamValueType.Date]: [ParamValueType.UInt4N, ParamValueType.UInt4S],
//     [ParamValueType.KingdomIndexN]: [ParamValueType.KingdomIndexS],
//     [ParamValueType.KingdomIndexS]: [ParamValueType.KingdomIndexN],
// };*/

// export interface OptionalParamType {
//     value: RuntimeType;
//     accepts_null: boolean;
//     accepts_undefined: boolean;
//     preserve_undefined: boolean;
// }

// export type ParamType = RuntimeType | OptionalParamType;

// export interface NotRequiredCondition {
//     property: string;
//     equals: NormalizedStructure;
// }

// export interface Parameter {
//     type: ParamType;
//     name: string;
//     not_required_condition?: NotRequiredCondition;
//     must_equal?: NormalizedStructure;
// }

// export const enum ParamTypeValidationResult {
//     Invalid = 0,
//     Optional,
//     Value,
// }

// export interface ParameterValidationResult {
//     type_check: ParameterTypeCheckResult;
//     normalized_value?: NormalizedStructure;
// }

// export const is_ParamValueType = function (object: unknown): object is RuntimeType {
//     return (Object.values(RuntimeType) as unknown[]).includes(object);
// };

// export const validate_ParamType = function (object?: unknown): ParamTypeValidationResult {
//     if (typeof object !== "string") {
//         if (typeof object !== "object") {
//             return ParamTypeValidationResult.Invalid;
//         } else if (object === null || ("value" in object && "accepts_null" in object && "accepts_undefined" in object) === false) {
//             return ParamTypeValidationResult.Invalid;
//         } else if (
//             // @ts-expect-error checked above whether value was in object
//             is_ParamValueType(object.value) &&
//             // @ts-expect-error checked above whether accepts_null was in object
//             is_boolean(object.accepts_null) &&
//             // @ts-expect-error checked above whether accepts_undefined was in object
//             is_boolean(object.accepts_undefined) &&
//             // @ts-expect-error checked above whether preserve_undefined was in object
//             (is_boolean(object.preserve_undefined) || object.preserve_undefined === undefined)
//         ) {
//             return ParamTypeValidationResult.Optional;
//         } else {
//             return ParamTypeValidationResult.Invalid;
//         }
//     } else {
//         if (is_ParamValueType(object)) {
//             return ParamTypeValidationResult.Value;
//         } else {
//             return ParamTypeValidationResult.Invalid;
//         }
//     }
// };

// export const meets_not_required_condition = function (body: unknown, not_required_condition?: NotRequiredCondition): boolean {
//     if (not_required_condition instanceof Object === false || not_required_condition === undefined) {
//         return false;
//     } else {
//         if (is_string(not_required_condition?.property) && typeof body === "object" && body !== null && not_required_condition.property in body) {
//             // @ts-expect-error not_required_condition.property was verified to be a property of body above
//             return body[not_required_condition.property] === not_required_condition.equals;
//         } else {
//             return false;
//         }
//     }
// };

// // eslint-disable-next-line complexity
// export const validate_parameter = function (property: unknown, type: ParamType): ParameterValidationResult {
//     const type_classification = validate_ParamType(type);

//     const value = (val: NormalizedStructure): ParameterValidationResult => {
//         return {
//             type_check: ParameterTypeCheckResult.Correct,
//             normalized_value: val,
//         };
//     };
//     const bad_type: ParameterValidationResult = {
//         type_check: ParameterTypeCheckResult.IncorrectType,
//     };
//     const bad_value: ParameterValidationResult = {
//         type_check: ParameterTypeCheckResult.InvalidValue,
//     };

//     switch (type_classification) {
//         case ParamTypeValidationResult.Invalid: {
//             return { type_check: ParameterTypeCheckResult.InvalidValue };
//         }
//         case ParamTypeValidationResult.Optional: {
//             const optional_type = type as OptionalParamType;
//             if (property === null) {
//                 if (optional_type.accepts_null) {
//                     return value(null);
//                 } else {
//                     return bad_type;
//                 }
//             } else if (property === undefined) {
//                 if (optional_type.accepts_undefined) {
//                     return value(optional_type.preserve_undefined !== false ? undefined : null);
//                 } else {
//                     return bad_type;
//                 }
//             } else {
//                 return validate_parameter(property, optional_type.value);
//             }
//         }
//         case ParamTypeValidationResult.Value: {
//             const value_type = type as RuntimeType;

//             switch (value_type) {
//                 case RuntimeType.Boolean: {
//                     if (is_boolean(property)) return value(property);
//                     else return bad_type;
//                 }
//                 case RuntimeType.BooleanS: {
//                     if (is_string(property) === false) return bad_type;
//                     const lower = (property as string).toLowerCase();
//                     if (lower === "y" || lower === "yes" || lower === "true") return value(true);
//                     else if (lower === "n" || lower === "no" || lower === "false") return value(false);
//                     else return bad_value;
//                 }
//                 case RuntimeType.String: {
//                     if (is_string(property)) return value(property);
//                     else return bad_type;
//                 }
//                 case RuntimeType.Snowflake: {
//                     if (is_string(property) === false) return bad_type;
//                     else if (is_valid_Snowflake(property)) return value((property as string).toString());
//                     else return bad_value;
//                 }
//                 case RuntimeType.Number: {
//                     if (is_number(property)) return value(property);
//                     else return bad_type;
//                 }
//                 case RuntimeType.NumberLike: {
//                     if (is_number(property)) return value(property);
//                     else if (typeof property === "bigint") {
//                         if (property <= Number.MAX_SAFE_INTEGER && property >= Number.MIN_SAFE_INTEGER) return value(Number(property));
//                         else return bad_value;
//                     } else if (is_string(property)) {
//                         const converted = Number(property);
//                         if (isNaN(converted) === false && isFinite(converted)) return value(converted);
//                         else return bad_value;
//                     } else return bad_type;
//                 }
//                 case RuntimeType.IntegerLike: {
//                     if (is_number(property)) {
//                         if (Number.isInteger(property)) return value(property);
//                         else return bad_value;
//                     } else if (typeof property === "bigint") {
//                         if (property <= Number.MAX_SAFE_INTEGER && property >= Number.MIN_SAFE_INTEGER) return value(Number(property));
//                         else return bad_value;
//                     } else if (is_string(property)) {
//                         const converted = Number(property);
//                         if (Number.isInteger(converted)) return value(converted);
//                         else return bad_value;
//                     } else return bad_type;
//                 }
//                 case RuntimeType.UnsignedIntegerLike: {
//                     if (is_number(property)) {
//                         if (Number.isSafeInteger(property) && property >= 0) return value(property);
//                         else return bad_value;
//                     } else if (typeof property === "bigint") {
//                         if (property >= 0n && property <= Number.MAX_SAFE_INTEGER) return value(Number(property));
//                         else return bad_value;
//                     } else if (is_string(property)) {
//                         const converted = Number(property);
//                         if (Number.isSafeInteger(converted) && converted >= 0) return value(converted);
//                         else return bad_value;
//                     } else return bad_type;
//                 }
//                 case RuntimeType.UInt4N: {
//                     if (is_number(property)) {
//                         if (Number.isInteger(property) && property >= 0 && property < UINT4) return value(property);
//                         else return bad_value;
//                     } else return bad_type;
//                 }
//                 case RuntimeType.UInt4S: {
//                     if (is_string(property)) {
//                         const converted = Number(property);
//                         if (Number.isInteger(converted) && converted >= 0 && converted < UINT4) return value(converted);
//                         else return bad_value;
//                     } else return bad_type;
//                 }
//                 case RuntimeType.UInt4Like: {
//                     if (is_number(property)) {
//                         if (Number.isInteger(property) && property >= 0 && property < UINT4) return value(property);
//                         else return bad_value;
//                     } else if (typeof property === "bigint") {
//                         if (property <= UINT4 && property >= 0) return value(Number(property));
//                         else return bad_value;
//                     } else if (is_string(property)) {
//                         const converted = Number(property);
//                         if (Number.isInteger(converted) && converted >= 0 && converted < UINT4) return value(converted);
//                         else return bad_value;
//                     } else return bad_type;
//                 }
//                 case RuntimeType.DateAsUInt4Like: {
//                     if (is_number(property)) {
//                         if (Number.isInteger(property) && property >= 0 && property < UINT4) return value(new Date(property * 1000));
//                         else return bad_value;
//                     } else if (typeof property === "bigint") {
//                         if (property <= UINT4 && property >= 0) return value(new Date(Number(property) * 1000));
//                         else return bad_value;
//                     } else if (is_string(property)) {
//                         const converted = Number(property);
//                         if (Number.isInteger(converted) && converted >= 0 && converted < UINT4) return value(new Date(converted * 1000));
//                         else return bad_value;
//                     } else return bad_type;
//                 }
//                 case RuntimeType.UInt8S: {
//                     if (is_string(property)) {
//                         try {
//                             const converted = BigInt(property);
//                             if (converted >= 0n && converted < UINT8) return value(converted);
//                             else return bad_value;
//                         } catch (err) {
//                             return bad_value;
//                         }
//                     } else return bad_type;
//                 }
//                 case RuntimeType.UInt8B: {
//                     if (typeof property === "bigint") {
//                         if (property >= 0n && property < UINT8) return value(property);
//                         else return bad_value;
//                     } else return bad_type;
//                 }
//                 case RuntimeType.UInt8Like: {
//                     if (typeof property === "bigint") {
//                         if (property >= 0n && property < UINT8) return value(property);
//                         else return bad_value;
//                     } else if (is_number(property)) {
//                         if (Number.isSafeInteger(property) && property >= 0) return value(BigInt(property));
//                         else return bad_value;
//                     } else if (is_string(property)) {
//                         try {
//                             const converted = BigInt(property);
//                             if (converted >= 0n && converted < UINT8) return value(converted);
//                             else return bad_value;
//                         } catch (err) {
//                             return bad_value;
//                         }
//                     } else return bad_type;
//                 }
//                 case RuntimeType.BigInt: {
//                     if (typeof property === "bigint") return value(property);
//                     else return bad_type;
//                 }
//                 case RuntimeType.BigIntLike: {
//                     if (typeof property === "bigint") {
//                         return value(property);
//                     } else if (is_number(property)) {
//                         if (Number.isSafeInteger(property)) return value(BigInt(property));
//                         else return bad_value;
//                     } else if (is_string(property)) {
//                         try {
//                             const converted = BigInt(property);
//                             return value(converted);
//                         } catch (err) {
//                             return bad_value;
//                         }
//                     } else return bad_type;
//                 }
//                 case RuntimeType.Date: {
//                     if (property instanceof Date) return value(property);
//                     else return bad_value;
//                 }
//                 case RuntimeType.KingdomIndexN: {
//                     if (is_number(property)) {
//                         if (Number.isInteger(property) && property < 19) return value(property);
//                         else return bad_value;
//                     } else return bad_value;
//                 }
//                 case RuntimeType.KingdomIndexS: {
//                     if (is_string(property)) {
//                         const converted = Number(property);
//                         if (Number.isInteger(converted) && converted < 19) return value(converted);
//                         else return bad_value;
//                     } else return bad_value;
//                 }
//                 default: {
//                     return {
//                         type_check: ParameterTypeCheckResult.InvalidParameterType,
//                     };
//                 }
//             }
//         }
//         default: {
//             return {
//                 type_check: ParameterTypeCheckResult.InvalidParameterType,
//             };
//         }
//     }
// };

// /**
//  * Returns the properties required if the object has all the proper requirements.
//  * Returns false if the body does not meet the requirements or if there were none.
//  * Logs the reasons it returned false also.
//  * @param object The request object to check
//  * @param properties The required properties the request must have
//  */
// // eslint-disable-next-line complexity
// export const require_properties = function (
//     object: unknown,
//     function_name: string,
//     ...properties: Parameter[]
// ): Record<string, NormalizedStructure> | false {
//     if (properties.length < 1) {
//         return typeof object === "object" && object !== null && Object.keys(object).length === 0 ? {} : false;
//     }
//     if (is_record(object) === false) {
//         log("require_properties: missing object entirely!", LogType.Status, DebugLogType.RequirePropertiesFunctionDebug);
//         return false;
//     } else if (is_record(object)) {
//         let has_all_required = true;

//         const record: Record<string, NormalizedStructure> = {};

//         for (const required_param of properties) {
//             if (meets_not_required_condition(object, required_param.not_required_condition) === false) {
//                 if (!!required_param.must_equal && required_param.must_equal !== object[required_param.name]) {
//                     log(
//                         `${function_name}: require_properties - incorrect value for ${safe_serialize(required_param.type)} parameter ${
//                             required_param.name
//                         } - body does not have correct value.`,
//                         LogType.Status,
//                         DebugLogType.RequirePropertiesFunctionDebug,
//                     );
//                     has_all_required = false;
//                 } else if (!!required_param.must_equal && required_param.must_equal === object[required_param.name]) {
//                     record[required_param.name] = required_param.must_equal;
//                 } else {
//                     const value = object[required_param.name];
//                     const result = validate_parameter(value, required_param.type);
//                     switch (result.type_check) {
//                         case ParameterTypeCheckResult.Correct: {
//                             if (
//                                 result.normalized_value === undefined &&
//                                 (validate_ParamType(required_param.type) === ParamTypeValidationResult.Optional &&
//                                     (required_param.type as OptionalParamType).preserve_undefined === true &&
//                                     value === undefined) === false
//                             ) {
//                                 log(
//                                     `${function_name}: require_properties - validate_parameter - property ${required_param.name} gave out a ParameterValidationResult that indicated the type was correct, but passed undefined as the normalized value! Returning false.`,
//                                     LogType.Mismatch,
//                                 );
//                                 return false;
//                             } else record[required_param.name] = result.normalized_value;
//                             continue;
//                         }
//                         case ParameterTypeCheckResult.InvalidParameterType: {
//                             log(
//                                 `${function_name}: require_properties - property ${required_param.name} had an invalid type requirement! Returning false.`,
//                                 LogType.Error,
//                             );
//                             return false;
//                         }
//                         case ParameterTypeCheckResult.IncorrectType: {
//                             switch (validate_ParamType(required_param.type)) {
//                                 case ParamTypeValidationResult.Invalid: {
//                                     log(
//                                         `${function_name}: require_properties - property ${required_param.name} had an invalid type requirement! Returning false.`,
//                                         LogType.Error,
//                                     );
//                                     return false;
//                                 }
//                                 case ParamTypeValidationResult.Optional: {
//                                     // Spaghetti code but its ok
//                                     const accepts = [
//                                         (required_param.type as OptionalParamType).accepts_null,
//                                         (required_param.type as OptionalParamType).accepts_undefined,
//                                     ]
//                                         .map((val, index) => (val ? ["null", "undefined"][index] : false))
//                                         .filter(val => val !== false)
//                                         .join(" and ");
//                                     log(
//                                         `${function_name}: require_properties - incorrect type for optional (also accepts ${accepts}) property of type ${
//                                             (<OptionalParamType>required_param.type).value
//                                         } named ${required_param.name} - got ${typeof value} from body`,
//                                         LogType.Status,
//                                         DebugLogType.RequirePropertiesFunctionDebug,
//                                     );
//                                     has_all_required = false;
//                                     continue;
//                                 }
//                                 case ParamTypeValidationResult.Value: {
//                                     log(
//                                         `${function_name}: require_properties - incorrect type for property of type ${safe_serialize(
//                                             required_param.type,
//                                         )} named ${required_param.name} - got ${typeof value} from body`,
//                                         LogType.Status,
//                                         DebugLogType.RequirePropertiesFunctionDebug,
//                                     );
//                                     has_all_required = false;
//                                     continue;
//                                 }
//                             }
//                             break;
//                         }
//                         case ParameterTypeCheckResult.InvalidValue: {
//                             switch (validate_ParamType(required_param.type)) {
//                                 case ParamTypeValidationResult.Invalid: {
//                                     log(
//                                         `${function_name}: require_properties - property ${required_param.name} had an invalid type requirement! Returning false.`,
//                                         LogType.Error,
//                                     );
//                                     return false;
//                                 }
//                                 case ParamTypeValidationResult.Optional: {
//                                     const accepts = [
//                                         (required_param.type as OptionalParamType).accepts_null,
//                                         (required_param.type as OptionalParamType).accepts_undefined,
//                                     ]
//                                         .map((val, index) => (val ? ["null", "undefined"][index] : false))
//                                         .filter(val => val !== false)
//                                         .join(" and ");
//                                     log(
//                                         `${function_name}: require_properties - incorrect value for optional ${safe_serialize(
//                                             required_param.type,
//                                         )} (also accepts ${accepts}) property ${required_param.name} - got ${safe_serialize(value)} from body`,
//                                         LogType.Status,
//                                         DebugLogType.RequirePropertiesFunctionDebug,
//                                     );
//                                     has_all_required = false;
//                                     continue;
//                                 }
//                                 case ParamTypeValidationResult.Value: {
//                                     log(
//                                         `${function_name}: require_properties - incorrect value for ${safe_serialize(required_param.type)} property ${
//                                             required_param.name
//                                         } - got ${safe_serialize(value)} from body`,
//                                         LogType.Status,
//                                         DebugLogType.RequirePropertiesFunctionDebug,
//                                     );
//                                     has_all_required = false;
//                                     continue;
//                                 }
//                             }
//                         }
//                     }
//                 }
//             } else {
//                 log(
//                     `${function_name}: require_properties - property ${required_param.name} of type ${safe_serialize(
//                         required_param.type,
//                     )} may or may not have been present, but it is not required due to body meeting the not-required condition.`,
//                     LogType.Status,
//                     DebugLogType.RequirePropertiesFunctionDebug,
//                 );
//             }
//         }

//         if (has_all_required === false) {
//             return false;
//         } else {
//             return record;
//         }
//     } else {
//         // never
//         return false;
//     }
// };

// type Mutable<Spec extends Specification<unknown>> = Spec extends Specification<infer _T> ? Parameter[] : never;

// /**
//  * Modifies a `Specification` object of a Partial of its original type
//  * @param specification The original `Specification` object
//  * @returns A new `Specification` object with all of its parameters set to accept undefined as well as the original type
//  */
// export const PartialSpecification = function <T>(specification: Specification<T>): Specification<Partial<T>> {
//     const new_specification: Mutable<Specification<Partial<T>>> = [];
//     for (const parameter of specification) {
//         const parameter_type = validate_ParamType(parameter.type);

//         switch (parameter_type) {
//             case ParamTypeValidationResult.Invalid: {
//                 log(
//                     `PartialSpecification: invalid Parameter element of specification - name "${parameter.name}" has type "${safe_serialize(
//                         parameter.type,
//                     )}". Ignoring parameter.`,
//                     LogType.Error,
//                 );
//                 continue;
//             }
//             case ParamTypeValidationResult.Optional: {
//                 const type = parameter.type as OptionalParamType;
//                 if (type.accepts_undefined) {
//                     log(`PartialSpecification: parameter with name "${parameter.name}" already is an optional that accepts undefined. Adding as is.`);
//                     new_specification.push(parameter);
//                 } else {
//                     const new_type = type;
//                     new_type.accepts_undefined = true;
//                     new_type.preserve_undefined = true;
//                     new_specification.push(parameter);
//                 }
//                 continue;
//             }
//             case ParamTypeValidationResult.Value: {
//                 // TypeScript still doesn't know parameter.type is a ParamValueType
//                 const type = parameter.type as RuntimeType;
//                 // Construct a new OptionalParamType of the original type that also accepts undefined
//                 const optional: OptionalParamType = {
//                     value: type,
//                     accepts_null: false,
//                     accepts_undefined: true,
//                     preserve_undefined: true,
//                 };
//                 // Make a new, identical parameter except the type is of the new optional type
//                 const new_parameter = parameter;
//                 new_parameter.type = optional;
//                 new_specification.push(new_parameter);
//             }
//         }
//     }
//     Object.freeze(new_specification);
//     return new_specification as Specification<Partial<T>>;
// };

// export const check_specification = function <T>(object: unknown, function_name: string, specification: Specification<T>): T | false {
//     const result = require_properties(object, function_name, ...specification);

//     // Assume the specification is correct. If it isn't, we will have a different return type then stated.
//     return result as T | false;
// };

// /**
//  *
//  * @param names The list of property names to filter
//  * @param specification The `Specification` used to decide whether to include a property name
//  * @returns The list of property names in the original list which are also represented as parameters in the `Specification`
//  */
// export const property_filter = function <T>(names: string[], specification: Specification<T>): string[] {
//     const new_names = [];

//     for (const name of names) {
//         for (const parameter of specification) {
//             if (parameter.name === name) {
//                 new_names.push(name);
//             }
//         }
//     }

//     return new_names;
// };

// export const argument_specification_from_manual = function <T extends readonly CommandArgument[]>(
//     manual_args: T,
// ): Specification<GetArgsResult<typeof manual_args>["values"]> {
//     const res: Parameter[] = [];
//     for (const arg of manual_args) {
//         const partial: Partial<Parameter> = { name: arg.id };
//         if (is_ParamValueType(arg.further_constraint)) {
//             partial.type = arg.further_constraint;
//         } else partial.type = RuntimeType.String;

//         if (arg.optional) {
//             partial.type = {
//                 value: partial.type,
//                 accepts_null: true,
//                 accepts_undefined: false,
//                 preserve_undefined: false,
//             };
//         }

//         res.push(partial as Parameter);
//     }
//     Object.freeze(res);
//     return res as Specification<GetArgsResult<typeof manual_args>["values"]>;
// };

// export type Specification<_T> = readonly Parameter[];

// export const Nullable = <Type extends RuntimeType>(
//     type: Type,
// ): { value: Type; accepts_null: true; accepts_undefined: false; preserve_undefined: false } => {
//     return { value: type, accepts_null: true, accepts_undefined: false, preserve_undefined: false };
// };
// export const Optional = <Type extends RuntimeType>(
//     type: Type,
// ): { value: Type; accepts_null: false; accepts_undefined: true; preserve_undefined: false } => {
//     return { value: type, accepts_null: false, accepts_undefined: true, preserve_undefined: false };
// };
