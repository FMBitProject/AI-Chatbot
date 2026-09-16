"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { sendGAEvent } from "@next/third-parties/google";
import { ArrowUp, FileText, LoaderCircle, MessageSquare } from "lucide-react";
import { demoWhatsappUrl } from "@/lib/cta";
import { trackCta } from "@/lib/cta-analytics";
import { useLang } from "@/lib/language-context";
import { isAnalyticsOptedOut } from "@/lib/analytics-optout";
import { DEMO_MAX_QUESTION, DEMO_QUESTIONS, type DemoCitation, type DemoFrame } from "@/lib/demo/shared";

// Every string this section renders, in both languages.
//
// This block used to be Indonesian literals inlined in the JSX, which meant the
// language toggle moved the whole page except this one section — an English
// visitor read an English hero, English pricing, and then a wall of Indonesian.
//
// The demo corpus stays Indonesian on purpose (see DEMO_QUESTIONS): those are the
// documents a hospital here actually owns. What follows the toggle is the
// chrome, the sample questions and the answer itself; the citation excerpt stays
// in its original language, because showing a translated "source" would defeat
// the point of showing the source at all. `sourceNote` says so rather than
// leaving an English reader to wonder.
const CONTENT = {
  id: {
    eyebrow: "Coba langsung · Tanpa daftar",
    title: "Tanyakan prosedurnya. Lihat dokumen sumbernya.",
    subtitle: "Coba dengan 6 dokumen contoh. Pilih pertanyaan atau tulis sendiri—tidak perlu mengunggah dokumen RS Anda.",
    assistant: "Asisten RS Demo Sehat",
    assistantNote: "Contoh fiktif – RS Demo Sehat",
    greeting: "Halo! Saya membantu menemukan informasi dalam dokumen latihan. Mau mencari apa?",
    thinking: "Mencari di dokumen demo…",
    sourcesLabel: "Dokumen sumber",
    sourceNote: "Kutipan ditampilkan apa adanya dari dokumen aslinya.",
    inputLabel: "Pertanyaan tentang dokumen demo",
    inputPlaceholder: "Contoh: siapa yang memeriksa obat high alert?",
    sendLabel: "Kirim pertanyaan",
    charsSuffix: "karakter · Jangan masukkan data pasien atau informasi rahasia.",
    disclaimer: "Seluruh isi demo adalah fiktif untuk memperagakan produk, bukan panduan klinis atau saran medis.",
    statusBusy: "Sedang menyusun jawaban",
    statusDone: "Jawaban selesai diproses",
    statusReady: "Demo siap digunakan",
    genericError: "Demo sedang tidak tersedia.",
    unreachable: "Demo belum dapat dihubungi. Silakan coba lagi.",
    dropped: "Koneksi demo terputus. Silakan coba lagi.",
    truncated: "Jawaban terputus sebelum selesai. Silakan coba lagi.",
    ctaTitle: "Mau coba dengan SPO RS Anda sendiri?",
    ctaDesc: "Diskusikan kebutuhan RS Anda atau mulai buat workspace sendiri.",
    ctaWhatsapp: "Jadwalkan demo via WhatsApp",
    ctaRegister: "Daftar dan coba sendiri",
    // TODO: MINOR — tidak lagi dipakai sejak CTA demo memakai demoWhatsappUrl();
    // hapus setelah dipastikan tak ada surface lain yang memerlukannya.
    ctaWhatsappMessage: "Halo, saya sudah mencoba demo chat IntelliBase AI. Saya ingin demo dengan SPO RS kami sendiri.",
  },
  en: {
    eyebrow: "Try it now · No sign-up",
    title: "Ask about the procedure. See the source document.",
    subtitle: "Try it on 6 sample documents. Pick a question or write your own—no need to upload your hospital's documents.",
    assistant: "RS Demo Sehat Assistant",
    assistantNote: "Fictional sample – RS Demo Sehat",
    greeting: "Hello! I help find information inside the practice documents. What are you looking for?",
    thinking: "Searching the demo documents…",
    sourcesLabel: "Source documents",
    sourceNote: "Excerpts are shown exactly as they appear in the original Indonesian documents.",
    inputLabel: "A question about the demo documents",
    inputPlaceholder: "For example: who checks high alert medication?",
    sendLabel: "Send question",
    charsSuffix: "characters · Do not enter patient data or confidential information.",
    disclaimer: "Everything in this demo is fictional and exists to show the product. It is not clinical guidance or medical advice.",
    statusBusy: "Writing the answer",
    statusDone: "Answer complete",
    statusReady: "Demo ready",
    genericError: "The demo is unavailable right now.",
    unreachable: "Could not reach the demo. Please try again.",
    dropped: "The demo connection dropped. Please try again.",
    truncated: "The answer was cut off before it finished. Please try again.",
    ctaTitle: "Want to try it on your own hospital's SOPs?",
    ctaDesc: "Talk through what your hospital needs, or start your own workspace.",
    ctaWhatsapp: "Schedule a demo on WhatsApp",
    ctaRegister: "Sign up and try it yourself",
    ctaWhatsappMessage: "Hi, I have tried the IntelliBase AI demo chat. I would like a demo using our own hospital SOPs.",
  },
};

