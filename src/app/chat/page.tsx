"use client";
import { useState, useRef, useEffect } from "react";
import { ChatSidebar, type ChatSession } from "@/components/chat/ChatSidebar";
import { ChatMessages, type Message, type Citation } from "@/components/chat/ChatMessages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/toaster";
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

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const responseLangRef = useRef<ResponseLang>(getStoredResponseLang());

  useEffect(() => {
    loadSessions();
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
        body: JSON.stringify({ messages: apiMessages, sessionId: activeSessionId, responseLang: responseLangRef.current }),
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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value, { stream: true }).split("\n");
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

  async function handleFeedback(messageId: string, feedback: "up" | "down") {
    await fetch("/api/chat/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, feedback }),
    });
    setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, feedback } : m));
  }

  function handleNewChat() {
    abortRef.current?.abort();
    setActiveSessionId(null);
    setMessages([]);
  }

  async function handleSelectSession(id: string) {
    abortRef.current?.abort();
    setActiveSessionId(id);
    setMessages([]);
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
              placeholder={responseLang === "en" ? "Ask anything about company policies..." : "Tanyakan sesuatu tentang kebijakan perusahaan..."}
              disabled={isLoading}
              className="flex-1"
            />
            <Button type="submit" disabled={isLoading || !input.trim()} size="icon">
              <Send className="h-4 w-4" />
            </Button>
          </form>
          <p className="text-xs text-gray-400 text-center max-w-3xl mx-auto">
            {responseLang === "en"
              ? "IntelliBase AI can make mistakes. Always verify important information with official documents or your supervisor."
              : "IntelliBase AI dapat membuat kesalahan. Selalu verifikasi informasi penting dengan dokumen resmi atau atasan Anda."}
          </p>
        </div>
      </div>
    </div>
  );
}
