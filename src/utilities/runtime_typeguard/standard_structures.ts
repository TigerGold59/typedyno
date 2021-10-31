import { is_valid_Snowflake } from "../permissions.js";
import {
    is_string,
    is_number,
    is_bigint_convertible,
    is_boolean,
    is_bigint,
    in_range,
    is_record,
    Range,
    RangeValidated,
    safe_serialize,
    NumberComparable,
} from "../typeutils.js";
import {
    Structure,
    PassthroughValidator,
    PreprocessorResult,
    StructureValidationFailedReason,
    TransformResult,
    value,
    error,
    NormalizedStructure,
    NormalizedStructureValidator,
    InferNormalizedType,
    UINT4,
    UINT8,
    AnyStructure,
    add_errors,
} from "./runtime_typeguard.js";

type NormalizedTypeTuple<Structures extends readonly AnyStructure[]> = {
    [K in keyof Structures & number]: InferNormalizedType<Structures[K]>;
};

export const Never = new Structure<never>(
    "never",
    (_input: unknown) => error("expected no value", StructureValidationFailedReason.IncorrectType),
    <Input extends never>(_result: Input): TransformResult<Input> => {
        return error("expected no value", StructureValidationFailedReason.IncorrectType);
    },
);

const StringToNumberPreprocessor = (input: unknown): PreprocessorResult => {
    if (is_string(input)) {
        const numberified = Number(input);
        if (is_number(numberified)) return { succeeded: true, changed: numberified };
        else return error("typeof input was string but it didn't represent a valid number", StructureValidationFailedReason.InvalidValue);
    } else return error(`typeof input was ${typeof input} (expected string)`, StructureValidationFailedReason.IncorrectType);
};

const StringToBigIntPreprocessor = (input: unknown): PreprocessorResult => {
    if (is_string(input)) {
        if (is_bigint_convertible(input)) return { succeeded: true, changed: BigInt(input) };
        else return error("typeof input was string but it didn't represent a valid bigint", StructureValidationFailedReason.InvalidValue);
    } else return error(`typeof input was ${typeof input} (expected string)`, StructureValidationFailedReason.IncorrectType);
};

export const IntegerValidator = (message: string): NormalizedStructureValidator<number> => {
    return <Input extends number>(to_validate: Input): TransformResult<Input> => {
        if (Number.isInteger(to_validate)) return { succeeded: true, result: to_validate };
        else return error(message, StructureValidationFailedReason.InvalidValue);
    };
};

export const RangeValidator = (
    range: Range,
    message_constructor: (range_validated: RangeValidated) => string,
): NormalizedStructureValidator<number> => {
    return <Input extends number>(to_validate: Input): TransformResult<Input> => {
        const range_validated = in_range(to_validate, range);
        if (range_validated.includes(false) === false) return { succeeded: true, result: to_validate };
        else return error(message_constructor(range_validated), StructureValidationFailedReason.InvalidValue);
    };
};

export const PositiveValidator = (message: string): NormalizedStructureValidator<number> => {
    return RangeValidator({ start: 0, start_inclusive: true }, _range_validated => message);
};

export const UInt4Validator = (broadest_previous_type: string): NormalizedStructureValidator<number> => {
    return RangeValidator({ start: 0, start_inclusive: true, end: UINT4, end_inclusive: false }, range_validated => {
        if (range_validated[0] === false) return `input was ${broadest_previous_type} but it was less than 0, making it an invalid UInt4`;
        else return `input was ${broadest_previous_type} but it was greater than or equal to ${UINT4.toString()}, making it an invalid UInt4`;
    });
};

export const UInt8Validator = (broadest_previous_type: string): NormalizedStructureValidator<number> => {
    return RangeValidator({ start: 0n, start_inclusive: true, end: UINT8, end_inclusive: false }, range_validated => {
        if (range_validated[0] === false) return `input was ${broadest_previous_type} but it was less than 0, making it an invalid UInt8`;
        else return `input was ${broadest_previous_type} but it was greater than or equal to ${UINT8.toString()}, making it an invalid UInt8`;
    });
};

export const ObjectAssignIntersector = <TypeOne extends NormalizedStructure, TypeTwo extends NormalizedStructure>(): ((
    result_one: TypeOne,
    result_two: TypeTwo,
) => TypeOne & TypeTwo) => {
    return (result_one: TypeOne, result_two: TypeTwo) => {
        return Object.assign({}, result_one, result_two);
    };
};

