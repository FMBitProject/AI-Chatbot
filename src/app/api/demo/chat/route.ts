import { streamText } from "ai";
import { DEMO_MODEL, modelFor } from "@/lib/models";
import { consumeRateLimit, getClientIp } from "@/lib/rate-limit";
import { RAG_TEMPERATURE } from "@/lib/rag-prompt";
import { retrieveDemoChunks } from "@/lib/demo/retrieve";
import { DEMO_NOT_FOUND, DEMO_REFUSAL, demoSystemPrompt, isDemoQuestionAllowed, parseDemoBodyLang, parseDemoQuestion, readDemoBody, type DemoLang } from "@/lib/demo/policy";
import type { DemoFrame } from "@/lib/demo/shared";

export const runtime = "nodejs";
export const maxDuration = 60;

const headers = { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

// Error strings the browser shows verbatim, so they follow the reader's language
// like everything else on the page. Kept here rather than in the component: the
// component cannot know which of these the server picked, and an English page
// that fails in Indonesian is exactly the half-translated seam this change is
// fixing.
const ERRORS: Record<DemoLang, Record<"unavailable" | "badRequest" | "forbiddenOrigin" | "rateLimited", string>> = {
  id: {
    unavailable: "Demo sedang tidak tersedia. Silakan coba lagi atau hubungi kami melalui WhatsApp.",
    badRequest: "Kirim hanya pertanyaan, maksimal 300 karakter.",
    forbiddenOrigin: "Origin tidak diizinkan.",
    rateLimited: "Batas demo 10 pertanyaan per jam tercapai. Coba lagi nanti atau hubungi kami melalui WhatsApp.",
  },
  en: {
    unavailable: "The demo is unavailable right now. Please try again, or reach us on WhatsApp.",
    badRequest: "Send the question only, 300 characters at most.",
    forbiddenOrigin: "Origin not allowed.",
    rateLimited: "You have reached the demo limit of 10 questions per hour. Try again later, or reach us on WhatsApp.",
  },
};

const unavailable = (lang: DemoLang = "id") =>
  Response.json({ error: ERRORS[lang].unavailable }, { status: 503, headers: { "Cache-Control": "no-store" } });
function fixedAnswer(text: string) {
  return new Response([
    { type: "sources", citations: [] }, { type: "text", text }, { type: "done" },
  ].map((frame) => JSON.stringify(frame) + "\n").join(""), { headers });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  // Next's dev server can expose its bind address (0.0.0.0) in req.url.
  // Host is the browser's destination; unlike forwarded-host it is not a
  // caller-provided routing hint. Vercel validates destination hosts upstream.
  const destination = new URL(req.url);
  if (req.headers.get("host")) destination.host = req.headers.get("host")!;
  if (origin && origin !== destination.origin) return Response.json({ error: ERRORS.id.forbiddenOrigin }, { status: 403 });
  if (process.env.DEMO_CHAT_ENABLED === "false") return unavailable();
  // Read once: readDemoBody consumes the request stream, so the language and the
  // question have to come out of the same parse rather than two reads.
  const body = await readDemoBody(req);
  const lang = parseDemoBodyLang(body);
  const question = parseDemoQuestion(body);
  if (!question || new URL(req.url).search) return Response.json({ error: ERRORS[lang].badRequest }, { status: 400 });

  const requestId = crypto.randomUUID();
  const started = Date.now();
  // No raw IP, question, answer, session cookie, or document content in logs.
  const log = (event: string, fields: Record<string, string | number> = {}) =>
    console.info(JSON.stringify({ channel: "public_demo", event, requestId, ...fields }));
  try {
    const limit = await consumeRateLimit(`demo-chat:ip:${getClientIp(req)}`, { max: 10, windowMs: 3_600_000 });
    if (!limit.ok) {
      log("rate_limited");
      return Response.json({ error: ERRORS[lang].rateLimited }, {
        status: 429, headers: { "Retry-After": String(Math.max(1, limit.retryAfter)), "Cache-Control": "no-store" },
      });
    }
    log("question_sent");
    if (!isDemoQuestionAllowed(question)) { log("refused"); return fixedAnswer(DEMO_REFUSAL[lang]); }
    if (!process.env.GROQ_API_KEY || !process.env.GOOGLE_GENERATIVE_AI_API_KEY) return unavailable(lang);
    const configured = Number(process.env.DEMO_DAILY_LIMIT ?? 200);
    const dailyMax = Number.isInteger(configured) && configured > 0 && configured <= 10_000 ? configured : 200;
    const budget = await consumeRateLimit("demo-chat:global", { max: dailyMax, windowMs: 86_400_000 });
    if (!budget.ok) { log("budget_exhausted"); return unavailable(lang); }

    const chunks = await retrieveDemoChunks(question);
    if (!chunks.length) { log("not_found"); return fixedAnswer(DEMO_NOT_FOUND[lang]); }
    const citations = chunks.map(({ id, text, documentName }, index) => ({ id, text, documentName, number: index + 1 }));
    const controller = new AbortController();
    const signal = AbortSignal.any([req.signal, controller.signal, AbortSignal.timeout(25_000)]);
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(output) {
        const send = (frame: DemoFrame) => output.enqueue(encoder.encode(JSON.stringify(frame) + "\n"));
        try {
          send({ type: "sources", citations });
          let failed = false;
          let hasText = false;
          let answer = "";
          const result = streamText({
            model: modelFor(DEMO_MODEL, { groq: null, gemini: null }),
            system: demoSystemPrompt(JSON.stringify(citations.map((c, i) => ({ source: i + 1, document: c.documentName, excerpt: c.text }))), lang),
            prompt: question,
            temperature: RAG_TEMPERATURE,
            maxOutputTokens: 800,
            maxRetries: 0,
            abortSignal: signal,
            providerOptions: { groq: { reasoningEffort: "low", reasoningFormat: "hidden" } },
            onError: () => { failed = true; },
          });
          for await (const text of result.textStream) {
            if (signal.aborted) throw new Error("aborted");
            hasText ||= text.trim().length > 0;
            answer += text;
            send({ type: "text", text });
          }
          const usage = await result.usage;
          const finishReason = await result.finishReason;
          log("generation_usage", { model: DEMO_MODEL.id, inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0, elapsedMs: Date.now() - started, finishReason });
          if (failed || !hasText || finishReason !== "stop") throw new Error("incomplete");
          // Final cards show only sources the answer actually cites. Preserve
          // original numbers so an answer citing [3] never points at card [1].
          const cited = new Set([...answer.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1])));
          send({ type: "sources", citations: citations.filter((source) => cited.has(source.number)) });
          send({ type: "done" });
          log("answered");
        } catch {
          log("generation_failed", { elapsedMs: Date.now() - started });
          if (!signal.aborted) send({ type: "error", error: lang === "en" ? "The answer did not finish. Please try again." : "Jawaban belum selesai. Silakan coba lagi." });
        } finally {
          try { output.close(); } catch { /* Reader cancelled. */ }
        }
      },
      cancel() { controller.abort(); },
    });
    return new Response(stream, { headers });
  } catch {
    log("unavailable", { elapsedMs: Date.now() - started });
    return unavailable(lang);
  }
}
