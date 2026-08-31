import type { db } from "./client";

type Database = typeof db;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Centralizes the postgres-js transaction/root-client adapter mismatch in Drizzle. */
export function transactionDatabase(transaction: Transaction): Database {
  return transaction as unknown as Database;
}
