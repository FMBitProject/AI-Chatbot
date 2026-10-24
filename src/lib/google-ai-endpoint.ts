// Where Gemini API calls go, for both the embedding client (embeddings.ts) and
// the generation client (models.ts).
//
// Google refuses some hosts outright — "User location is not supported for the
// API use." — judging location from the caller's IP. The self-hosted VPS is one
// of them, though it sits in Jakarta, and that refusal takes out indexing and
// document search, not just a fallback model. The fix is a relay (a Cloudflare
// Worker, see docs/self-hosting.md) that forwards requests unchanged from an
// address Google accepts.
//
// Both variables unset — as on Vercel — means calling Google directly, exactly
// as before this file existed.
//
//   GOOGLE_AI_BASE_URL   relay origin plus API version, e.g.
//                        https://google-relay.example.workers.dev/v1beta
//   GOOGLE_AI_RELAY_KEY  sent as x-relay-key; the relay refuses requests
//                        without it, so it is not an open proxy
//
// Every Gemini key, the platform's and each BYOK customer's, passes through the
// relay, so it must be one we operate and it must not log request headers.

const GOOGLE_DIRECT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export function googleAiEndpoint(): { baseURL: string; headers?: Record<string, string> } {
  const baseURL = process.env.GOOGLE_AI_BASE_URL?.trim().replace(/\/+$/, "") || GOOGLE_DIRECT_BASE_URL;
  const relayKey = process.env.GOOGLE_AI_RELAY_KEY?.trim();
  return relayKey ? { baseURL, headers: { "x-relay-key": relayKey } } : { baseURL };
}
