import { BotInteraction } from "../functions.js";
import { is_number, is_string } from "./typeutils.js";

export type Snowflake = string;

export const is_valid_Snowflake = function (thing?: unknown): boolean {
    // does not return thing is Snowflake because
    // some types that are valid Snowflakes don't return true (i.e. 0.5)
    if (is_string(thing) === false && is_number(thing) === false) {
        return false;
    } else if (is_string(thing)) {
        return /^\d{1,22}$/.test(thing);
    } else if (is_number(thing)) {
        return /^\d{1,22}$/.test(thing.toString());
    }

    return false;
};

export const enum InclusionSpecifierType {
    Whitelist = "Whitelist",
    Blacklist = "Blacklist",
    DeferringWhitelist = "DeferringWhitelist",
    DeferringBlacklist = "DeferringBlacklist",
}

export interface InclusionSpecifier {
    type: InclusionSpecifierType;
    list: Snowflake[];
}

export interface Permissions {
    servers?: InclusionSpecifier;
    channels?: InclusionSpecifier;
    users?: InclusionSpecifier;
}

export const is_valid_InclusionSpecifier = function (thing?: Partial<InclusionSpecifier>): thing is InclusionSpecifier {
    if (!thing) {
        return false;
    } else if (
        thing.type !== InclusionSpecifierType.Blacklist &&
        thing.type !== InclusionSpecifierType.Whitelist &&
        thing.type !== InclusionSpecifierType.DeferringWhitelist &&
        thing.type !== InclusionSpecifierType.DeferringBlacklist
    ) {
        return false;
    } else if (Array.isArray(thing.list) === false) {
        return false;
    }

    for (const item in thing.list) {
        if (is_valid_Snowflake(item) === false) {
            return false;
        }
    }

    return true;
};

export const is_valid_Permissions = function (thing: unknown): thing is Permissions {
    if (!thing) {
        return false;
    } else if (
        (thing as Permissions).servers !== null &&
        (thing as Permissions).servers !== undefined &&
        is_valid_InclusionSpecifier((thing as Permissions).servers) === false
    ) {
        return false;
    } else if (
        (thing as Permissions).channels !== null &&
        (thing as Permissions).channels !== undefined &&
        is_valid_InclusionSpecifier((thing as Permissions).channels) === false
    ) {
        return false;
    } else if (
        (thing as Permissions).users !== null &&
        (thing as Permissions).users !== undefined &&
        is_valid_InclusionSpecifier((thing as Permissions).users) === false
    ) {
        return false;
    }

    return true;
};

export const enum TentativePermissionType {
    AllowedIfLowerLevelWhitelisted,
    AllowedThroughWhitelistIfLowerLevelAllowed, // indicates to allowed() function that a whitelist is the reason this is allowed. this allows
    // it to override the DeferringBlacklist and DeferringWhitelist AllowedIfLowerLevelWhitelisted result
    AllowedIfLowerLevelAllowed,
    NotAllowed,
}

export const allowed_under = function (snowflake?: Snowflake, specifier?: InclusionSpecifier): TentativePermissionType {
    if (!snowflake || is_valid_Snowflake(snowflake) === false) {
        return TentativePermissionType.NotAllowed;
    }
    if (!specifier || is_valid_InclusionSpecifier(specifier) === false) {
        return TentativePermissionType.AllowedIfLowerLevelAllowed;
    }

    const list = specifier.list;
    switch (specifier.type) {
        case InclusionSpecifierType.Blacklist:
            if (list.includes(snowflake)) {
                return TentativePermissionType.NotAllowed;
            } else {
                return TentativePermissionType.AllowedIfLowerLevelAllowed;
            }
        case InclusionSpecifierType.Whitelist:
            if (list.includes(snowflake)) {
                return TentativePermissionType.AllowedThroughWhitelistIfLowerLevelAllowed;
            } else {
                return TentativePermissionType.NotAllowed;
            }
        case InclusionSpecifierType.DeferringBlacklist:
            if (list.includes(snowflake)) {
                return TentativePermissionType.AllowedIfLowerLevelWhitelisted;
            } else {
                return TentativePermissionType.AllowedIfLowerLevelAllowed;
            }
        case InclusionSpecifierType.DeferringWhitelist:
            if (list.includes(snowflake)) {
                return TentativePermissionType.AllowedThroughWhitelistIfLowerLevelAllowed;
            } else {
                return TentativePermissionType.AllowedIfLowerLevelWhitelisted;
            }
    }
};