export const IsEnumeratedKeyCatchallDescriminator = <Representation extends { [key: string]: AnyStructure }>(
    structure: Representation,
): ((key: string) => boolean) => {
    const keys = Object.keys(structure);
    return (key: string) => {
        return keys.includes(key) === false;
    };
};

export const Unknown = new Structure<unknown>(
    "unknown",
    (input: unknown) => {
        return { succeeded: true, result: input };
    },
    <Input extends unknown>(result: Input) => {
        return { succeeded: true, result: result };
    },
);

export class LengthRestrictableStructure<NormalizedType extends string | NormalizedStructure[]> extends Structure<NormalizedType> {
    length(range: Range, broadest_previous_type = "string"): Structure<NormalizedType> {
        return this.validate(<Input extends NormalizedType>(result: Input): TransformResult<Input> => {
            const range_validated = in_range(result.length, range);
            if (range_validated[0] === false) {
                return error(
                    `input was ${broadest_previous_type} but had length greater than ${range.end_inclusive === true ? "" : "or equal to"} ${
                        range.end === undefined ? "infinity" : range.end.toString()
                    }`,
                    StructureValidationFailedReason.InvalidValue,
                );
            } else if (range_validated[1] === false) {
                return error(
                    `input was ${broadest_previous_type} but had length less than ${range.start_inclusive === true ? "" : "or equal to"} ${
                        range.start === undefined ? "negative infinity" : range.start.toString()
                    }`,
                    StructureValidationFailedReason.InvalidValue,
                );
            }
            return { succeeded: true, result: result };
        });
    }
}

export const StructureStructure = new Structure<AnyStructure>(
    "Structure",
    (input: unknown) => {
        if (input instanceof Structure) return { succeeded: true, result: input as AnyStructure };
        else return { succeeded: false, error: StructureValidationFailedReason.IncorrectType, information: ["expected instanceof Structure"] };
    },
    <Input extends AnyStructure>(result: Input): TransformResult<Input> => {
        if (result instanceof Structure) return { succeeded: true, result: result };
        else return { succeeded: false, error: StructureValidationFailedReason.IncorrectType, information: ["expected instanceof Structure"] };
    },
);

export class RangeRestrictableStructure<NormalizedType extends NumberComparable> extends Structure<NormalizedType> {
    range(range: Range, broadest_previous_type: string): Structure<NormalizedType> {
        return this.validate(
            RangeValidator(range, range_validated => {
                if (range_validated[0]) {
                    return `input was ${broadest_previous_type} but was greater than ${range.end_inclusive === true ? "" : "or equal to"} ${
                        range.end === undefined ? "infinity" : range.end.toString()
                    }`;
                } else
                    return `input was ${broadest_previous_type} but was less than ${range.start_inclusive === true ? "" : "or equal to"} ${
                        range.start === undefined ? "negative infinity" : range.start.toString()
                    }`;
            }),
        );
    }
}

export class RecordStructure<
    Representation extends { [key: string]: AnyStructure },
    CatchAllKey extends Structure<string> | Structure<never>,
    CatchAllValue extends AnyStructure,
> extends Structure<
    { [P in keyof Representation]: InferNormalizedType<Representation[P]> } & (InferNormalizedType<CatchAllKey> extends never
        ? unknown
        : { [P in InferNormalizedType<CatchAllKey>]: InferNormalizedType<CatchAllValue> })
