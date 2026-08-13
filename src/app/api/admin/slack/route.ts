import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireCompanyAdmin } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { slackInstallations } from "@/lib/db/schema";

/** Whether this company's workspace is connected, and to what, for SlackTab. */
export async function GET(req: NextRequest) {
  const guard = await requireCompanyAdmin(req);
  if (!guard.ok) return guard.response;

  const [row] = await db.select({
    teamName: slackInstallations.teamName,
    installedAt: slackInstallations.installedAt,
  }).from(slackInstallations).where(eq(slackInstallations.companyId, guard.user.companyId)).limit(1);

  return NextResponse.json({
    connected: !!row,
    teamName: row?.teamName ?? null,
    installedAt: row?.installedAt ?? null,
  });
}

/** Disconnects this company's Slack workspace. Slack's own token is left to expire on its side. */
export async function DELETE(req: NextRequest) {
  const guard = await requireCompanyAdmin(req);
  if (!guard.ok) return guard.response;

  await db.delete(slackInstallations).where(eq(slackInstallations.companyId, guard.user.companyId));
  return NextResponse.json({ ok: true });
}
