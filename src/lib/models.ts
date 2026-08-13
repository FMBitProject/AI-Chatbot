import { generateText, type LanguageModel } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { groqClientForKey } from "@/lib/byok";
import { isRateLimitError } from "@/lib/embeddings";

/**
 * Which models answer questions, in what order, and what happens when one
 * refuses.
 *
 * This exists because the model id was a string literal in five files — the
 * chat stream, the public API, both Slack routes and the indexer — and only one
 * of them had a fallback. A provider 429 in the busy minute therefore killed the
 * API, both Slack entry points and document summaries while the chat UI carried
 * on, which read to the customer as "the AI is broken" from three directions at
 * once and fine from the fourth. Changing the model meant editing five files and
 * hoping none was missed.
 *
 * NOTE: this file is about GENERATION only. Embeddings deliberately stay on a
 * single model (`gemini-embedding-001`, see src/lib/embeddings.ts) and must
 * never be given a fallback chain. Vectors from two different embedding models
 * are not comparable: the arithmetic still works, cosine distance still returns
 * a number, and nothing throws — retrieval just quietly returns unrelated
 * chunks, and the answer becomes "not found in your documents" or, worse,
 * grounded in the wrong excerpt. Switching embedding models is a re-index of
 * every document, not a config change.
 */

export type ModelProvider = "groq" | "google";

export type ChainLink = {
  /** Provider-native model id, as it must be passed to the SDK. */
  readonly id: string;
  readonly provider: ModelProvider;
};

/**
 * The chain for anything with a person waiting at the end of it: chat, the
 * public API, both Slack routes.
 *
 * Ordered strongest first, and NOT a load balancer. The top model answers
 * whenever it can; the ones below exist for the minute it cannot. Spreading
 * traffic evenly would trade answer quality for quota that is not actually
 * scarce most of the time.
 *
 * Why three links, and why the third is a different provider:
 *
 * Groq meters each model separately — measured from its own response headers on
 * this account, llama-3.3-70b-versatile allows 12,000 tokens per minute and
 * openai/gpt-oss-20b 8,000, each with its own counter. So the first two links
 * are worth 20,000 TPM rather than 12,000. But they are one account and one
 * provider: when Groq itself is down, both fail together, and a second Groq
 * model protects against nothing.
 *
 * gemini-3.5-flash is a genuinely independent free-tier allowance AND the only
 * link that survives a Groq outage. Chosen over the alternatives after running
 * the grounding traps below against all of them; gemini-2.5-flash, the obvious
 * pick, is closed to new API keys and errors out.
 *
 * Every link here was tested with a context containing exactly one number
 * ("penurunan 1,0 mmol/L LDL menurunkan kejadian vaskuler mayor sebesar 22%")
 * against three questions: one whose answer is in the context, and two that
 * invite a plausible invented figure (a maximum daily dose, an LDL target).
 * A link must reproduce the 22% AND refuse both traps with the not-found
 * message. This bar is not ceremony — llama-3.1-8b-instant was in this chain
 * and was removed for failing the first half: it obeyed the grounding rules by
 * refusing everything, including the question the context plainly answered. A
 * false "your documents do not say" reads as authoritative and is worse than
 * the "service is busy" error it was there to avoid.
 *
 * gemini-3.5-flash-lite and gemini-3.1-flash-lite also passed all three and are
 * the substitutes to reach for if this one's free allowance turns out to be
 * tighter than the traffic needs.
 */
export const INTERACTIVE_CHAIN: readonly ChainLink[] = [
  { id: "llama-3.3-70b-versatile", provider: "groq" },
  { id: "openai/gpt-oss-20b", provider: "groq" },
  { id: "gemini-3.5-flash", provider: "google" },
];