> {
    readonly representation: Representation;
    readonly catchall_key: CatchAllKey;
    readonly catchall_value: CatchAllValue;

    constructor(
        structure: Representation,
        catchall_key: CatchAllKey,
        catchall_value: CatchAllValue,
        name = `{ ${Object.keys(structure)
            .map(key => `${key}: ${structure[key].name}`)
            .join(", ")} } `,
        value_descriptor: (key: string, structure_name: string) => string = (key, structure_name) =>
            `value from key ${key} on structure ${structure_name}`,
    ) {
        type NewNormalizedType = {
            [P in keyof Representation]: InferNormalizedType<Representation[P]>;
        } & (InferNormalizedType<CatchAllKey> extends never
            ? unknown
            : { [P in InferNormalizedType<CatchAllKey>]: InferNormalizedType<CatchAllValue> });

        super(
            name,
            (input: unknown) => {
                const new_result: Record<string, unknown> = {};
                if (is_record(input)) {
                    let all_correct = true;
                    const errors: string[] = [];
                    const keys = Object.keys(input);
                    for (const key of keys) {
                        if (key in structure === false) {
                            const catchall_result = catchall_key.check(key);
                            if (catchall_result.succeeded) {
                                const catchall_value_result = catchall_value.check(input[key]);
                                if (catchall_value_result.succeeded) {
                                    new_result[catchall_result.normalized] = catchall_value_result.normalized;
                                } else {
                                    add_errors(
                                        catchall_value_result.information,
                                        `${value_descriptor(key, name)} matched catchall key structure but not catchall value structure: `,
                                        errors,
                                    );
                                    all_correct = false;
                                }
                            } else {
                                add_errors(
                                    catchall_result.information,
                                    `${value_descriptor(key, name)} didn't match catchall key structure: `,
                                    errors,
                                );
                                all_correct = false;
                            }
                        } else {
                            const validated = structure[key].transform(input[key]);
                            if (validated.succeeded === false) {
                                add_errors(validated.information, `${value_descriptor(key, name)}: `, errors);
                                continue;
                            } else new_result[key] = validated.result;
                        }
                    }
                    if (all_correct) {
                        return { succeeded: true, result: new_result as NewNormalizedType };
                    } else return { succeeded: false, error: StructureValidationFailedReason.InvalidValue, information: errors };
                } else return error(`typeof input was ${typeof input} (expected non-null object)`, StructureValidationFailedReason.IncorrectType);
            },
            <Input extends NewNormalizedType>(result: Input): TransformResult<Input> => {
                let all_correct = true;
                const errors: string[] = [];
                const keys = Object.keys(result);
                for (const key of keys) {
                    if (key in structure === false) {
                        const catchall_result = catchall_key.check(key);
                        if (catchall_result.succeeded) {
                            const catchall_value_result = catchall_value.check(result[key]);
                            if (catchall_value_result.succeeded === false) {
                                add_errors(
                                    catchall_value_result.information,
                                    `${value_descriptor(key, name)} did not match catchall value: `,
                                    errors,
                                );
                                all_correct = false;
                            }
                        } else {
                            add_errors(catchall_result.information, `${value_descriptor(key, name)} did not match catchall key: `, errors);
                            all_correct = false;
                        }
                    } else {
                        const validated = structure[key].validate_transformed(result[key]);
                        if (validated.succeeded === false) {
                            add_errors(validated.information, `${value_descriptor(key, name)}: `, errors);
                            all_correct = false;
                            continue;
                        }
                    }
                }
                if (all_correct) {
                    return { succeeded: true, result: result };
                } else return { succeeded: false, error: StructureValidationFailedReason.InvalidValue, information: errors };
            },
        );
        this.representation = structure;
        this.catchall_key = catchall_key;
        this.catchall_value = catchall_value;
        Object.freeze(this);
    }

    unknown_keys<NewCatchAllKey extends Structure<string> | Structure<never>, NewCatchAllValue extends AnyStructure>(
        catchall_key: NewCatchAllKey,
        catchall_value: NewCatchAllValue,
    ): RecordStructure<Representation, NewCatchAllKey, NewCatchAllValue> {
        return new RecordStructure<Representation, NewCatchAllKey, NewCatchAllValue>(this.representation, catchall_key, catchall_value);
    }

    partial<MatchInvalidProperties extends AnyStructure>(
        match_invalid: MatchInvalidProperties,
        name = `{ ${Object.keys(this.representation)
            .map(key => `${key}: ${this.representation[key].name} | ${match_invalid.name}`)
            .join(", ")} } `,
    ): RecordStructure<
        { [P in keyof Representation]: Structure<InferNormalizedType<Representation[P]> | InferNormalizedType<MatchInvalidProperties>> },
        CatchAllKey,
        Structure<InferNormalizedType<CatchAllValue> | InferNormalizedType<MatchInvalidProperties>>
    > {
        type NewRepresentation = {
            [P in keyof Representation]: Structure<InferNormalizedType<Representation[P]> | InferNormalizedType<MatchInvalidProperties>>;
        } & (InferNormalizedType<CatchAllKey> extends never
            ? unknown
            : { [P in InferNormalizedType<CatchAllKey>]: InferNormalizedType<CatchAllValue> | InferNormalizedType<MatchInvalidProperties> });

        const new_representation: Record<string, unknown> = {};
        for (const key in this.representation) {
            new_representation[key] = Union(
                this.representation[key],
                match_invalid,
                (input: NormalizedStructure): input is NormalizedStructure => this.representation[key].check(input).succeeded,
            ) as unknown;
        }

        return new RecordStructure(
            new_representation as NewRepresentation,
            this.catchall_key,
            Union(
                this.catchall_value,
                match_invalid,
                (input: NormalizedStructure): input is NormalizedStructure => this.catchall_value.check(input).succeeded,
            ) as Structure<InferNormalizedType<CatchAllValue> | InferNormalizedType<MatchInvalidProperties>>,
            name,
        );
    }
}

