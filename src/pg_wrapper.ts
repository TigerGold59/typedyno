/* eslint-disable @typescript-eslint/ban-types */
/*
    This is definitely the dumbest workaround ever.
    I had to create a new file to wrap this because... well let's start from the beginning.
    I tried to just do import { Pool } from "pg"; like you normally would.
    Node complained (rightfully so) because I was on ESM modules and pg is a CommonJS module; it doesn't do named exports.
    So it told me to change it to import the default import and then use the property. I did so, and TypeScript didn't like it.
    TypeScript was showing NodePostgres.Pool as typeof NodePostgres.Pool (incredibly unhelpful, but I knew what was happening.)
    It recognized it as the class object, but then I couldn't use it as a value type; only a constructor.
    I discovered this was because @types/pg wrongfully declares named exports when that's not at all how the pg module actually works.
    So I made the PoolInstance type which detects the instance that the Pool class creates.
*/
//import { randomBytes } from "crypto";
import NodePostgres, { QueryArrayConfig, QueryArrayResult, QueryConfig, QueryResult, QueryResultRow, Submittable } from "pg";
//import { Structure } from "./utilities/runtime_typeguard/runtime_typeguard.js";
//import * as Structs from "./utilities/runtime_typeguard/standard_structures.js";
export const Pool = NodePostgres.Pool;
export type PoolInstance = NodePostgres.Pool;
export type PoolClient = NodePostgres.PoolClient;

export type UsesClient = "UsesClient";
export type MakesSingleRequest = "MakesSingleRequest";
export type QueryableUseType = UsesClient | MakesSingleRequest;
export type OpaqueBox<QueryMachine extends PoolInstance | PoolClient | UsingClient> = Omit<QueryMachine, "query">;
export type Queryable<Use extends QueryableUseType> = Use extends UsesClient
    ? OpaqueBox<PoolInstance | PoolClient | UsingClient>
    : PoolInstance | PoolClient | UsingClient;
//export type Once = PoolInstance | PoolClient | UsingClient;

const USING_CLIENT_DEBUG_MODE = true;
const NOT_COLLECTED_CLIENT_ERROR_DELAY_MS = 500;
export class UsingClient {
    readonly client: NodePostgres.PoolClient;
    readonly responsible_for_release: boolean;
    //readonly query: NodePostgres.PoolClient["query"];
    #_setTimeout_handle = null as NodeJS.Timeout | null;
    readonly #_query: PoolClient["query"];

    constructor(client: NodePostgres.PoolClient | UsingClient, responsible_for_release: boolean) {
        if (client instanceof UsingClient) {
            this.client = client.client;
            this.responsible_for_release = false;
        } else {
            this.client = client;
            this.responsible_for_release = responsible_for_release;
        }
        this.#_query = this.client.query.bind(this.client);
    }

    query<T extends Submittable>(queryStream: T): T;
    query<R extends any[] = any[], I extends any[] = any[]>(queryConfig: QueryArrayConfig<I>, values?: I): Promise<QueryArrayResult<R>>;
    query<R extends QueryResultRow = any, I extends any[] = any[]>(queryConfig: QueryConfig<I>): Promise<QueryResult<R>>;
    query<R extends QueryResultRow = any, I extends any[] = any[]>(queryTextOrConfig: string | QueryConfig<I>, values?: I): Promise<QueryResult<R>>;
    query<R extends any[] = any[], I extends any[] = any[]>(
        queryConfig: QueryArrayConfig<I>,
        callback: (err: Error, result: QueryArrayResult<R>) => void,
    ): void;
    query<R extends QueryResultRow = any, I extends any[] = any[]>(
        queryTextOrConfig: string | QueryConfig<I>,
        callback: (err: Error, result: QueryResult<R>) => void,
    ): void;
    query<R extends QueryResultRow = any, I extends any[] = any[]>(
        queryText: string,
        values: I[],
        callback: (err: Error, result: QueryResult<R>) => void,
    ): void;

    query(...args: unknown[]): Promise<QueryResult<QueryResultRow>> | void {
        if (USING_CLIENT_DEBUG_MODE) {
            if (this.#_setTimeout_handle !== null) {
                clearTimeout(this.#_setTimeout_handle);
            }
            this.#_setTimeout_handle = setTimeout(() => {
                throw new Error(
                    `UsingClient: object release not handled after ${NOT_COLLECTED_CLIENT_ERROR_DELAY_MS.toString()}ms (possible PoolClient leak). Exiting process.`,
                );
            }, NOT_COLLECTED_CLIENT_ERROR_DELAY_MS);
        }

        // @ts-expect-error dont worry lol! i got it all under control.
        return this.#_query(...args);
    }

    handle_release(): void {
        if (this.responsible_for_release) {
            if (USING_CLIENT_DEBUG_MODE) {
                if (this.#_setTimeout_handle !== null) {
                    clearTimeout(this.#_setTimeout_handle);
                    this.#_setTimeout_handle = null;
                }
            }
            this.client.release();
        }
    }

    force_release(): void {
        this.client.release();
    }
}

export const use_client = async (queryable: Queryable<UsesClient>, _name?: string): Promise<UsingClient> => {
    if (queryable instanceof Pool) {
        return new UsingClient(await queryable.connect(), true);
    } else return new UsingClient(queryable as PoolClient | UsingClient, false);
};
