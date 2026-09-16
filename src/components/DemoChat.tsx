"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { sendGAEvent } from "@next/third-parties/google";
import { ArrowUp, FileText, LoaderCircle, MessageSquare } from "lucide-react";
import { whatsappUrl } from "@/lib/contact";
import { isAnalyticsOptedOut } from "@/lib/analytics-optout";
import { DEMO_MAX_QUESTION, DEMO_QUESTIONS, type DemoCitation, type DemoFrame } from "@/lib/demo/shared";

function event(name: string, fields: Record<string, string | number> = {}) {
  try {
    if (!isAnalyticsOptedOut() && localStorage.getItem("cookie-consent") === "accepted") {
      sendGAEvent("event", name, { location: "homepage_demo", ...fields });
    }
  } catch { /* Analytics must not interrupt chat or navigation. */ }
}

type Turn = { question: string; answer: string; citations: DemoCitation[]; error?: string };

export function DemoChat() {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(0);
  const section = useRef<HTMLElement>(null);
  const pending = useRef<AbortController | null>(null);
  const opened = useRef(false);

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
        body: JSON.stringify({ question: trimmed }), signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Demo belum dapat dihubungi. Silakan coba lagi.");
      }
      setSent((n) => n + 1);
      reader = res.body?.getReader();
      if (!reader) throw new Error("Koneksi demo terputus. Silakan coba lagi.");
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
      if (!complete) throw new Error("Jawaban terputus sebelum selesai. Silakan coba lagi.");
    } catch (error) {
      if (!controller.signal.aborted) update({ answer: "", citations: [], error: error instanceof Error ? error.message : "Demo sedang tidak tersedia." });
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
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-teal-700">Coba langsung · Tanpa daftar</p>
        <h2 id="demo-title" className="text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">Tanyakan prosedurnya. Lihat dokumen sumbernya.</h2>
        <p className="mt-3 text-sm leading-relaxed text-stone-600">Coba dengan 6 dokumen contoh. Pilih pertanyaan atau tulis sendiri—tidak perlu mengunggah dokumen RS Anda.</p>
        <div className="mt-7 overflow-hidden rounded-2xl border border-teal-900/15 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-stone-100 px-4 py-4 sm:px-6">
            <span className="rounded-xl bg-teal-50 p-2 text-teal-700"><MessageSquare className="h-5 w-5" /></span>
            <div><p className="text-sm font-semibold text-stone-900">Asisten RS Demo Sehat</p><p className="text-xs text-stone-500">Contoh fiktif – RS Demo Sehat</p></div>
          </div>
          <div className="space-y-5 p-4 sm:p-6">
            <p className="text-sm text-stone-600">Halo! Saya membantu menemukan informasi dalam dokumen latihan. Mau mencari apa?</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {DEMO_QUESTIONS.map((text) => <button key={text} type="button" disabled={busy} onClick={() => void ask(text)} className="rounded-xl border border-teal-800/15 px-3 py-3 text-left text-sm text-teal-900 transition hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-teal-700 disabled:opacity-50">{text}</button>)}
            </div>
            {turns.map((turn, i) => (
              <div key={i} className="space-y-3 border-t border-stone-100 pt-5">
                <p className="ml-auto w-fit max-w-[95%] break-words rounded-2xl rounded-br-sm bg-teal-700 px-4 py-3 text-sm text-white">{turn.question}</p>
                <div className="text-sm leading-relaxed text-stone-700" aria-busy={busy && i === turns.length - 1}>
                  {turn.error ? <p role="alert" className="text-rose-700">{turn.error}</p> : turn.answer ? <div className="break-words [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"><ReactMarkdown skipHtml allowedElements={["p", "strong", "em", "ul", "ol", "li"]} unwrapDisallowed>{turn.answer}</ReactMarkdown></div> : <p className="flex items-center gap-2 text-stone-500"><LoaderCircle className="h-4 w-4 animate-spin" />Mencari di dokumen demo…</p>}
                </div>
                {turn.citations.length > 0 && <div className="grid gap-2" aria-label="Dokumen sumber">
                  {turn.citations.map((source, index) => <details key={source.id} className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                    <summary className="cursor-pointer text-xs font-medium leading-relaxed text-teal-900"><FileText className="mr-1 inline h-3.5 w-3.5" />[{source.number ?? index + 1}] {source.documentName}</summary>
                    <blockquote className="mt-3 whitespace-pre-wrap break-words border-l-2 border-teal-300 pl-3 text-xs leading-relaxed text-stone-600">{source.text}</blockquote>
                  </details>)}
                </div>}
              </div>
            ))}
            <p role="status" className="sr-only">{busy ? "Sedang menyusun jawaban" : turns.length ? "Jawaban selesai diproses" : "Demo siap digunakan"}</p>
            <form onSubmit={submit}>
              <label htmlFor="demo-question" className="mb-2 block text-sm font-medium text-stone-700">Pertanyaan tentang dokumen demo</label>
              <div className="flex items-end gap-2 rounded-xl border border-stone-300 p-2 focus-within:border-teal-600">
                <textarea id="demo-question" rows={2} maxLength={DEMO_MAX_QUESTION} value={question} disabled={busy} onChange={(e) => setQuestion(e.target.value)} placeholder="Contoh: siapa yang memeriksa obat high alert?" className="min-w-0 flex-1 resize-none bg-transparent p-1 text-base text-stone-900 outline-none placeholder:text-stone-400" aria-describedby="demo-input-note" />
                <button type="submit" aria-label="Kirim pertanyaan" disabled={busy || !question.trim()} className="rounded-lg bg-teal-700 p-3 text-white hover:bg-teal-800 disabled:opacity-40">{busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <ArrowUp className="h-5 w-5" />}</button>
              </div>
              <p id="demo-input-note" className="mt-2 text-xs text-stone-500">{question.length}/{DEMO_MAX_QUESTION} karakter · Jangan masukkan data pasien atau informasi rahasia.</p>
            </form>
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-stone-500">Seluruh isi demo adalah fiktif untuk memperagakan produk, bukan panduan klinis atau saran medis.</p>
        {(sent >= 3 || turns.some((turn) => turn.error)) && <div className="mt-6 rounded-2xl bg-teal-900 p-5 text-white sm:p-6">
          <h3 className="text-lg font-semibold">Mau coba dengan SPO RS Anda sendiri?</h3>
          <p className="mt-2 text-sm text-teal-100">Diskusikan kebutuhan RS Anda atau mulai buat workspace sendiri.</p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <a href={whatsappUrl("Halo, saya sudah mencoba demo chat IntelliBase AI. Saya ingin demo dengan SPO RS kami sendiri.")} onClick={() => event("demo_cta_clicked", { target: "whatsapp", questions_sent: sent })} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-white px-4 py-3 text-center text-sm font-semibold text-teal-900">Jadwalkan demo via WhatsApp</a>
            <Link href="/register" onClick={() => event("demo_cta_clicked", { target: "register", questions_sent: sent })} className="rounded-lg border border-teal-300/50 px-4 py-3 text-center text-sm font-medium text-white">Daftar dan coba sendiri</Link>
          </div>
        </div>}
      </div>
    </section>
  );
}