// TODO: MINOR — dua helper analitik hidup berdampingan. Setelah CTA demo pindah
// ke trackCta(), ini hanya melayani demo_opened dan demo_question_sent; leburkan
// agar cuma ada satu jalan melapor.
function event(name: string, fields: Record<string, string | number> = {}) {
  try {
    if (!isAnalyticsOptedOut() && localStorage.getItem("cookie-consent") === "accepted") {
      sendGAEvent("event", name, { location: "homepage_demo", ...fields });
    }
  } catch { /* Analytics must not interrupt chat or navigation. */ }
}

type Turn = { question: string; answer: string; citations: DemoCitation[]; error?: string };

export function DemoChat() {
  const { lang } = useLang();
  const T = CONTENT[lang];
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(0);
  const section = useRef<HTMLElement>(null);
  const pending = useRef<AbortController | null>(null);
  const opened = useRef(false);
  // The language is read inside ask() through a ref rather than closed over, so a
  // visitor who flips the toggle mid-request still gets the failure message in
  // the language they are now reading, and the next question is sent with the
  // language on screen rather than the one that was active when this component
  // last rendered the handler.
  // Synced in an effect, not assigned during render: writing a ref while
  // rendering is a React Compiler error, and it would also be wrong under
  // concurrent rendering, where a render can be thrown away.
  const langRef = useRef(lang);
  useEffect(() => { langRef.current = lang; }, [lang]);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !opened.current) {
        opened.current = true;
        event("demo_opened");
        observer.disconnect();
      }
    }, { threshold: 0.2 });
    if (section.current) observer.observe(section.current);
    return () => { observer.disconnect(); pending.current?.abort(); };
  }, []);

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > DEMO_MAX_QUESTION || pending.current) return;
    const strings = CONTENT[langRef.current];
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setQuestion("");
    setTurns((prev) => [...prev, { question: trimmed, answer: "", citations: [] }]);
    const update = (patch: Partial<Turn>) => setTurns((prev) => prev.map((turn, i) => i === prev.length - 1 ? { ...turn, ...patch } : turn));
    event("demo_question_sent", { question_number: sent + 1 });
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const res = await fetch("/api/demo/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        // `lang` only ever picks between strings the server already holds — it
        // reaches no query and no tenant. See DEMO_BODY_KEYS in demo/policy.ts.
        body: JSON.stringify({ question: trimmed, lang: langRef.current }), signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || strings.unreachable);
      }
      setSent((n) => n + 1);
      reader = res.body?.getReader();
      if (!reader) throw new Error(strings.dropped);
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";
      let complete = false;
      const processLine = (line: string) => {
        if (!line.trim()) return;
        const frame = JSON.parse(line) as DemoFrame;
        if (frame.type === "sources") update({ citations: frame.citations });
        if (frame.type === "text") { answer += frame.text; update({ answer }); }
        if (frame.type === "done") complete = true;
        if (frame.type === "error") throw new Error(frame.error);
      };
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        lines.forEach(processLine);
      }
      processLine(buffer + decoder.decode());
      if (!complete) throw new Error(strings.truncated);
    } catch (error) {
      if (!controller.signal.aborted) update({ answer: "", citations: [], error: error instanceof Error ? error.message : CONTENT[langRef.current].genericError });
    } finally {
      await reader?.cancel().catch(() => {});
      reader?.releaseLock();
      controller.abort();
      pending.current = null;
      setBusy(false);
    }
  }

  function submit(e: FormEvent) { e.preventDefault(); void ask(question); }

  return (
    <section ref={section} id="demo-chat" aria-labelledby="demo-title" className="border-t border-hairline bg-teal-50/50 px-4 py-14 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-3xl">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-teal-700">{T.eyebrow}</p>
        <h2 id="demo-title" className="text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">{T.title}</h2>
        <p className="mt-3 text-sm leading-relaxed text-stone-600">{T.subtitle}</p>
        <div className="mt-7 overflow-hidden rounded-2xl border border-teal-900/15 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-stone-100 px-4 py-4 sm:px-6">
            <span className="rounded-xl bg-teal-50 p-2 text-teal-700"><MessageSquare className="h-5 w-5" /></span>
            <div><p className="text-sm font-semibold text-stone-900">{T.assistant}</p><p className="text-xs text-stone-500">{T.assistantNote}</p></div>
          </div>
          <div className="space-y-5 p-4 sm:p-6">
            <p className="text-sm text-stone-600">{T.greeting}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {DEMO_QUESTIONS[lang].map((text) => <button key={text} type="button" disabled={busy} onClick={() => void ask(text)} className="rounded-xl border border-teal-800/15 px-3 py-3 text-left text-sm text-teal-900 transition hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-teal-700 disabled:opacity-50">{text}</button>)}
            </div>
            {turns.map((turn, i) => (
              <div key={i} className="space-y-3 border-t border-stone-100 pt-5">
                <p className="ml-auto w-fit max-w-[95%] break-words rounded-2xl rounded-br-sm bg-teal-700 px-4 py-3 text-sm text-white">{turn.question}</p>
                <div className="text-sm leading-relaxed text-stone-700" aria-busy={busy && i === turns.length - 1}>
                  {turn.error ? <p role="alert" className="text-rose-700">{turn.error}</p> : turn.answer ? <div className="break-words [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"><ReactMarkdown skipHtml allowedElements={["p", "strong", "em", "ul", "ol", "li"]} unwrapDisallowed>{turn.answer}</ReactMarkdown></div> : <p className="flex items-center gap-2 text-stone-500"><LoaderCircle className="h-4 w-4 animate-spin" />{T.thinking}</p>}
                </div>
                {turn.citations.length > 0 && <div className="grid gap-2" aria-label={T.sourcesLabel}>
                  {turn.citations.map((source, index) => <details key={source.id} className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                    <summary className="cursor-pointer text-xs font-medium leading-relaxed text-teal-900"><FileText className="mr-1 inline h-3.5 w-3.5" />[{source.number ?? index + 1}] {source.documentName}</summary>
                    <blockquote className="mt-3 whitespace-pre-wrap break-words border-l-2 border-teal-300 pl-3 text-xs leading-relaxed text-stone-600">{source.text}</blockquote>
                  </details>)}
                  {/* Only in English: an Indonesian reader needs no explanation
                      for an Indonesian excerpt, and the line would be noise. */}
                  {lang === "en" && <p className="text-xs text-stone-400">{T.sourceNote}</p>}
                </div>}
              </div>
            ))}
            <p role="status" className="sr-only">{busy ? T.statusBusy : turns.length ? T.statusDone : T.statusReady}</p>
            <form onSubmit={submit}>
              <label htmlFor="demo-question" className="mb-2 block text-sm font-medium text-stone-700">{T.inputLabel}</label>
              <div className="flex items-end gap-2 rounded-xl border border-stone-300 p-2 focus-within:border-teal-600">
                <textarea id="demo-question" rows={2} maxLength={DEMO_MAX_QUESTION} value={question} disabled={busy} onChange={(e) => setQuestion(e.target.value)} placeholder={T.inputPlaceholder} className="min-w-0 flex-1 resize-none bg-transparent p-1 text-base text-stone-900 outline-none placeholder:text-stone-400" aria-describedby="demo-input-note" />
                <button type="submit" aria-label={T.sendLabel} disabled={busy || !question.trim()} className="rounded-lg bg-teal-700 p-3 text-white hover:bg-teal-800 disabled:opacity-40">{busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <ArrowUp className="h-5 w-5" />}</button>
              </div>
              <p id="demo-input-note" className="mt-2 text-xs text-stone-500">{question.length}/{DEMO_MAX_QUESTION} {T.charsSuffix}</p>
            </form>
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-stone-500">{T.disclaimer}</p>
        {(sent >= 3 || turns.some((turn) => turn.error)) && <div className="mt-6 rounded-2xl bg-teal-900 p-5 text-white sm:p-6">
          <h3 className="text-lg font-semibold">{T.ctaTitle}</h3>
          <p className="mt-2 text-sm text-teal-100">{T.ctaDesc}</p>
          {/* Inside the CTA hierarchy, not beside it. These two were built
              before it and kept their own WhatsApp message and their own GA-only
              event name, which meant the highest-intent CTA on the page — from
              someone who has just used the product three times — reported under
              a different name, to one backend, with no placement in the message
              the person on WhatsApp reads. `questions_sent` rides along as an
              extra property so nothing is lost in the move. */}
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <a
              href={demoWhatsappUrl(lang, "demo")}
              onClick={() => trackCta("demo_whatsapp", "demo", { questions_sent: sent })}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-white px-4 py-3 text-center text-sm font-semibold text-teal-900"
            >
              {T.ctaWhatsapp}
            </a>
            <Link
              href="/register"
              onClick={() => trackCta("register", "demo", { questions_sent: sent })}
              className="rounded-lg border border-teal-300/50 px-4 py-3 text-center text-sm font-medium text-white"
            >
              {T.ctaRegister}
            </Link>
          </div>
        </div>}
      </div>
    </section>
  );
}
