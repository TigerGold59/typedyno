export const enum LogType {
    None = "None",
    Status = "Status",
    Error = "Error",
    Success = "Success",
    System = "System",
    Mismatch = "Mismatch",
    Incompatibility = "Incompatibility",
    FixedError = "FixedError",
    PromiseRejection = "PromiseRejection",
}

export const enum DebugLogType {
    None = "none",
    Decorators = "decorators",
    Timing = "timing",
    ManualValidationFailedReason = "manual_validation_failed_reason",
    KeyOffFunctionDebug = "key_off_function_debug",
    MakeManualFunctionDebug = "make_manual_function_debug",
    ProcessMessageForCommandsFunctionDebug = "process_message_for_commands_function_debug",
    AutomaticDispatchPassThrough = "automatic_dispatch_pass_through",
    RequirePropertiesFunctionDebug = "require_properties_function_debug",
    ModuleImports = "module_imports",
    ComputeJumproleHashValues = "compute_jumprole_hash_values",
}

export const chalkify = function (message: string, color: LogType): string {
    switch (color) {
        case LogType.Error:
            return message; //Chalk.red(message);
            break;
        case LogType.Success:
            return message; //Chalk.green(message);
            break;
        case LogType.System:
            return message; //Chalk.blue(message);
            break;
        case LogType.Mismatch:
            return message; //Chalk.magenta(message);
            break;
        case LogType.None:
            return message; //message;
            break;
        case LogType.Status:
            return message; //Chalk.yellow(message);
            break;
        case LogType.Incompatibility:
            return message; //Chalk.gray(message);
            break;
        case LogType.FixedError:
            return message; //Chalk.cyan(message);
            break;
        case LogType.PromiseRejection:
            return message; //Chalk.redBright(message);
            break;
    }
};

export const get_timestamp = function (): string {
    let date = new Date();
    return `(${date.getDate().toString()}/${(date.getMonth() + 1).toString()}/${date.getFullYear().toString()} ${date.getHours().toString()}:${date
        .getMinutes()
        .toString()}) `;
};

import { CONFIG } from "../config.js";

export const log = function (
    message: string,
    type: LogType = LogType.None,
    debug_log_type: DebugLogType = DebugLogType.None,
    no_timestamp: boolean = false,
) {
    let timestamp = "";
    if (no_timestamp === false) {
        timestamp = get_timestamp() + " ";
    }
    if (CONFIG.debug[debug_log_type] || type === LogType.Error) {
        console.log(timestamp + chalkify(message, type));
    }
};
