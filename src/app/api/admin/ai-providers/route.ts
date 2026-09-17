import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { withApiErrors } from "@/lib/api-error";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import { readJsonObject } from "@/lib/validate";
import { parseSettingsInput, settingsView } from "@/lib/ai-settings";
import { loadAiSettings, saveAiSettings, removeAiProvider } from "@/lib/ai-settings-store";
import { isAiProvider } from "@/lib/ai-providers";
import { getEffectiveSubscription } from "@/lib/pricing";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const GET = withApiErrors("admin/ai-providers", async (req: NextRequest) => {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;
  const view = settingsView(await loadAiSettings(guard.user.companyId));
  return NextResponse.json(view, { headers: { "Cache-Control": "no-store", ETag: `"${view.revision}"` } });
});

function expectedRevision(req: NextRequest): string {
  return req.headers.get("If-Match")?.match(/^"([a-f0-9]{64})"$/)?.[1] ?? "";
}

export const PUT = withApiErrors("admin/ai-providers", async (req: NextRequest) => {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;
  const body = await readJsonObject(req);
  if (!body) throw new ValidationError("Invalid JSON");
  const input = parseSettingsInput(body);
  // Disabling BYOK/removing credentials remains possible after a downgrade,
  // including when the encryption master key is unavailable.
  const disableOnly = input.primary === null && input.fallback === null &&
    input.providers.every(p => p.apiKey === null);
  if (!disableOnly) {
    const [company] = await db.select().from(companies).where(eq(companies.id, guard.user.companyId));
    if (!company || getEffectiveSubscription({ plan: company.plan, expiresAt: company.planExpiresAt, isPilot: company.isPilot }).plan === "starter") {
      throw new ForbiddenError("BYOK requires a paid plan", { userMessage: "BYOK tersedia pada paket berbayar." });
    }
  }
  return NextResponse.json(settingsView(await saveAiSettings(guard.user.companyId, input, expectedRevision(req))));
});

export const DELETE = withApiErrors("admin/ai-providers", async (req: NextRequest) => {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;
  const provider = req.nextUrl.searchParams.get("provider");
  if (!isAiProvider(provider)) throw new ValidationError("Invalid provider");
  await removeAiProvider(guard.user.companyId, provider, expectedRevision(req));
  return new NextResponse(null, { status: 204 });
});
