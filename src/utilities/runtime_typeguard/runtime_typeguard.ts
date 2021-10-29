import { indent } from "../../command_manual.js";
import { Tier } from "../../modules/trickjump/tier/internals/tier_type.js";
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