/**
 * The chain for work a machine started and nobody is waiting on: currently the
 * auto-generated document summary in the indexer.
 *
 * Deliberately Groq-only, i.e. the interactive chain minus its third link, and
 * the omission is the whole point. A bulk import runs this hundreds of times in
 * a row; if it could climb to the Gemini rung it would drain a daily free-tier
 * allowance in minutes. The cost of that lands on someone else entirely — an
 * employee who asks a question that afternoon, hits a metered-out Groq, and
 * finds the rung that should have caught them already spent on bullet-point
 * summaries nobody was waiting for.
 *
 * The summary is optional by design (its caller keeps the document when this
 * fails), so it is the right thing to starve. It also carries the opening 2,000
 * characters of the document, which is a different exposure profile at import
 * scale than a single chat question.
 *
 * Raise this to INTERACTIVE_CHAIN only if the Gemini allowance is measured and
 * found to be sitting idle.
 */
export const BATCH_CHAIN: readonly ChainLink[] = INTERACTIVE_CHAIN.filter(
  (link) => link.provider === "groq",
);

/** Plaintext provider keys, as resolved by `resolveByok`. */
export type ProviderKeys = { groq: string | null; gemini: string | null };

/**
 * Generation-side Google client.
 *
 * Separate from the one in embeddings.ts on purpose: that one pins the v1beta
 * base URL for the embeddings endpoint and is shaped around a different API.
 * Same key resolution though — the company's own key when BYOK is configured,
 * the platform key otherwise, exactly as the embedding path already does for
 * the same company.
 */
function googleClientForKey(key: string | null) {
  return createGoogleGenerativeAI({
    apiKey: key || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  });
}

function keyFor(provider: ModelProvider, keys: ProviderKeys): string | null {
  return provider === "groq" ? keys.groq : keys.gemini;
}

/**
 * Whether a link can be attempted at all — own key or platform key present.
 *
 * Asymmetric between the two providers, and deliberately so.
 *
 * Groq may always fall back to the platform account: Groq states it does not
 * train on customer API data, so a company's traffic landing there is a billing
 * detail, not a disclosure one. That is also the behaviour every BYOK customer
 * has had since BYOK shipped.
 *
 * Google may not. Our platform Gemini account is on the free tier, whose terms
 * let Google use submitted content to improve their models. A company that
 * connected its own keys did so precisely to keep its documents out of that
 * account — the Terms promise them "all questions are processed through your
 * own provider accounts" — so a BYOK company without a Gemini key of its own
 * loses this rung rather than being quietly routed onto ours. Two Groq links is
 * a smaller loss than a broken promise.
 *
 * A company with no keys at all is not BYOK and keeps the full chain on the
 * platform accounts, which is what its own Terms describe.
 */
function isConfigured(link: ChainLink, keys: ProviderKeys): boolean {
  if (link.provider === "google") {
    const usesByok = !!(keys.groq || keys.gemini);
    return usesByok ? !!keys.gemini : !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  }
  return !!(keys.groq || process.env.GROQ_API_KEY);
}

/**
 * The chain with unusable links removed.
 *
 * A link whose provider has no key at all fails with an auth error, not a rate
 * limit, which stops the chain dead — so an unconfigured Gemini key would not
 * merely fail to help, it would swallow the real reason the first two links
 * refused and report a credentials problem instead. Dropping it up front keeps
 * the error the customer sees the true one.
 */
export function usableChain(chain: readonly ChainLink[], keys: ProviderKeys): readonly ChainLink[] {
  return chain.filter((link) => isConfigured(link, keys));
}

/** The SDK model handle for one link, on the right account. */
export function modelFor(link: ChainLink, keys: ProviderKeys): LanguageModel {
  const key = keyFor(link.provider, keys);
  return link.provider === "groq"
    ? groqClientForKey(key)(link.id)
    : googleClientForKey(key)(link.id);
}

