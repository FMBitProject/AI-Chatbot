import { eq, sql } from "drizzle-orm";
import { withTenant, type TenantTx } from "./db/tenant";
import { companies, companyAiProviders, companyAiSettings } from "./db/schema";
import { PROVIDER_CATALOG } from "./ai-providers";
import { mergeSettings, settingsRevision, type SettingsInput, type StoredAiSettings } from "./ai-settings";
import { ConflictError } from "./errors";

export async function readAiSettings(tx: TenantTx, companyId: string): Promise<StoredAiSettings> {
  // Writers lock this same row before updating settings, keys and legacy
  // columns. Hold a shared lock across all reads: READ COMMITTED alone allows
  // a save to commit between SELECTs and combine two different configurations.
  const [company] = await tx.select({ groq: companies.groqApiKey, google: companies.geminiApiKey })
    .from(companies).where(eq(companies.id, companyId)).for("share");
  const [settings] = await tx.select().from(companyAiSettings).where(eq(companyAiSettings.companyId, companyId));
  if (settings) return {
    primary: settings.primaryProvider, fallback: settings.fallbackProvider, legacy: false,
    providers: await tx.select().from(companyAiProviders).where(eq(companyAiProviders.companyId, companyId)),
  };
  const providers = (["groq", "google"] as const).flatMap(provider => company?.[provider] ? [{
    provider, model: PROVIDER_CATALOG[provider].models[0], encryptedKey: company[provider]!, lastTestedAt: null,
  }] : []);
  return { primary: company?.groq ? "groq" : company?.google ? "google" : null,
    fallback: company?.groq && company?.google ? "google" : null, legacy: true, providers };
}
export async function loadAiSettings(companyId: string): Promise<StoredAiSettings> {
  return withTenant(companyId, tx => readAiSettings(tx, companyId));
}
function checkRevision(current: StoredAiSettings, expectedRevision?: string) {
  if (expectedRevision !== undefined && expectedRevision !== settingsRevision(current)) {
    throw new ConflictError("AI settings changed since this form was loaded", {
      userMessage: "Pengaturan AI sudah berubah. Muat ulang pengaturan sebelum menyimpan lagi.",
    });
  }
}
export async function saveAiSettings(companyId: string, input: SettingsInput, expectedRevision?: string): Promise<StoredAiSettings> {
  return withTenant(companyId, async tx => {
    // Also serializes the first save, before a settings row exists.
    await tx.execute(sql`select id from companies where id = ${companyId} for update`);
    const current = await readAiSettings(tx, companyId);
    checkRevision(current, expectedRevision);
    const next = mergeSettings(companyId, current, input);
    await tx.insert(companyAiSettings).values({ companyId, primaryProvider: next.primary, fallbackProvider: next.fallback })
      .onConflictDoUpdate({ target: companyAiSettings.companyId,
        set: { primaryProvider: next.primary, fallbackProvider: next.fallback, updatedAt: new Date() } });
    await tx.delete(companyAiProviders).where(eq(companyAiProviders.companyId, companyId));
    if (next.providers.length) await tx.insert(companyAiProviders).values(next.providers.map(row => ({ ...row, companyId })));
    // The old endpoint cannot resurrect these after migration.
    await tx.update(companies).set({ groqApiKey: null, geminiApiKey: null }).where(eq(companies.id, companyId));
    return next;
  });
}
export async function removeAiProvider(companyId: string, provider: string, expectedRevision?: string): Promise<void> {
  await withTenant(companyId, async tx => {
    await tx.execute(sql`select id from companies where id = ${companyId} for update`);
    const current = await readAiSettings(tx, companyId);
    checkRevision(current, expectedRevision);
    // DELETE of an absent provider is a no-op, including legacy Groq-only
    // workspaces. Marking those migrated would suddenly require a Gemini key.
    if (!current.providers.some(row => row.provider === provider)) return;
    if (current.primary && (provider === current.primary || provider === "google")) {
      throw new ConflictError("Provider is still in use", {
        userMessage: "Pilih mode platform atau provider utama lain sebelum menghapus key yang sedang dipakai.",
      });
    }
    const next = current.providers.filter(row => row.provider !== provider);
    await tx.insert(companyAiSettings).values({ companyId, primaryProvider: current.primary, fallbackProvider: current.fallback === provider ? null : current.fallback })
      .onConflictDoUpdate({ target: companyAiSettings.companyId, set: { fallbackProvider: current.fallback === provider ? null : current.fallback, updatedAt: new Date() } });
    await tx.delete(companyAiProviders).where(eq(companyAiProviders.companyId, companyId));
    if (next.length) await tx.insert(companyAiProviders).values(next.map(row => ({ ...row, companyId })));
    await tx.update(companies).set({ groqApiKey: null, geminiApiKey: null }).where(eq(companies.id, companyId));
  });
}
