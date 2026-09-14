import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { requireAdmin } from "@/lib/auth-guard";
import { withApiErrors } from "@/lib/api-error";
import { readJsonObject } from "@/lib/validate";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import { parseSettingsInput, providerSecretContext } from "@/lib/ai-settings";
import { loadAiSettings } from "@/lib/ai-settings-store";
import { decryptSecret } from "@/lib/secret-box";
import { modelFor, type ProviderKeys } from "@/lib/models";
import { getEmbedding } from "@/lib/embeddings";
import { consumeRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { withTenant } from "@/lib/db/tenant";
import { companies, companyAiProviders } from "@/lib/db/schema";
import { getEffectiveSubscription } from "@/lib/pricing";
import { and, eq } from "drizzle-orm";

export const maxDuration = 45;

export const POST = withApiErrors("admin/ai-providers/test", async (req: NextRequest) => {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;
  const [company] = await db.select().from(companies).where(eq(companies.id, guard.user.companyId));
  if (!company || getEffectiveSubscription(company.plan, company.planExpiresAt).plan === "starter") throw new ForbiddenError();
  const body = await readJsonObject(req);
  if (!body) throw new ValidationError("Invalid JSON");
  const { purpose = "both", ...providerInput } = body;
  if (purpose !== "embedding" && purpose !== "generation" && purpose !== "both") throw new ValidationError("Invalid test purpose");
  const { providers: [input] } = parseSettingsInput({ primary: null, fallback: null, providers: [providerInput] });
  if (input.provider !== "google" && purpose === "embedding") throw new ValidationError("Only Gemini provides embeddings");
  if (input.apiKey === null) throw new ValidationError("API key diperlukan.");
  const limit = await consumeRateLimit(`byok-test:${company.id}`, { max: 6, windowMs: 60_000 });
  if (!limit.ok) return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Tunggu satu menit sebelum tes berikutnya." } },
    { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  const settings = await loadAiSettings(company.id);
  const stored = settings.providers.find(p => p.provider === input.provider);
  const key = input.apiKey ?? (stored ? decryptSecret(stored.encryptedKey, providerSecretContext(company.id, input.provider)) : null);
  if (!key) throw new ValidationError("Pasang API key terlebih dahulu.");
  const keys: ProviderKeys = { groq: null, gemini: null, ownOnly: true,
    [input.provider === "google" ? "gemini" : input.provider]: key };
  try {
    // No customer documents, no platform credentials, no fallback during a test.
    if (purpose !== "embedding") {
      const result = await generateText({ model: modelFor({ provider: input.provider, id: input.model }, keys),
        prompt: "Reply with OK.", maxOutputTokens: 256, maxRetries: 0, abortSignal: AbortSignal.timeout(15_000) });
      if (!result.text.trim()) throw new Error("Empty test answer");
    }
    if (input.provider === "google" && purpose !== "generation") await getEmbedding("Connection test", key);
  } catch {
    // SDK errors can contain request bodies/credentials. Never echo or log them.
    return NextResponse.json({ error: { code: "UPSTREAM_ERROR", message: "Tes gagal. Periksa key, akses model, saldo, dan batas pemakaian provider." } }, { status: 502 });
  }
  const testedAt = new Date();
  if (!input.apiKey && stored && stored.model === input.model && !settings.legacy &&
      (input.provider !== "google" || purpose === "both")) {
    // A concurrent key/model replacement must not inherit this test result.
    await withTenant(company.id, tx => tx.update(companyAiProviders).set({ lastTestedAt: testedAt }).where(and(
      eq(companyAiProviders.companyId, company.id), eq(companyAiProviders.provider, input.provider),
      eq(companyAiProviders.encryptedKey, stored.encryptedKey), eq(companyAiProviders.model, input.model),
    )));
  }
  return NextResponse.json({ ok: true, purpose, testedAt: testedAt.toISOString() });
});
