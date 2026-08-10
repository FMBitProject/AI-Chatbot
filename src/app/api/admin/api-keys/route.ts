import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { generateApiKey } from "@/lib/api-key";
import { LIMITS, optionalString, readJsonObject } from "@/lib/validate";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;
  const { companyId } = guard.user;

  const keys = await db.select({
    id: apiKeys.id,
    name: apiKeys.name,
    keyPrefix: apiKeys.keyPrefix,
    createdAt: apiKeys.createdAt,
    lastUsedAt: apiKeys.lastUsedAt,
  }).from(apiKeys).where(eq(apiKeys.companyId, companyId));

  return NextResponse.json(keys.map(({ keyPrefix, ...k }) => ({ ...k, key: `${keyPrefix}${"•".repeat(24)}` })));
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;
  const { companyId } = guard.user;

  const body = await readJsonObject(req);
  if (!body) return NextResponse.json({ error: "Body harus berupa JSON yang valid." }, { status: 400 });
  const name = optionalString(body.name, LIMITS.name);

  const { key, hash, prefix } = generateApiKey();

  await db.insert(apiKeys).values({
    id: randomUUID(),
    keyHash: hash,
    keyPrefix: prefix,
    name: name || "API Key",
    companyId,
  });

  // Plaintext key is returned exactly once — it is not recoverable afterwards.
  return NextResponse.json({ key, name });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;
  const { companyId } = guard.user;

  const body = await readJsonObject(req);
  const id = body && optionalString(body.id, LIMITS.name);
  if (!id) return NextResponse.json({ error: "ID kunci tidak valid." }, { status: 400 });

  await db.delete(apiKeys).where(and(eq(apiKeys.id, id), eq(apiKeys.companyId, companyId)));
  return NextResponse.json({ ok: true });
}
