import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { chatMessages } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { messageId, feedback } = await req.json() as { messageId: string; feedback: "up" | "down" };
  await db.update(chatMessages).set({ feedback }).where(eq(chatMessages.id, messageId));

  return NextResponse.json({ ok: true });
}