/**
 * Creates a `Structure` around validating an object with a certain shape.
 * Example:
 * ```ts
 * const customer = Structure.Object({
 *  name: Structure.String,
 *  id: Structure.IDCard,
 *  tip: Structure.Nullable(Structure.Number)
 * });
 * ```
 * @param structure An object which represents the shape an input object must have to be valid.
 * @returns A `Structure` which validates the object.
 */

export const object = <StructureObject extends Record<string, AnyStructure>>(
    structure: StructureObject,
    name = `{ ${Object.keys(structure)
        .map(key => `${key}: ${structure[key].name}`)
        .join(", ")} } `,
    value_descriptor: (key: string, structure_name: string) => string = (key, structure_name) =>
        `value from key ${key} on structure ${structure_name}`,
): RecordStructure<StructureObject, Structure<never>, Structure<undefined>> => {
    return new RecordStructure(structure, Never, Undefined, name, value_descriptor);
};

/**
 * Creates a `Structure` which validates tuples element-wise.
 * Example:
 * ```ts
 * const tx_rx = Structure.Tuple(Structure.TX, Structure.RX);
 * const receivers = new mpsc.channel() // [tx, rx];
 * tx_rx.check(receivers) // succeeded
 * ```
 * @param tuple A list of `Structure`s in order that must be present in the array in order to be valid.
 * @returns A new `Structure` which validates tuple inputs.
 */

export const tuple = <StructureTuple extends readonly AnyStructure[]>(...tuple: StructureTuple): Structure<NormalizedTypeTuple<StructureTuple>> => {
    type NewNormalizedType = NormalizedTypeTuple<StructureTuple>;
    const new_name = `[ ${tuple.map(val => val.name).join(", ")} ] `;
    return new Structure(
        new_name,
        (input: unknown) => {
            const new_result: unknown[] = [];
            if (is_record(input)) {
                let all_correct = true;
                const errors: string[] = [];
                for (let key = 0; key < tuple.length; key++) {
                    const validated = tuple[key].transform(input[key]);
                    if (validated.succeeded) {
                        new_result.push(validated.result);
                    } else {
                        add_errors(validated.information, `element ${key.toString()} of tuple type ${new_name}: `, errors);
                        all_correct = false;
                    }
                }
                if (all_correct) {
                    return { succeeded: true, result: new_result as unknown as NewNormalizedType };
                } else return { succeeded: false, error: StructureValidationFailedReason.InvalidValue, information: errors };
            } else return error(`typeof input was ${typeof input} (expected non-null object)`, StructureValidationFailedReason.IncorrectType);
        },
        <Input extends NewNormalizedType>(result: Input): TransformResult<Input> => {
            let all_correct = true;
            const errors: string[] = [];
            for (let key = 0; key < tuple.length; key++) {
                const validated = tuple[key].validate_transformed(result[key]);
                if (validated.succeeded === false) {
                    add_errors(validated.information, `element ${key.toString()} of tuple type ${new_name}: `, errors);
                    all_correct = false;
                }
            }
            if (all_correct) {
                return { succeeded: true, result: result };
            } else return { succeeded: false, error: StructureValidationFailedReason.InvalidValue, information: errors };
        },
    );
};

