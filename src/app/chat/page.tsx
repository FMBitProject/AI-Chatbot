"use client";
import { useState, useRef, useEffect } from "react";
import { ChatSidebar, type ChatSession } from "@/components/chat/ChatSidebar";
import { ChatMessages, type Message, type Citation } from "@/components/chat/ChatMessages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/toaster";
import { toast } from "@/components/ui/use-toast";
import { readApiError } from "@/lib/errors";
import { Send, Download, Menu } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { SUPPORT_EMAIL } from "@/lib/contact";
import { cn } from "@/lib/utils";

type ResponseLang = "auto" | "id" | "en";

function getStoredResponseLang(): ResponseLang {
  if (typeof window === "undefined") return "auto";
  const saved = localStorage.getItem("responseLang") as ResponseLang | null;
  return (saved === "auto" || saved === "id" || saved === "en") ? saved : "auto";
}

export default function ChatPage() {
  const { data: session } = authClient.useSession();
  const user = session?.user as { name?: string; email?: string; role?: string } | undefined;

  const [dbSessions, setDbSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [responseLang, setResponseLang] = useState<ResponseLang>(getStoredResponseLang);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Folders exist on individual accounts only, and the empty list is what hides
  // the control: an individual who has not filed anything sees no picker, which
  // is the same as having nothing to narrow. See /api/folders — it returns an
  // empty list for company accounts on purpose.
  const [folders, setFolders] = useState<string[]>([]);
  // Only the wording depends on this — an individual has no company policies to
  // ask about and no supervisor to check an answer against, and being told to
  // consult one is the kind of detail that tells a paying customer the tier they
  // bought is a relabelled company product.
  //
  // Not derived from `folders` even though that list is empty for company
  // accounts: it is also empty for an individual who has not filed anything yet,
  // so it answers "are there folders", never "who is this". Defaults to the
  // company wording, which is what everyone saw before this and is the safe
  // answer while the request is still in flight.
  const [isIndividual, setIsIndividual] = useState(false);
  // "" is every folder. Held in a ref as well because handleSubmit reads it
  // inside an async flow, exactly like responseLang: the state is for rendering,
  // the ref is what the request is built from.
  const [activeFolder, setActiveFolder] = useState("");
  const activeFolderRef = useRef("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const responseLangRef = useRef<ResponseLang>(getStoredResponseLang());
  // Temporary client id -> the server id that replaced it when the stream ended.
  //
  // An assistant message is rendered under a locally generated id and only takes
  // the server's id once the stream finishes (see the setMessages below the read
  // loop). The rating buttons appear as soon as there is text, so a rating sent
  // mid-stream is sent under the temporary id and, by the time it comes back,
  // the row it belongs to is under a different one. Without this map the revert
  // in handleFeedback matches nothing: the toast says the rating was not saved
  // while the thumb stays filled, which is the exact failure that fix existed to
  // remove. Cleared whenever the transcript is, so it cannot grow unbounded.
  const messageIdAliasRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/folders")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { folders?: string[] } | null) => {
        if (!cancelled && Array.isArray(data?.folders)) setFolders(data.folders);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Failures are swallowed on purpose: this decides two sentences of copy, and
    // a chat that refuses to render because a label lookup timed out would be a
    // far worse trade than a company-worded placeholder.
    fetch("/api/user/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { accountType?: string } | null) => {
        if (!cancelled && data?.accountType === "individual") setIsIndividual(true);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  function handleSetLang(lang: ResponseLang) {
    setResponseLang(lang);
    responseLangRef.current = lang;
    localStorage.setItem("responseLang", lang);
  }

  async function loadSessions() {
    try {
      const res = await fetch("/api/chat/sessions");
      if (!res.ok) return;
      const data = await res.json() as { id: string; title: string; createdAt: string }[];
      setDbSessions(data.map((s) => ({ id: s.id, title: s.title, createdAt: s.createdAt })));
    } catch {}
  }

  async function loadMessages(sessionId: string) {
    setIsHistoryLoading(true);
    try {
      const res = await fetch(`/api/chat/sessions/${sessionId}/messages`);
      if (!res.ok) { setIsHistoryLoading(false); return; }
      const data = await res.json() as { id: string; role: string; content: string; citationsJson?: string; feedback?: string }[];
      if (data.length === 0) {
        setActiveSessionId(null);
        setMessages([]);
        setDbSessions((prev) => prev.filter((s) => s.id !== sessionId));
        return;
      }
      setMessages(data.map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        citations: m.citationsJson ? JSON.parse(m.citationsJson) as Citation[] : undefined,
        feedback: m.feedback as "up" | "down" | undefined,
      })));
    } catch {}
    finally { setIsHistoryLoading(false); }
  }

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg: Message = { id: Date.now().toString(), role: "user", content: input };
    setInput("");
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;
    const assistantMsgId = (Date.now() + 1).toString();
    setSuggestions([]);
    setMessages((prev) => [...prev, { id: assistantMsgId, role: "assistant", content: "" }]);

    try {
      const apiMessages = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          sessionId: activeSessionId,
          responseLang: responseLangRef.current,
          // Omitted rather than sent empty when no folder is chosen: the server
          // treats a blank string as no filter anyway, and leaving the key out
          // keeps "search everything" the absence of a restriction instead of a
          // value that has to be interpreted as one.
          ...(activeFolderRef.current ? { folder: activeFolderRef.current } : {}),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const langCode = responseLangRef.current;
        if (res.status === 429) {
          const data = await res.json().catch(() => ({ limit: 0, period: "daily" })) as { error: string; limit: number; period: "daily" | "monthly" | "daily-user" };
          const quotaMsg = langCode === "en"
            ? data.period === "daily-user"
              ? `🚫 **Your personal daily limit is reached** (${data.limit} questions/day per person).\n\nThis keeps the company quota fair for your teammates — they can still ask questions. Your personal quota resets tomorrow.`
              : data.period === "daily"
              ? `🚫 **Daily chat limit reached** (${data.limit} questions/day).\n\nYour quota resets tomorrow. Contact the developer to upgrade your plan.\n\n📧 Contact: ${SUPPORT_EMAIL}`
              : `🚫 **Monthly chat quota reached** (${data.limit} questions/month).\n\nYour quota resets next month. Contact the developer to upgrade your plan.\n\n📧 Contact: ${SUPPORT_EMAIL}`
            : data.period === "daily-user"
              ? `🚫 **Batas harian pribadi Anda tercapai** (${data.limit} pertanyaan/hari per orang).\n\nBatas ini menjaga kuota perusahaan tetap adil — rekan tim Anda masih bisa bertanya. Kuota pribadi Anda reset besok.`
              : data.period === "daily"
              ? `🚫 **Batas chat harian tercapai** (${data.limit} pertanyaan/hari).\n\nKuota Anda akan reset besok. Hubungi developer untuk upgrade paket.\n\n📧 Kontak: ${SUPPORT_EMAIL}`
              : `🚫 **Kuota chat bulanan telah habis** (${data.limit} pertanyaan/bulan).\n\nKuota Anda akan reset bulan depan. Hubungi developer untuk upgrade paket.\n\n📧 Kontak: ${SUPPORT_EMAIL}`;
          setMessages((prev) => prev.map((m) => m.id === assistantMsgId ? { ...m, content: quotaMsg } : m));
          return;
        }
        if (res.status === 403) {
          const data = await res.json().catch(() => ({ error: "" })) as { error?: string };
          // A plan boundary, not a fault. It is written as an offer — search is
          // open, and the link goes straight there — because someone on the free
          // tier meeting this message is the person most likely to be deciding
          // whether the product is worth paying for.
          if (data.error === "AI_REQUIRES_PAID_PLAN") {
            const upgradeMsg = langCode === "en"
              ? `🔒 **AI answers are part of the paid plans.**\n\nOn the free plan you can still **search your documents** and read the matching passages with their sources.\n\n[Search documents](/search) · [See plans](/pricing)`
              : `🔒 **Jawaban AI tersedia mulai paket berbayar.**\n\nDi paket gratis Anda tetap bisa **mencari dokumen** dan membaca bagian yang cocok beserta sumbernya.\n\n[Cari dokumen](/search) · [Lihat paket](/pricing)`;
            setMessages((prev) => prev.map((m) => m.id === assistantMsgId ? { ...m, content: upgradeMsg } : m));
            return;
          }
          if (data.error === "SEAT_FROZEN") {
            const seatMsg = langCode === "en"
              ? `🔒 **Your account is currently inactive.**\n\nThe number of employees exceeds your company plan's limit. Ask your admin to renew the subscription to reactivate your account.\n\n📧 Contact: ${SUPPORT_EMAIL}`
              : `🔒 **Akun Anda sedang tidak aktif.**\n\nJumlah karyawan melebihi batas paket perusahaan. Minta admin memperpanjang langganan agar akun Anda aktif kembali.\n\n📧 Kontak: ${SUPPORT_EMAIL}`;
            setMessages((prev) => prev.map((m) => m.id === assistantMsgId ? { ...m, content: seatMsg } : m));
            return;
          }
        }
        if (res.status === 503) {
          const data = await res.json().catch(() => ({ error: "AI_ERROR" })) as { error: string; provider: string };
          const isRateLimit = data.error === "AI_RATE_LIMIT";
          const errMsg = langCode === "en"
            ? isRateLimit
              ? `⚠️ **AI service is currently busy** (rate limit reached).\n\nPlease wait a few minutes and try again. If this keeps happening, contact the developer.\n\n📧 Contact: ${SUPPORT_EMAIL}`
              : `⚠️ **AI service is temporarily unavailable.**\n\nPlease try again in a moment. If the problem persists, contact the developer.\n\n📧 Contact: ${SUPPORT_EMAIL}`
            : isRateLimit
              ? `⚠️ **Layanan AI sedang sibuk** (rate limit tercapai).\n\nTunggu beberapa menit lalu coba lagi. Jika terus terjadi, hubungi developer.\n\n📧 Kontak: ${SUPPORT_EMAIL}`
              : `⚠️ **Layanan AI sedang tidak tersedia.**\n\nSilakan coba lagi sebentar. Jika masalah berlanjut, hubungi developer.\n\n📧 Kontak: ${SUPPORT_EMAIL}`;
          setMessages((prev) => prev.map((m) => m.id === assistantMsgId ? { ...m, content: errMsg } : m));
          return;
        }
        throw new Error("Chat API error");
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let citations: Citation[] = [];
      let realMsgId = assistantMsgId;
      let newSessionId: string | null = null;
      let fullContent = "";

      // Whatever arrived after the last newline: the beginning of a frame whose
      // rest is still in flight.
      //
      // This used to be missing, and the frames it lost were invisible. Each
      // read() was decoded and split on "\n" on its own, so any frame straddling
      // a chunk boundary was destroyed twice over — the first half failed
      // JSON.parse and was swallowed by the catch, the second half did not start
      // with a known prefix and was skipped. Nothing logged it and nothing
      // looked broken.
      //
      // The citations frame is the one that pays for it: it carries the full
      // text of every retrieved excerpt and measures around 40 KB, which no
      // network hands over in a single chunk with any reliability. That is why
      // sources appeared under the first answer in a conversation and then
      // stopped appearing under the ones after it — nothing about the later
      // questions was different, only where the chunk boundaries happened to
      // fall. The answer text is at risk in exactly the same way; it survived
      // more often only because each of its frames is a few bytes.
      let buffer = "";
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        streamDone = done;
        // decode() with no argument on the final pass flushes any multi-byte
        // character left half-decoded across the boundary.
        buffer += value ? decoder.decode(value, { stream: true }) : (done ? decoder.decode() : "");
        const lines = buffer.split("\n");
        // Mid-stream the tail is held back: it is either empty (the chunk ended
        // on a newline) or a partial frame the next read completes. On the last
        // pass nothing more is coming, so whatever is there is processed rather
        // than discarded — the server terminates every frame with a newline, so
        // this only matters if one is ever written without.
        buffer = streamDone ? "" : (lines.pop() ?? "");
        for (const line of lines) {
          if (line.startsWith("0:")) {
            try {
              const text = JSON.parse(line.slice(2)) as string;
              fullContent += text;
              setMessages((prev) => prev.map((m) => m.id === assistantMsgId ? { ...m, content: fullContent } : m));
            } catch {}
          } else if (line.startsWith("1:")) {
            try {
              const { error, provider } = JSON.parse(line.slice(2)) as { error: string; provider: string };
              const langCode = responseLangRef.current;
              const isRateLimit = error === "AI_RATE_LIMIT";
              const errMsg = langCode === "en"
                ? isRateLimit
                  ? `⚠️ **AI service is currently busy** (${provider} rate limit).\n\nPlease wait a few minutes and try again. If this keeps happening, contact the developer.\n\n📧 Contact: ${SUPPORT_EMAIL}`
                  : `⚠️ **AI service encountered an error** (${provider}).\n\nPlease try again. If the problem persists, contact the developer.\n\n📧 Contact: ${SUPPORT_EMAIL}`
                : isRateLimit
                  ? `⚠️ **Layanan AI sedang sibuk** (${provider} rate limit).\n\nTunggu beberapa menit lalu coba lagi. Jika terus terjadi, hubungi developer.\n\n📧 Kontak: ${SUPPORT_EMAIL}`
                  : `⚠️ **Layanan AI mengalami gangguan** (${provider}).\n\nSilakan coba lagi. Jika masalah berlanjut, hubungi developer.\n\n📧 Kontak: ${SUPPORT_EMAIL}`;
              setMessages((prev) => prev.map((m) => m.id === assistantMsgId ? { ...m, content: errMsg } : m));
            } catch {}
          } else if (line.startsWith("2:")) {
            try {
              const meta = JSON.parse(line.slice(2)) as { citations: Citation[]; messageId: string; sessionId: string };
              citations = meta.citations;
              realMsgId = meta.messageId;
              newSessionId = meta.sessionId;
            } catch {}
          } else if (line.startsWith("3:")) {
            try {
              const s = JSON.parse(line.slice(2)) as string[];
              setSuggestions(s);
            } catch {}
          }
        }
      }

      // Recorded before the swap, so a rating already in flight under the
      // temporary id can still find its row afterwards.
      if (realMsgId !== assistantMsgId) messageIdAliasRef.current.set(assistantMsgId, realMsgId);
      setMessages((prev) => prev.map((m) => m.id === assistantMsgId ? { ...m, id: realMsgId, citations } : m));
      if (newSessionId && !activeSessionId) {
        setActiveSessionId(newSessionId);
        await loadSessions();
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setMessages((prev) => prev.map((m) => m.id === assistantMsgId
          ? { ...m, content: "Maaf, terjadi kesalahan. Silakan coba lagi." } : m));
      }
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }

  function handleSuggestionClick(q: string) {
    setInput(q);
    setSuggestions([]);
  }

  // Optimistic, then reverted if the server disagrees.
  //
  // This used to be neither: the fetch was fire-and-forget with no `res.ok`
  // check and no catch, and the thumb turned blue whatever happened. That is
  // the worst shape a failure can take here, because it corrupts the one
  // signal we have about answer quality *and* hides that it did. Nobody
  // reports a button that looks like it worked, so the numbers in the Audit tab
  // would quietly stop counting with no way to tell how many were lost.
  //
  // A 404 is not hypothetical either: /api/chat/feedback answers one when the
  // message row is not in the database, and the assistant row is only inserted
  // after the stream finishes — so rating an answer while it is still being
  // written is a legitimate way to get one, as is rating an answer whose insert
  // failed (which /api/chat swallows on purpose to protect the response).
  async function handleFeedback(messageId: string, feedback: "up" | "down") {
    // Captured before the optimistic write so the revert restores what was
    // actually there, rather than clearing a rating the user had set earlier.
    const previous = messages.find((m) => m.id === messageId)?.feedback;
    setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, feedback } : m));

    // The row may be renamed while this request is in flight — see
    // messageIdAliasRef. Resolved at revert time rather than now, because the
    // rename happens *during* the await.
    const revert = () =>
      setMessages((prev) => {
        const current = messageIdAliasRef.current.get(messageId) ?? messageId;
        return prev.map((m) => (m.id === current ? { ...m, feedback: previous } : m));
      });

    try {
      const res = await fetch("/api/chat/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, feedback }),
      });
      if (res.ok) return;

      const { code, message } = await readApiError(res, responseLangRef.current === "en" ? "en" : "id");
      revert();
      toast({
        variant: "destructive",
        title: responseLangRef.current === "en" ? "Rating not saved." : "Penilaian tidak tersimpan.",
        // A 404 here means "this answer is not stored yet", which is a wait, not
        // a fault — worth saying plainly instead of the generic "not found".
        description: code === "NOT_FOUND"
          ? (responseLangRef.current === "en"
            ? "This answer is still being saved. Try again in a moment."
            : "Jawaban ini masih disimpan. Coba lagi sebentar lagi.")
          : message,
      });
    } catch {
      revert();
      toast({
        variant: "destructive",
        title: responseLangRef.current === "en" ? "Rating not saved." : "Penilaian tidak tersimpan.",
        description: responseLangRef.current === "en"
          ? "Check your connection and try again."
          : "Periksa koneksi Anda lalu coba lagi.",
      });
    }
  }

  function handleNewChat() {
    abortRef.current?.abort();
    setActiveSessionId(null);
    setMessages([]);
    messageIdAliasRef.current.clear();
  }

  async function handleSelectSession(id: string) {
    abortRef.current?.abort();
    setActiveSessionId(id);
    setMessages([]);
    messageIdAliasRef.current.clear();
    await loadMessages(id);
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Toaster />
      <ChatSidebar
        sessions={dbSessions}
        activeSessionId={activeSessionId}
        onNewChat={() => { handleNewChat(); setSidebarOpen(false); }}
        onSelectSession={handleSelectSession}
        userName={user?.name}
        userEmail={user?.email}
        isAdmin={user?.role === "admin"}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex-1 flex flex-col bg-white">
        {/* Header */}
        <div className="border-b px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden text-gray-500 hover:text-gray-700"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="font-semibold text-gray-800 truncate max-w-[160px] sm:max-w-none">
              {activeSessionId ? dbSessions.find((s) => s.id === activeSessionId)?.title ?? "Chat" : "Chat Baru"}
            </h1>
          </div>

          <div className="flex items-center gap-3">
          {/* Folder scope. Only rendered once there is a folder to scope to, so
              a company account and an individual who files nothing both see the
              header exactly as it was. */}
          {folders.length > 0 && (
            <select
              value={activeFolder}
              onChange={(e) => {
                setActiveFolder(e.target.value);
                activeFolderRef.current = e.target.value;
              }}
              className="max-w-[9rem] truncate rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
              title={responseLang === "en" ? "Search only this folder" : "Cari hanya di folder ini"}
            >
              <option value="">{responseLang === "en" ? "All folders" : "Semua folder"}</option>
              {folders.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          )}
          {/* Export PDF */}
          {messages.length > 0 && !isLoading && (
            <Button
              variant="ghost"
              size="sm"
              className="text-gray-400 hover:text-gray-700 gap-1.5"
              onClick={async () => {
                const { exportChatToPDF } = await import("@/lib/export-pdf");
                const title = activeSessionId
                  ? dbSessions.find((s) => s.id === activeSessionId)?.title ?? "Chat"
                  : "Chat Baru";
                await exportChatToPDF(messages, title);
              }}
            >
              <Download className="h-4 w-4" />
              <span className="text-xs">Export PDF</span>
            </Button>
          )}
          {/* Response language toggle */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 hidden sm:inline">Bahasa respons:</span>
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => handleSetLang("auto")}
                className={cn("px-3 py-1.5 rounded-md text-xs font-semibold transition-all",
                  responseLang === "auto" ? "bg-white text-teal-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                )}
              >Auto</button>
              <button
                onClick={() => handleSetLang("id")}
                className={cn("px-3 py-1.5 rounded-md text-xs font-semibold transition-all",
                  responseLang === "id" ? "bg-white text-teal-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                )}
              >ID</button>
              <button
                onClick={() => handleSetLang("en")}
                className={cn("px-3 py-1.5 rounded-md text-xs font-semibold transition-all",
                  responseLang === "en" ? "bg-white text-teal-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                )}
              >EN</button>
            </div>
          </div>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
          {isHistoryLoading ? (
            <div className="space-y-6 max-w-3xl mx-auto">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3">
                  <div className="h-8 w-8 rounded-full bg-gray-200 animate-pulse shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
                    <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <ChatMessages messages={messages} isLoading={isLoading} userName={user?.name} onFeedback={handleFeedback} />
          )}
        </div>

        <div className="border-t px-6 py-4 space-y-3">
          {suggestions.length > 0 && !isLoading && (
            <div className="max-w-3xl mx-auto">
              <p className="text-xs text-gray-400 mb-2">
                {responseLang === "en" ? "💡 Suggested follow-ups:" : "💡 Pertanyaan lanjutan:"}
              </p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSuggestionClick(s)}
                    className="text-xs bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 rounded-full px-3 py-1.5 transition-colors text-left"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          <form onSubmit={handleSubmit} className="flex gap-3 max-w-3xl mx-auto">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                responseLang === "en"
                  ? (isIndividual ? "Ask anything about your documents..." : "Ask anything about company policies...")
                  : (isIndividual ? "Tanyakan sesuatu tentang dokumen Anda..." : "Tanyakan sesuatu tentang kebijakan perusahaan...")
              }
              disabled={isLoading}
              className="flex-1"
            />
            <Button type="submit" disabled={isLoading || !input.trim()} size="icon">
              <Send className="h-4 w-4" />
            </Button>
          </form>
          <p className="text-xs text-gray-400 text-center max-w-3xl mx-auto">
            {responseLang === "en"
              ? (isIndividual
                ? "IntelliBase AI can make mistakes. Always check important information against the source document itself."
                : "IntelliBase AI can make mistakes. Always verify important information with official documents or your supervisor.")
              : (isIndividual
                ? "IntelliBase AI dapat membuat kesalahan. Selalu periksa informasi penting langsung pada dokumen sumbernya."
                : "IntelliBase AI dapat membuat kesalahan. Selalu verifikasi informasi penting dengan dokumen resmi atau atasan Anda.")}
          </p>
        </div>
      </div>
    </div>
  );
}
