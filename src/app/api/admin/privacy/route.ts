import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-guard";
import { withTenant } from "@/lib/db/tenant";
import { companies, privacyEvents } from "@/lib/db/schema";
import { readPrivacy, advancePrivacy } from "@/lib/privacy";
import { allowedProvidersInput } from "@/lib/privacy-policy";
import { readJsonObject } from "@/lib/validate";
import { withApiErrors } from "@/lib/api-error";

export const GET = withApiErrors("admin/privacy", async (req: NextRequest) => {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;
  const companyId = guard.user.companyId;
  const result = await withTenant(companyId, async tx => ({
    ...await readPrivacy(tx, companyId),
    events: await tx.select().from(privacyEvents).where(eq(privacyEvents.companyId, companyId))
      .orderBy(desc(privacyEvents.createdAt), desc(privacyEvents.id)).limit(50),
  }));
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
});
export const PUT = withApiErrors("admin/privacy", async (req: NextRequest) => {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;
  const body = await readJsonObject(req);
  const allowed = allowedProvidersInput(body?.allowedProviders);
  if (!allowed || !Number.isSafeInteger(body?.revision) || Object.keys(body ?? {}).some(k => !["allowedProviders", "revision"].includes(k))) {
    return NextResponse.json({ error: "Pengaturan privasi tidak valid." }, { status: 400 });
  }
  const companyId = guard.user.companyId;
  const result = await withTenant(companyId, async tx => {
    await tx.select({ id: companies.id }).from(companies).where(and(eq(companies.id, companyId))).for("update");
    const current = await readPrivacy(tx, companyId);
    if (current.revision !== body!.revision) return null;
    await advancePrivacy(tx, companyId, "policy_changed", [], allowed);
    return readPrivacy(tx, companyId);
  });
  return result ? NextResponse.json(result) : NextResponse.json({ error: "Pengaturan berubah. Muat ulang sebelum menyimpan." }, { status: 409 });
});