export const array = <NormalizedType extends NormalizedStructure>(structure: Structure<NormalizedType>): Structure<NormalizedType[]> => {
    return new LengthRestrictableStructure(
        `${structure.name}[]`,
        (input: unknown): TransformResult<NormalizedType[]> => {
            if (Array.isArray(input)) {
                let all_correct = true;
                const errors: string[] = [];
                const accumulated: NormalizedType[] = [];
                input.forEach((element, index) => {
                    const result = structure.transform(element);
                    if (result.succeeded) {
                        accumulated.push(result.result);
                    } else {
                        add_errors(result.information, `element ${index.toString()} of array structure ${structure.name}[]: `, errors);
                        all_correct = false;
                    }
                });
                if (all_correct) return { succeeded: true, result: accumulated };
                else return { succeeded: false, error: StructureValidationFailedReason.InvalidValue, information: errors };
            } else return error(`typeof input was ${typeof input} (expected Array)`, StructureValidationFailedReason.IncorrectType);
        },
        <Input extends NormalizedType[]>(result: Input): TransformResult<Input> => {
            const errors: string[] = [];
            result.forEach((element, index) => {
                const item_result = structure.validate_transformed(element);
                if (item_result.succeeded === false)
                    add_errors(item_result.information, `element ${index.toString()} of array structure ${structure.name}[]: `, errors);
            });
            if (errors.length === 0) return { succeeded: true, result: result };
            else return { succeeded: false, error: StructureValidationFailedReason.InvalidValue, information: errors };
        },
    );
};

/**
 * Creates a Structure that only accepts one value.
 * @param value The value that the input must be equal to in order to pass validation
 * @param name The name of the `Structure`. This should fit grammatically in the sentence "input did not equal <name>". Default: `safe_serialize(value)`
 * @returns Structure<typeof value, typeof value>
 */
export const Value = <Value extends NormalizedStructure>(value: Value, name = safe_serialize(value)): Structure<Value> => {
    return new Structure<Value>(
        name,
        (input: unknown): TransformResult<Value> => {
            if (input === value) return { succeeded: true, result: value };
            else return { succeeded: false, error: StructureValidationFailedReason.InvalidValue, information: [`input did not equal ${name}`] };
        },
        PassthroughValidator<Value>(),
    );
};

/**
 * Merges two Structures.
 * @param precedent_structure A structure to match first against input to be checked.
 * @param secondary_structure A structure to match as a fallback if input fails the check against `precedent_structure`.
 * @param discriminator A function that returns `true` if the input should be mapped or validated by `precedent_structure`, and `false` if it should be mapped or validated by `secondary_structure`.
 * @returns A new `Structure` abiding by the rules above.
 */
export const Union = <NormalizedTypeOne extends NormalizedStructure, NormalizedTypeTwo extends NormalizedStructure>(
    precedent_structure: Structure<NormalizedTypeOne>,
    secondary_structure: Structure<NormalizedTypeTwo>,
    discriminator: (input: NormalizedTypeOne | NormalizedTypeTwo) => input is NormalizedTypeOne,
): Structure<NormalizedTypeOne | NormalizedTypeTwo> => {
    const new_name = `${precedent_structure.name} | ${secondary_structure.name}`;
    return new Structure(
        new_name,
        (input: unknown): TransformResult<NormalizedTypeOne | NormalizedTypeTwo> => {
            const result_one = precedent_structure.transform(input);
            if (result_one.succeeded) return result_one;
            const result_two = secondary_structure.transform(input);
            if (result_two.succeeded) return result_two;
            else
                return {
                    succeeded: false,
                    error: StructureValidationFailedReason.NoMatchingUnionMember,
                    information: result_one.information
                        .map(info => `union member ${precedent_structure.name}: ${info}`)
                        .concat(result_two.information.map(info => `union member ${secondary_structure.name}: ${info}`)),
                };
        },
        <Input extends NormalizedTypeOne | NormalizedTypeTwo>(result: Input): TransformResult<Input> => {
            if (discriminator(result)) {
                return precedent_structure.validate_transformed(result);
            }
            // @ts-expect-error the only option is for result to be NormalizedTypeTwo
            else return secondary_structure.validate_transformed(result);
        },
    );
};

