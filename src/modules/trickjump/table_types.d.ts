/* eslint-disable @typescript-eslint/ban-types */
import { Snowflake } from "discord.js";
import { QueryResult } from "pg";

interface trickjump_tiersTableRow {
    id: number;
    server: Snowflake;
    ordinal: number;
    name: string;
    display_name: string;
}
export type trickjump_tiers_QueryResults = QueryResult<trickjump_tiersTableRow>;

interface trickjump_jumpsTableRow {
    id: number;
    name: string;
    display_name: string;
    description: string;
    kingdom: number;
    location: string;
    jump_type: string;
    link: string;
    added_by: Snowflake;
    updated_at: number;
    server: Snowflake;
    tier_id: number;
    hash: string;
}
export type trickjump_jumpsQueryResults = QueryResult<trickjump_jumpsTableRow>;

interface trickjump_entriesTableRow {
    id: number;
    jump_id: number;
    jump_hash: string;
    holder: Snowflake;
    link: string;
    server: Snowflake;
    added_at: number;
    updated_at: number;
}
export type trickjump_entriesQueryResults = QueryResult<trickjump_entriesTableRow>;

interface trickjump_guildsTableRow {
    server: Snowflake;
    jumprole_channel: Snowflake;
}
export type trickjump_guildsQueryResults = QueryResult<trickjump_guildsTableRow>;