/**
 * Whether a failure means "too fast, try again" rather than "this is broken".
 *
 * Only this answer justifies moving down the chain. A bad key or a malformed
 * request fails identically on every model, so retrying it just delays an error
 * that has to be shown to someone.
 *
 * Two providers phrase the same refusal differently, and getting either wrong
 * silently disables the fallback it guards:
 *   - Google puts the status on the error object and says RESOURCE_EXHAUSTED in
 *     the prose — `isRateLimitError` (shared with the embedding retry loop,
 *     where this exact mistake was found and fixed) covers both shapes.
 *   - Groq's TPM refusal is "Request too large for model … tokens per minute
 *     (TPM): Limit 12000, Requested 12232", which contains neither the digits
 *     429 nor the words "rate limit". It has to be matched on its own wording,
 *     and the status code is no help either: measured against the live API, it
 *     arrives as **413**, not 429, so a status-only test misses the single most
 *     common reason this product ever needs to fall back.
 */
export function isRateLimitFailure(err: unknown): boolean {
  if (isRateLimitError(err)) return true;
  const message = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  return message.includes("tokens per minute") || message.includes("request too large");
}

/**
 * The failure, in the two codes the clients already know how to render.
 *
 * AI_RATE_LIMIT tells the reader to wait a moment and try again, which is true
 * and actionable; AI_ERROR tells them something broke, which for an over-long
 * request is neither. `provider` is reported from the link that actually failed
 * rather than assumed to be Groq, so an admin sent to check a status page is
 * sent to the right one.
 */
export function describeAiFailure(err: unknown, provider: ModelProvider = "groq"): { error: string; provider: string } {
  return { error: isRateLimitFailure(err) ? "AI_RATE_LIMIT" : "AI_ERROR", provider };
}

export type FallbackOptions = {
  keys: ProviderKeys;
  system?: string;
  prompt: string;
  temperature?: number;
  /** Per-attempt deadline. Applies to each link, not to the chain as a whole. */
  timeout?: number;
  chain?: readonly ChainLink[];
  /** Prefixes the fallback log line, so it is obvious which channel fell back. */
  label: string;
};

/**
 * Run a non-streaming generation down the chain.
 *
 * For the four callers that await a whole answer. The streaming chat route
 * cannot use this and keeps its own loop, for a reason that does not apply
 * here: once a token has reached the browser, a second model would continue a
 * sentence it never started, so streaming has to weigh "did anything get sent"
 * as well as "did it fail". A caller awaiting a complete string has no such
 * half-delivered state — nothing was shown, so anything may be retried.
 *
 * Throws the last error unchanged when every link fails. Callers already
 * classify what they catch (the indexer decides whether to requeue the
 * document), and rewrapping it here would break that.
 */
export async function generateWithFallback(
  options: FallbackOptions,
): Promise<{ text: string; model: ChainLink }> {
  const { keys, chain = INTERACTIVE_CHAIN, label, ...rest } = options;
  const links = usableChain(chain, keys);

  if (links.length === 0) {
    throw new Error("No generation provider is configured — set GROQ_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY.");
  }

  let lastError: unknown;
  for (const [attempt, link] of links.entries()) {
    try {
      const { text } = await generateText({ model: modelFor(link, keys), ...rest });
      // An empty answer is not a success — returning it would hand the caller a
      // blank string it has no way to distinguish from a real answer, and Slack
      // would post it into a channel.
      //
      // This ENDS the chain rather than continuing down it, which is the same
      // rule the streaming loop in /api/chat follows: a generation that came
      // back clean and empty was not rate limited, and nothing about the next
      // model makes an empty completion more likely to have been a quota
      // problem. Spending another provider's allowance on that guess is the
      // wrong trade. It surfaces to the caller as a normal failure.
      if (!text.trim()) throw new Error(`${link.id} returned an empty response`);
      if (attempt > 0) console.log(`[${label}] answered by fallback model ${link.id}`);
      return { text, model: link };
    } catch (err) {
      lastError = err;
      const canFallBack = attempt < links.length - 1 && isRateLimitFailure(err);
      console.error(`[${label}] ${link.id} failed${canFallBack ? ", falling back" : ""}:`, err);
      if (!canFallBack) throw err;
    }
  }

  throw lastError;
}