/**
 * Combines two `Structures` into one that requires both to return `succeeded` on a given input.
 * Example:
 * ```ts
 * const payer = Structure.Object({
 *  id: Structure.IDCard,
 *  tip: Structure.Nullable(Structure.Number)
 * });
 *
 * type Payer = InferNormalizedType<typeof payer>;
 *
 * const person = Structure.Object({
 *  name: Structure.String
 * });
 *
 * type Person = InferNormalizedType<typeof person>;
 *
 * const customer = Structure.Intersection(payer, person, (result_one: Payer, result_two: Person): Payer & Person => {
 *  return Object.assign({}, result_one, result_two);
 * }, PassthroughPostprocessor<Payer & Person>())
 * ```
 * @param precedent_structure The `Structure` to use by default when mapping `NormalizedTypeOne & NormalizedTypeTwo`.
 * @param secondary_structure The `Structure` to use for mapping when `discriminator` returns `false`.
 * @param intersector A function which takes the output of `precedent_structure.transform` and `secondary_structure.transform` and returns the correct intersected type.
 * @param map A function which takes the output of the validation step and determines the final output type.
 * @returns A new combined structure.
 */
export const Intersection = <NormalizedTypeOne extends NormalizedStructure, NormalizedTypeTwo extends NormalizedStructure>(
    precedent_structure: Structure<NormalizedTypeOne>,
    secondary_structure: Structure<NormalizedTypeTwo>,
    intersector: (result_one: NormalizedTypeOne, result_two: NormalizedTypeTwo) => NormalizedTypeOne & NormalizedTypeTwo = ObjectAssignIntersector<
        NormalizedTypeOne,
        NormalizedTypeTwo
    >(),
): Structure<NormalizedTypeOne & NormalizedTypeTwo> => {
    const new_name = `${precedent_structure.name} & ${secondary_structure.name}`;
    return new Structure(
        new_name,
        (input: unknown): TransformResult<NormalizedTypeOne & NormalizedTypeTwo> => {
            // TODO: somehow handle record structure intersection better than this
            if (precedent_structure instanceof RecordStructure) {
                precedent_structure = precedent_structure.unknown_keys(string, Unknown) as Structure<NormalizedTypeOne>;
            }
            if (secondary_structure instanceof RecordStructure) {
                secondary_structure = secondary_structure.unknown_keys(string, Unknown) as Structure<NormalizedTypeTwo>;
            }
            const result_one = precedent_structure.transform(input);
            const result_two = secondary_structure.transform(input);
            if (result_one.succeeded && result_two.succeeded) {
                return { succeeded: true, result: intersector(result_one.result, result_two.result) };
            } else
                return {
                    succeeded: false,
                    error: StructureValidationFailedReason.InvalidValue,
                    information: (result_one.succeeded ? [] : result_one.information).concat(result_two.succeeded ? [] : result_two.information),
                };
        },
        <Input extends NormalizedTypeOne & NormalizedTypeTwo>(result: Input) => {
            const validated_one = precedent_structure.validate_transformed(result);
            const validated_two = secondary_structure.validate_transformed(result);
            if (validated_one.succeeded && validated_two.succeeded) return { succeeded: true, result: result };
            else
                return {
                    succeeded: false,
                    error: StructureValidationFailedReason.InvalidValue,
                    information: (validated_one.succeeded ? [] : validated_one.information)
                        .map(info => `intersection member ${precedent_structure.name}: ${info}`)
                        .concat(
                            (validated_two.succeeded ? [] : validated_two.information).map(
                                info => `intersection member ${secondary_structure.name}: ${info}`,
                            ),
                        ),
                };
        },
    );
};

export const Null = Value(null);
export const Undefined = Value(undefined);

export const Nullable = <OldNormalizedType extends NormalizedStructure>(
    structure: Structure<OldNormalizedType>,
): Structure<OldNormalizedType | null> => {
    return Union(Null, structure, (input: OldNormalizedType | null): input is null => {
        return input === null;
    });
};

export const Optional = <OldNormalizedType extends NormalizedStructure>(
    structure: Structure<OldNormalizedType>,
): Structure<OldNormalizedType | undefined> => {
    return Union(Undefined, structure, (input: OldNormalizedType | undefined): input is undefined => {
        return input === undefined;
    });
};

export const OptionalNullable = <OldNormalizedType extends NormalizedStructure>(
    structure: Structure<OldNormalizedType>,
): Structure<OldNormalizedType | undefined | null> => {
    return Optional(Nullable(structure));
};

