import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { apiTokens } from "@/db/schema";
import type { DbOrTx } from "@/db/types";

const hash = (secret: string) => createHash("sha256").update(secret).digest("hex");
export async function listCoachTokens(db: DbOrTx, userId: string) {
  return db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      createdAt: apiTokens.createdAt,
      expiresAt: apiTokens.expiresAt,
      revokedAt: apiTokens.revokedAt,
    })
    .from(apiTokens)
    .where(eq(apiTokens.userId, userId))
    .orderBy(desc(apiTokens.createdAt))
    .limit(100);
}

export async function createCoachToken(db: DbOrTx, userId: string, name: string, days: number) {
  if (!name.trim() || name.length > 80 || ![30, 90, 365].includes(days))
    throw new Error("Choose a name and a supported expiry.");
  const active = await db
    .select({ id: apiTokens.id })
    .from(apiTokens)
    .where(
      and(
        eq(apiTokens.userId, userId),
        isNull(apiTokens.revokedAt),
        gt(apiTokens.expiresAt, new Date()),
      ),
    )
    .limit(10);
  if (active.length >= 10)
    throw new Error("Revoke an unused token before creating another (10 active tokens maximum).");
  const id = crypto.randomUUID(),
    secret = randomBytes(32).toString("base64url");
  const token = `ovl_coach_${id}.${secret}`;
  const expiresAt = new Date(Date.now() + days * 86_400_000);
  await db
    .insert(apiTokens)
    .values({ id, userId, name: name.trim(), tokenHash: hash(token), expiresAt });
  return { token, expiresAt: expiresAt.toISOString() };
}

export async function revokeCoachToken(db: DbOrTx, userId: string, tokenId: string) {
  await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, userId)));
}

/** The only owner-connection read before RLS: authenticate this opaque credential to establish its user. */
export async function authenticateCoachToken(
  db: DbOrTx,
  token: string,
  now = new Date(),
): Promise<string | null> {
  const match =
    /^ovl_coach_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/.exec(
      token,
    );
  if (!match) return null;
  const [row] = await db
    .select({ userId: apiTokens.userId, tokenHash: apiTokens.tokenHash })
    .from(apiTokens)
    .where(
      and(eq(apiTokens.id, match[1]!), isNull(apiTokens.revokedAt), gt(apiTokens.expiresAt, now)),
    )
    .limit(1);
  if (!row) return null;
  const stored = Buffer.from(row.tokenHash, "hex"),
    supplied = Buffer.from(hash(token), "hex");
  return stored.length === supplied.length && timingSafeEqual(stored, supplied) ? row.userId : null;
}
