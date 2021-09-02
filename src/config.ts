import { PresenceData } from "discord.js";
import { DebugLogType } from "./utilities/log";

export type Config = {
    admins: readonly string[];
    use: readonly string[];
    event_listeners: readonly string[];
    presence_data: PresenceData | null;
    debug: { [P in DebugLogType]: boolean };
};

export const CONFIG: Config = {
    admins: ["424564535030972426"],
    use: ["trickjump"],
    event_listeners: [],
    presence_data: null,
    debug: {
        none: true,
        decorators: false,
        timing: true,
        manual_validation_failed_reason: false,
        key_off_function_debug: false,
        make_manual_function_debug: true,
        process_message_for_commands_function_debug: false,
        automatic_dispatch_pass_through: true,
        require_properties_function_debug: true,
        module_imports: true,
        compute_jumprole_hash_values: false,
    },
} as const;
