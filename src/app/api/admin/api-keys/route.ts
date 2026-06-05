import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, apiKeys } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

function generateApiKey(): string {
  const raw = randomUUID().replace(/-/g, "");
  return `ib_${raw}`;
}

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
    key: apiKeys.key,
    createdAt: apiKeys.createdAt,
    lastUsedAt: apiKeys.lastUsedAt,
  }).from(apiKeys).where(eq(apiKeys.companyId, dbUser.companyId));

  return NextResponse.json(keys.map((k) => ({ ...k, key: `${k.key.slice(0, 8)}${"•".repeat(24)}` })));
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [dbUser] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!dbUser || dbUser.role !== "admin" || !dbUser.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name } = await req.json() as { name: string };
  const key = generateApiKey();

  await db.insert(apiKeys).values({
    id: randomUUID(),
    key,
    name: name || "API Key",
    companyId: dbUser.companyId,
  });

  return NextResponse.json({ key, name });
}

export async function DELETE(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [dbUser] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!dbUser || dbUser.role !== "admin" || !dbUser.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await req.json() as { id: string };
  await db.delete(apiKeys).where(eq(apiKeys.id, id));
  return NextResponse.json({ ok: true });
}
