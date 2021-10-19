import { Message } from "discord.js";
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
export const allowed = function (message: Message, permissions?: Permissions): boolean {
    if (!permissions) {
        return true;
    }

    switch (
        allowed_under(message.guild?.id, permissions.servers) // Server level
    ) {
        case TentativePermissionType.NotAllowed: // Never allowed
            return false;
        case TentativePermissionType.AllowedIfLowerLevelAllowed: // Check lower levels for passive allowance
        case TentativePermissionType.AllowedThroughWhitelistIfLowerLevelAllowed:
            switch (
                allowed_under(message.channel.id, permissions.channels) // Channel level
            ) {
                case TentativePermissionType.NotAllowed: // Never allowed
                    return false;
                case TentativePermissionType.AllowedIfLowerLevelAllowed: // Check lower levels for passive allowance
                case TentativePermissionType.AllowedThroughWhitelistIfLowerLevelAllowed:
                    switch (
                        allowed_under(message.author.id, permissions.users) // User level
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
                        allowed_under(message.author.id, permissions.users) // User level
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
                allowed_under(message.channel.id, permissions.channels) // Channel level
            ) {
                case TentativePermissionType.AllowedThroughWhitelistIfLowerLevelAllowed:
                    switch (
                        allowed_under(message.author.id, permissions.users) // User level
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
                        allowed_under(message.author.id, permissions.users) // User level
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

/* 
const enum PermittedByWhitelistType {
    PermissionsOne,
    PermissionsTwo,
    Both
}

type RequiresWhitelistedUserType = PermittedByWhitelistType
const RequiresWhitelistedUser = PermittedByWhitelistType

export interface PermittedConfiguration {
    servers?: [Snowflake],
    channels?: [Snowflake],
    users?: [Snowflake]
}
*/

/**
 * This function checks if two commands with the given permissions could both be used in the same channel by the same user.
 * This is useful to determine whether a function name overlap should be allowed or whether it is okay, because
 * one would always be restricted anyway. Argument order doesn't matter.
 * @param permissions_one A permissions object for one command
 * @param permissions_two A permissions object for the other command
 * @returns Boolean indicating whether the permissions object have overlap.
 */
/*
export const overlap = function(permissions_one: Permissions, permissions_two: Permissions): boolean {

    // USER LEVEL

    let combined_special_users: string[] = []
    if (Array.isArray(permissions_one.users)) {
        combined_special_users = combined_special_users.concat(permissions_one.users.filter(el => is_valid_Snowflake(el) && (combined_special_users.includes(el) === false))).map(el => el.toString())
    }
    if (Array.isArray(permissions_two.users)) {
        combined_special_users = combined_special_users.concat(permissions_two.users.filter(el => is_valid_Snowflake(el) && (combined_special_users.includes(el) === false))).map(el => el.toString())
    }

    const unique_user_id = (Number(combined_special_users.sort()[0]) - 1).toString() // find the lowest ID in the list, subtract one. it will be unique
    
    combined_special_users.push(unique_user_id) // add an ID that is not treated specially

    // Check whether any of the user_ids are allowed under permissions_one and permissions_two
    let permitted_passively_users: string[] = [] // stores user IDs that are permitted passively by both permissions_one and permissions_two
    let permitted_by_whitelist_users: {[key: string]: PermittedByWhitelistType} = {} // object stores user IDs that are permitted by whitelist and whether they are permitted by both or which one

    for (const user_id of combined_special_users) {
        const permissions_one_result = allowed_under(user_id, permissions_one.users)
        const permissions_two_result = allowed_under(user_id, permissions_two.users)

        // If both are allowed through whitelist or passively allowed, handle both cases
        if (permissions_one_result === permissions_two_result) {
            switch (permissions_one_result) {
                case TentativePermissionType.AllowedThroughWhitelistIfLowerLevelAllowed:
                    permitted_by_whitelist_users[user_id] = PermittedByWhitelistType.Both;
                    continue;
                case TentativePermissionType.AllowedIfLowerLevelAllowed:
                    permitted_passively_users.push(user_id);
                    continue;
                default:
                    continue;
            }
        }
        // Check whether one is allowed through whitelist and one is passively allowed. If so, log it in permitted_by_whitelist
        else if ([permissions_one_result, permissions_two_result].sort() === [TentativePermissionType.AllowedThroughWhitelistIfLowerLevelAllowed, TentativePermissionType.AllowedIfLowerLevelAllowed]) {
            let whitelisted = permissions_one_result === TentativePermissionType.AllowedThroughWhitelistIfLowerLevelAllowed ? PermittedByWhitelistType.PermissionsOne : PermittedByWhitelistType.PermissionsTwo

            permitted_by_whitelist_users[user_id] = whitelisted;
            continue;
        }
    }

    let combined_special_channels: string[] = []
    if (Array.isArray(permissions_one.channels)) {
        combined_special_channels = combined_special_channels.concat(permissions_one.channels.filter(el => is_valid_Snowflake(el) && (combined_special_channels.includes(el) === false))).map(el => el.toString())
    }
    if (Array.isArray(permissions_two.channels)) {
        combined_special_channels = combined_special_channels.concat(permissions_two.channels.filter(el => is_valid_Snowflake(el) && (combined_special_channels.includes(el) === false))).map(el => el.toString())
    }

    // CHANNEL LEVEL

    const unique_channel_id = (Number(combined_special_channels.sort()[0]) - 1).toString() // find the lowest ID in the list, subtract one. it will be unique
    
    combined_special_channels.push(unique_channel_id) // add an ID that is not treated specially

    // Check whether any of the channel_ids are allowed under permissions_one and permissions_two
    let permitted_passively_channels: string[] = [] // stores channel IDs that are permitted passively by both permissions_one and permissions_two
    let permitted_by_whitelist_channels: {[key: string]: PermittedByWhitelistType} = {} // object stores channel IDs that are permitted by whitelist and whether they are permitted by both or which one
    let requires_whitelisted_users: {[key: string]: RequiresWhitelistedUserType}
    let requires_whitelisted_users_and_whitelisted: {[key: string]: boolean} // Records channel IDs that have one permissions object that requires a whitelisted user and one that is whitelisted. The boolean indicates whether the whitelisted one is last.

    for (const channel_id of combined_special_channels) {
        const permissions_one_result = allowed_under(channel_id, permissions_one.channels)
        const permissions_two_result = allowed_under(channel_id, permissions_two.channels)

        const regular_order = [permissions_one_result, permissions_two_result].sort()

        // If both are allowed through whitelist or passively allowed, handle both cases
        if (permissions_one_result === permissions_two_result) {
            switch (permissions_one_result) {
                case TentativePermissionType.AllowedThroughWhitelistIfLowerLevelAllowed:
                    permitted_by_whitelist_channels[channel_id] = PermittedByWhitelistType.Both;
                    continue;
                case TentativePermissionType.AllowedIfLowerLevelAllowed:
                    permitted_passively_channels.push(channel_id);
                    continue;
                case TentativePermissionType.AllowedIfLowerLevelWhitelisted:
                    requires_whitelisted_users[channel_id] = RequiresWhitelistedUser.Both
                default:
                    continue;
            }
        }
        // Check whether one is allowed through whitelist and one is passively allowed. If so, log it in permitted_by_whitelist
        else if (regular_order === [TentativePermissionType.AllowedThroughWhitelistIfLowerLevelAllowed, TentativePermissionType.AllowedIfLowerLevelAllowed]) {
            let whitelisted = permissions_one_result === TentativePermissionType.AllowedThroughWhitelistIfLowerLevelAllowed ? PermittedByWhitelistType.PermissionsOne : PermittedByWhitelistType.PermissionsTwo

            permitted_by_whitelist_users[channel_id] = whitelisted;
            continue;
        }
        else if (regular_order[0] === TentativePermissionType.AllowedIfLowerLevelWhitelisted && regular_order[1] === TentativePermissionType.AllowedIfLowerLevelAllowed) {
            let delegating = permissions_one_result === TentativePermissionType.AllowedIfLowerLevelWhitelisted ? RequiresWhitelistedUser.PermissionsOne : RequiresWhitelistedUser.PermissionsTwo

            requires_whitelisted_users[channel_id] = delegating;
            continue;
        }
        else if (regular_order[0] === TentativePermissionType.AllowedIfLowerLevelWhitelisted && regular_order[1] === TentativePermissionType.AllowedThroughWhitelistIfLowerLevelAllowed) {
            requires_whitelisted_users_and_whitelisted[channel_id] = permissions_two_result === TentativePermissionType.AllowedThroughWhitelistIfLowerLevelAllowed
            continue;
        }
    }

    let combined_special_servers: string[] = []
    if (Array.isArray(permissions_one.servers)) {
        combined_special_servers = combined_special_servers.concat(permissions_one.servers.filter(el => is_valid_Snowflake(el) && (combined_special_servers.includes(el) === false))).map(el => el.toString())
    }
    if (Array.isArray(permissions_two.servers)) {
        combined_special_servers = combined_special_servers.concat(permissions_two.servers.filter(el => is_valid_Snowflake(el) && (combined_special_servers.includes(el) === false))).map(el => el.toString())
    }

    // SERVER LEVEL

    const unique_server_id = (Number(combined_special_servers.sort()[0]) - 1).toString() // find the lowest ID in the list, subtract one. it will be unique
    
    combined_special_servers.push(unique_server_id) // add an ID that is not treated specially

    // Check whether any of the server_ids are allowed under permissions_one and permissions_two
    let permitted_servers: string[] = [] // stores server IDs that are permitted passively by both permissions_one and permissions_two
    let requires_whitelisted_channels: {[key: string]: RequiresWhitelistedUserType}

    for (const server_id of combined_special_servers) {
        const permissions_one_result = allowed_under(server_id, permissions_one.servers)
        const permissions_two_result = allowed_under(server_id, permissions_two.servers)

        const regular_order = [permissions_one_result, permissions_two_result].sort()

        // If both are allowed through whitelist or passively allowed, handle both cases
        if (permissions_one_result === permissions_two_result) {
            switch (permissions_one_result) {
                case TentativePermissionType.AllowedThroughWhitelistIfLowerLevelAllowed:
                case TentativePermissionType.AllowedIfLowerLevelAllowed:
                    permitted_servers.push(server_id);
                    continue;
                case TentativePermissionType.AllowedIfLowerLevelWhitelisted:
                    requires_whitelisted_users[server_id] = RequiresWhitelistedUser.Both
                default:
                    continue;
            }
        }
        // Check whether one requires a channel to be whitelisted and one is passively allowed. If so, log it in requires_whitelisted_channelx
        if (regular_order[0] === TentativePermissionType.AllowedIfLowerLevelWhitelisted && (regular_order[1] === TentativePermissionType.AllowedIfLowerLevelAllowed || regular_order[1] === TentativePermissionType.AllowedThroughWhitelistIfLowerLevelAllowed)) {
            let delegating = permissions_one_result === TentativePermissionType.AllowedIfLowerLevelWhitelisted ? RequiresWhitelistedUser.PermissionsOne : RequiresWhitelistedUser.PermissionsTwo

            requires_whitelisted_channels[server_id] = delegating;
            continue;
        }
    }

    // Assume any channel ID can be a part of any server, until we have a better way.
    let permitted_configurations: PermittedConfiguration[] = []

    if (permitted_passively_users.length === 0 && permitted_by_whitelist_users.length === 0) {
        return false;
    }

}
*/
