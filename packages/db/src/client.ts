import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { loadConfig } from "@execloom/config";

import * as schema from "./schema.js";

export type DatabaseHealth =
  | {
      status: "ok";
    }
  | {
      status: "error";
      message: string;
    };

export function createDatabaseClient(databaseUrl = loadConfig().DATABASE_URL) {
  const queryClient = postgres(databaseUrl, {
    max: 10
  });

  const db = drizzle(queryClient, { schema });

  return {
    db,
    queryClient,
    async close() {
      await queryClient.end();
    }
  };
}

export type DatabaseClient = ReturnType<typeof createDatabaseClient>;

export async function withDatabase<T>(
  callback: (client: DatabaseClient) => Promise<T>,
  databaseUrl = loadConfig().DATABASE_URL
): Promise<T> {
  const client = createDatabaseClient(databaseUrl);

  try {
    return await callback(client);
  } finally {
    await client.close();
  }
}

export async function getDatabaseHealth(
  databaseUrl = loadConfig().DATABASE_URL
): Promise<DatabaseHealth> {
  const client = createDatabaseClient(databaseUrl);

  try {
    await client.db.execute(sql`select 1`);
    return { status: "ok" };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Unknown database error"
    };
  } finally {
    await client.close();
  }
}
