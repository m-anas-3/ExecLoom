import { eq } from "drizzle-orm";

import { withDatabase } from "../client.js";
import { users } from "../schema.js";

export type CreateUserRecordInput = {
  email: string;
  passwordHash: string;
};

export async function createUser(input: CreateUserRecordInput) {
  return withDatabase(async ({ db }) => {
    const [user] = await db
      .insert(users)
      .values({
        email: input.email,
        passwordHash: input.passwordHash
      })
      .onConflictDoNothing({
        target: users.email
      })
      .returning({
        id: users.id,
        email: users.email,
        createdAt: users.createdAt
      });

    return user ?? null;
  });
}

export async function findUserByEmailForAuth(email: string) {
  return withDatabase(async ({ db }) => {
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        passwordHash: users.passwordHash,
        createdAt: users.createdAt
      })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    return user ?? null;
  });
}