// eslint-disable-next-line complexity
export const allowed = function (interaction: BotInteraction, permissions?: Permissions): boolean {
    if (!permissions) {
        return true;
    }

    switch (
        allowed_under(interaction.guild?.id, permissions.servers) // Server level
    ) {
        case TentativePermissionType.NotAllowed: // Never allowed
            return false;
        case TentativePermissionType.AllowedIfLowerLevelAllowed: // Check lower levels for passive allowance
        case TentativePermissionType.AllowedThroughWhitelistIfLowerLevelAllowed:
            switch (
                allowed_under(interaction.channel.id, permissions.channels) // Channel level
            ) {
                case TentativePermissionType.NotAllowed: // Never allowed
                    return false;
                case TentativePermissionType.AllowedIfLowerLevelAllowed: // Check lower levels for passive allowance
                case TentativePermissionType.AllowedThroughWhitelistIfLowerLevelAllowed:
                    switch (
                        allowed_under(interaction.author.id, permissions.users) // User level
                    ) {
                        case TentativePermissionType.NotAllowed:
                            return false;
                        case TentativePermissionType.AllowedIfLowerLevelAllowed:
                        case TentativePermissionType.AllowedThroughWhitelistIfLowerLevelAllowed:
                        case TentativePermissionType.AllowedIfLowerLevelWhitelisted:
                            return true;
                    }
                    break;
                case TentativePermissionType.AllowedIfLowerLevelWhitelisted: // Check lower levels for whitelist allowance
                    switch (
                        allowed_under(interaction.author.id, permissions.users) // User level
                    ) {
                        case TentativePermissionType.AllowedThroughWhitelistIfLowerLevelAllowed:
                            return true;
                        case TentativePermissionType.AllowedIfLowerLevelAllowed:
                        case TentativePermissionType.AllowedIfLowerLevelWhitelisted:
                        case TentativePermissionType.NotAllowed:
                            return false;
                    }
            }
            break;
        case TentativePermissionType.AllowedIfLowerLevelWhitelisted: // Check lower levels for whitelisted allowance
            switch (
                allowed_under(interaction.channel.id, permissions.channels) // Channel level
            ) {
                case TentativePermissionType.AllowedThroughWhitelistIfLowerLevelAllowed:
                    switch (
                        allowed_under(interaction.author.id, permissions.users) // User level
                    ) {
                        case TentativePermissionType.AllowedIfLowerLevelAllowed:
                        case TentativePermissionType.AllowedThroughWhitelistIfLowerLevelAllowed:
                            return true;
                        case TentativePermissionType.AllowedIfLowerLevelWhitelisted:
                        case TentativePermissionType.NotAllowed:
                            return false;
                    }
                    break;
                case TentativePermissionType.AllowedIfLowerLevelWhitelisted:
                    switch (
                        allowed_under(interaction.author.id, permissions.users) // User level
                    ) {
                        case TentativePermissionType.AllowedThroughWhitelistIfLowerLevelAllowed:
                            return true;
                        case TentativePermissionType.AllowedIfLowerLevelAllowed:
                        case TentativePermissionType.AllowedIfLowerLevelWhitelisted:
                        case TentativePermissionType.NotAllowed:
                            return false;
                    }
                    break;
                case TentativePermissionType.AllowedIfLowerLevelAllowed: // Not sufficient. Channel must be whitelisted
                case TentativePermissionType.NotAllowed:
                    return false;
            }
    }
};

export const calc_perms = (
    interaction: BotInteraction,
    permissions: { permissions: Permissions | undefined; no_use_no_see: boolean }[],
): { no_use_no_see: boolean; allowed: boolean } => {
    for (let index = 0; index < permissions.length; index++) {
        let permission = permissions[index];
        if (allowed(interaction, permission.permissions)) {
            continue;
        } else {
            return {
                allowed: false,
                no_use_no_see: permissions.slice(index).some(x => x.no_use_no_see) === false,
            };
        }
    }
    return {
        allowed: true,
        no_use_no_see: false,
    };
};
