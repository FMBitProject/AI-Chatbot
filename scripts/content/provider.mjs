// Which LLM writes the content pack.
//
// Defaults to Gemini's free tier: this script only ever sees our own marketing
// copy — never customer documents — so the free-tier data-use tradeoff that
// forced a disclosure in the Terms simply doesn't apply here, and the run costs
// nothing. Swap to Claude via CONTENT_PROVIDER if the copy reads flat; the
// prompt, schema and lint are identical either way.
//
// Uses the Vercel AI SDK rather than a vendor SDK so the swap is one env var,
// and because that is already how this repo talks to Gemini (see
// scripts/backfill-rag.mjs).

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";

export const PROVIDERS = {
  google: {
    envKey: "GOOGLE_GENERATIVE_AI_API_KEY",
    // Free tier is Flash-only — Pro moved to paid in April 2026. Verified
    // present on our key 2026-08-04; overridable because Google retires and
    // renames these faster than we'll touch this file (`content:models` lists them).
    defaultModel: "gemini-3.6-flash",
    keyUrl: "https://aistudio.google.com/apikey",
    create: (apiKey, model) => createGoogleGenerativeAI({ apiKey })(model),
  },
  anthropic: {
    envKey: "ANTHROPIC_API_KEY",
    defaultModel: "claude-opus-5",
    keyUrl: "https://console.anthropic.com/settings/keys",
    create: (apiKey, model) => createAnthropic({ apiKey })(model),
  },
};

/**
 * Resolves the configured provider into a model instance, or exits with an
 * actionable message. `readEnv` is injected so this works with the repo's
 * .env.local fallback without importing it here.
 */
export function resolveModel(readEnv) {
  const name = readEnv("CONTENT_PROVIDER") || "google";
  const provider = PROVIDERS[name];
  if (!provider) {
    console.error(`CONTENT_PROVIDER="${name}" tidak dikenal. Pilihan: ${Object.keys(PROVIDERS).join(", ")}`);
    process.exit(2);
  }

  const apiKey = readEnv(provider.envKey);
  if (!apiKey) {
    console.error(`${provider.envKey} tidak diset (cek .env.local).`);
    console.error(`Ambil di: ${provider.keyUrl}`);
    if (name !== "google") console.error(`Atau pakai Gemini gratis: hapus CONTENT_PROVIDER dari .env.local.`);
    process.exit(2);
  }

  const modelId = readEnv("CONTENT_MODEL") || provider.defaultModel;
  return { model: provider.create(apiKey, modelId), providerName: name, modelId };
}

/**
 * Lists the models the configured Google key can actually reach.
 * Model IDs churn often enough that guessing one and getting a 404 is the most
 * likely first-run failure; this turns that into a two-second lookup.
 */
export async function listGoogleModels(apiKey) {
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
    headers: { "x-goog-api-key": apiKey },
  });
  if (!res.ok) throw new Error(`Google API HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const { models = [] } = await res.json();
  return models
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""))
    .filter((id) => !/embedding|aqa|imagen|veo|tts/i.test(id))
    .sort();
}
