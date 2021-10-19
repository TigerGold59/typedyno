/* eslint-disable @typescript-eslint/ban-types */
import { Snowflake } from "discord.js";
import { QueryResult } from "pg";

type prefixesTableRow = { snowflake: Snowflake; prefix: string };
export type PrefixQueryResults = QueryResult<prefixesTableRow>;

type usersTableRow = { snowflake: Snowflake; permissions: string };
export type UserQueryResults = QueryResult<usersTableRow>;

type serversTableRow = { snowflake: Snowflake; full_access: boolean; server: Snowflake };
export type ServerQueryResults = QueryResult<serversTableRow>;