export const string = new LengthRestrictableStructure<string>(
    "String",
    (input: unknown): TransformResult<string> => {
        if (is_string(input)) {
            return { succeeded: true, result: input };
        } else
            return {
                succeeded: false,
                error: StructureValidationFailedReason.IncorrectType,
                information: [`typeof input was ${typeof input} (expected string)`],
            };
    },
    PassthroughValidator<string>(),
);
export const number = new RangeRestrictableStructure<number>(
    "Number",
    (input: unknown): TransformResult<number> => {
        if (is_number(input)) {
            return { succeeded: true, result: input };
        } else
            return {
                succeeded: false,
                error: StructureValidationFailedReason.IncorrectType,
                information: [`typeof input was ${typeof input} (expected number)`],
            };
    },
    PassthroughValidator<number>(),
);

export const boolean = new Structure<boolean>(
    "Boolean",
    (input: unknown): TransformResult<boolean> => {
        if (is_boolean(input)) {
            return { succeeded: true, result: input };
        } else
            return {
                succeeded: false,
                error: StructureValidationFailedReason.IncorrectType,
                information: [`typeof input was ${typeof input} (expected boolean)`],
            };
    },
    PassthroughValidator<boolean>(),
);

export const bigint = new RangeRestrictableStructure<bigint>(
    "BigInt",
    (input: unknown): TransformResult<bigint> => {
        if (is_bigint(input)) {
            return { succeeded: true, result: input };
        } else {
            return {
                succeeded: false,
                error: StructureValidationFailedReason.IncorrectType,
                information: [`typeof input was ${typeof input} (expected bigint)`],
            };
        }
    },
    PassthroughValidator<bigint>(),
);

export const BooleanS = boolean
    .before((to_validate: unknown): PreprocessorResult => {
        if (is_string(to_validate)) {
            const lower = to_validate.toLowerCase();
            if (lower === "y" || lower === "yes" || lower === "true") return value(true);
            else if (lower === "n" || lower === "no" || lower === "false") return value(false);
            else return error("typeof input was string but it didn't represent a valid boolean", StructureValidationFailedReason.InvalidValue);
        } else return value(to_validate);
    })
    .with_name("BooleanS");

export const NumberLike = number
    .before((to_validate: unknown): PreprocessorResult => {
        if (is_string(to_validate)) {
            const numberified = Number(to_validate);
            if (is_number(numberified)) return { succeeded: true, changed: numberified };
            else return error("typeof input was string but it didn't represent a valid number", StructureValidationFailedReason.InvalidValue);
        } else if (typeof to_validate === "bigint") {
            if (to_validate <= Number.MAX_SAFE_INTEGER && to_validate >= Number.MIN_SAFE_INTEGER) {
                return value(Number(to_validate));
            } else return error("typeof input was bigint but it wasn't in the safe number range", StructureValidationFailedReason.InvalidValue);
        } else return value(to_validate);
    })
    .with_name("NumberLike");

export const Integer = number.validate(IntegerValidator("input was a number but it wasn't an integer")).with_name("Integer");
export const UnsignedInteger = number
    .validate(PositiveValidator("input was an integer but it wasn't greater than or equal to zero"))
    .with_name("UnsignedInteger");

export const IntegerLike = NumberLike.validate(IntegerValidator("input was number-like but it wasn't an integer")).with_name("IntegerLike");
export const UnsignedIntegerLike = IntegerLike.validate(
    PositiveValidator("input was integer-like but it wasn't greater than or equal to zero"),
).with_name("UnsignedIntegerLike");

export const Snowflake = string
    .validate(<Input extends string>(to_validate: Input): TransformResult<Input> => {
        if (is_valid_Snowflake(to_validate)) return { succeeded: true, result: to_validate };
        else return error("input was a string but it wasn't a valid Snowflake", StructureValidationFailedReason.InvalidValue);
    })
    .with_name("Snowflake");

export const UInt4N = Integer.validate(UInt4Validator("an integer")).with_name("UInt4N");
export const UInt4S = Integer.before(StringToNumberPreprocessor).validate(UInt4Validator("a string-represented integer")).with_name("UInt4S");
export const UInt4Like = IntegerLike.validate(UInt4Validator("integer-like")).with_name("UInt4Like");
export const DateAsUInt4Like = Structure.after(UInt4Like, (result: number) => {
    return { succeeded: true, result: new Date(result * 1000) };
}).with_name("DateAsUInt4Like");

