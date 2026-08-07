import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, apiKeys } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { generateApiKey } from "@/lib/api-key";
import { LIMITS, optionalString, readJsonObject } from "@/lib/validate";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [dbUser] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!dbUser || dbUser.role !== "admin" || !dbUser.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const keys = await db.select({
    id: apiKeys.id,
    name: apiKeys.name,
    keyPrefix: apiKeys.keyPrefix,
    createdAt: apiKeys.createdAt,
    lastUsedAt: apiKeys.lastUsedAt,
  }).from(apiKeys).where(eq(apiKeys.companyId, dbUser.companyId));

  return NextResponse.json(keys.map(({ keyPrefix, ...k }) => ({ ...k, key: `${keyPrefix}${"•".repeat(24)}` })));
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [dbUser] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!dbUser || dbUser.role !== "admin" || !dbUser.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await readJsonObject(req);
  if (!body) return NextResponse.json({ error: "Body harus berupa JSON yang valid." }, { status: 400 });
  const name = optionalString(body.name, LIMITS.name);

  const { key, hash, prefix } = generateApiKey();

  await db.insert(apiKeys).values({
    id: randomUUID(),
    keyHash: hash,
    keyPrefix: prefix,
    name: name || "API Key",
    companyId: dbUser.companyId,
  });

  // Plaintext key is returned exactly once — it is not recoverable afterwards.
  return NextResponse.json({ key, name });
}

export async function DELETE(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [dbUser] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!dbUser || dbUser.role !== "admin" || !dbUser.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await readJsonObject(req);
  const id = body && optionalString(body.id, LIMITS.name);
  if (!id) return NextResponse.json({ error: "ID kunci tidak valid." }, { status: 400 });

  await db.delete(apiKeys).where(and(eq(apiKeys.id, id), eq(apiKeys.companyId, dbUser.companyId)));
  return NextResponse.json({ ok: true });
}
