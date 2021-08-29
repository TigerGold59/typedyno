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
import NodePostgres from "pg";
export const Pool = NodePostgres.Pool;
export type PoolInstance = typeof Pool extends new (...args: any[]) => infer Instance ? Instance : never;
export type PoolClient = NodePostgres.PoolClient;