export const UInt8B = bigint.validate(UInt8Validator("a bigint")).with_name("UInt8B");
export const UInt8S = bigint.validate(UInt8Validator("a bigint-convertible string")).before(StringToBigIntPreprocessor).with_name("UInt8S");
export const UInt8Like = bigint
    .validate(UInt8Validator("bigint-like"))
    .before((input: unknown) => {
        if (is_number(input)) {
            if (Number.isSafeInteger(input)) return value(BigInt(input));
            else return error("typeof input was number, but it wasn't a safe integer", StructureValidationFailedReason.InvalidValue);
        } else if (is_bigint(input)) {
            return value(input);
        } else if (is_string(input)) {
            if (is_bigint_convertible(input)) return { succeeded: true, changed: BigInt(input) };
            else return error("typeof input was string but it didn't represent a valid bigint", StructureValidationFailedReason.InvalidValue);
        } else return error(`typeof input was ${typeof input} (expected string, bigint, or number)`, StructureValidationFailedReason.IncorrectType);
    })
    .with_name("UInt8Like");

export const BigIntLike = bigint
    .before((input: unknown) => {
        if (is_number(input)) {
            if (Number.isSafeInteger(input)) return value(BigInt(input));
            else return error("typeof input was number, but it wasn't a safe integer", StructureValidationFailedReason.InvalidValue);
        } else if (is_bigint(input)) {
            return value(input);
        } else if (is_string(input)) {
            if (is_bigint_convertible(input)) return { succeeded: true, changed: BigInt(input) };
            else return error("typeof input was string but it didn't represent a valid bigint", StructureValidationFailedReason.InvalidValue);
        } else return error(`typeof input was ${typeof input} (expected string, bigint, or number)`, StructureValidationFailedReason.IncorrectType);
    })
    .with_name("BigIntLike");

export const date = new Structure<Date>(
    "Date",
    (input: unknown): TransformResult<Date> => {
        if (input instanceof Date) return { succeeded: true, result: input };
        else return error(`typeof input was ${typeof input} (expected input to be instanceof Date)`, StructureValidationFailedReason.IncorrectType);
    },
    PassthroughValidator<Date>(),
);

export const KingdomIndexN = UInt4N.validate(
    RangeValidator({ end: 19, end_inclusive: false }, range_validated => {
        if (range_validated[0]) return "input was a valid UInt4N but it wasn't less than 19";
        else return "input was a valid UInt4N but something went wrong while validating";
    }),
);

export const KingdomIndexS = UInt4S.validate(
    RangeValidator({ end: 19, end_inclusive: false }, range_validated => {
        if (range_validated[0]) return "input was a valid UInt4S but it wasn't less than 19";
        else return "input was a valid UInt4S but something went wrong while validating";
    }),
);

export const InstanceOf = <Instance extends NormalizedStructure, Arguments extends unknown[], ClassType extends new (...args: Arguments) => Instance>(
    class_type: ClassType,
): Structure<Instance> => {
    return new Structure<Instance>(
        class_type.name,
        (input: unknown): TransformResult<Instance> => {
            if (input instanceof class_type) {
                return { succeeded: true, result: input };
            } else return error(`expected instanceof ${class_type.name}`, StructureValidationFailedReason.IncorrectType);
        },
        PassthroughValidator<Instance>(),
    );
};

const BYTES_32_BASE64_REGEX = /^[a-zA-Z0-9/+]{43}=$/;

export const Base64Hash = string.validate(<Input extends string>(input: Input): TransformResult<Input> => {
    if (BYTES_32_BASE64_REGEX.test(input)) return { succeeded: true, result: input };
    else return error("input was string but didn't match 32 byte base64 string regex", StructureValidationFailedReason.InvalidValue);
});

export const TwitterLink = string.validate(<Input extends string>(result: Input): TransformResult<Input> => {
    if (/^https:\/\/twitter\.com\/[a-zA-Z0-9_]{1,16}\/status\/[0-9]{3,35}\/?/i.test(result.trim())) {
        return { succeeded: true, result: result };
    } else
        return {
            succeeded: false,
            error: StructureValidationFailedReason.InvalidValue,
            information: [
                `link to Twitter video was a string but it didn't fit the following format: 'https://twitter.com/<username>/status/<tweet snowflake>'`,
            ],
        };
});
