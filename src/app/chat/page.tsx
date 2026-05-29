"use client";
import { useState, useRef, useEffect } from "react";
import { ChatSidebar, type ChatSession } from "@/components/chat/ChatSidebar";
import { ChatMessages, type Message, type Citation } from "@/components/chat/ChatMessages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/toaster";
import { Send } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type ResponseLang = "id" | "en";

export default function ChatPage() {
  const { data: session } = authClient.useSession();
  const user = session?.user as { name?: string; email?: string; role?: string } | undefined;

  const [dbSessions, setDbSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [responseLang, setResponseLang] = useState<ResponseLang>("id");

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const responseLangRef = useRef<ResponseLang>("id");

  useEffect(() => {
    loadSessions();
    const saved = localStorage.getItem("responseLang") as ResponseLang | null;
    if (saved === "id" || saved === "en") {
      setResponseLang(saved);
      responseLangRef.current = saved;
    }
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
    try {
      const res = await fetch(`/api/chat/sessions/${sessionId}/messages`);
      if (!res.ok) return;
      const data = await res.json() as { id: string; role: string; content: string; citationsJson?: string; feedback?: string }[];
      if (data.length === 0) {
        setMessages([{ id: "no-history", role: "assistant", content: "Riwayat percakapan ini tidak tersedia. Silakan mulai percakapan baru." }]);
      } else {
        setMessages(data.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          citations: m.citationsJson ? JSON.parse(m.citationsJson) as Citation[] : undefined,
          feedback: m.feedback as "up" | "down" | undefined,
        })));
      }
    } catch {}
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
    setMessages((prev) => [...prev, { id: assistantMsgId, role: "assistant", content: "" }]);

    try {
      const apiMessages = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, sessionId: activeSessionId, responseLang: responseLangRef.current }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error("Chat API error");

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
          } else if (line.startsWith("2:")) {
            try {
              const meta = JSON.parse(line.slice(2)) as { citations: Citation[]; messageId: string; sessionId: string };
              citations = meta.citations;
              realMsgId = meta.messageId;
              newSessionId = meta.sessionId;
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
        onNewChat={handleNewChat}
        onSelectSession={handleSelectSession}
        userName={user?.name}
        userEmail={user?.email}
        isAdmin={user?.role === "admin"}
      />
      <div className="flex-1 flex flex-col bg-white">
        {/* Header */}
        <div className="border-b px-6 py-3 flex items-center justify-between">
          <h1 className="font-semibold text-gray-800">
            {activeSessionId ? dbSessions.find((s) => s.id === activeSessionId)?.title ?? "Chat" : "Chat Baru"}
          </h1>

          {/* Response language toggle */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Bahasa respons:</span>
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => handleSetLang("id")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                  responseLang === "id"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                🇮🇩 Indonesia
              </button>
              <button
                onClick={() => handleSetLang("en")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                  responseLang === "en"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                🇬🇧 English
              </button>
            </div>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
          <ChatMessages messages={messages} isLoading={isLoading} userName={user?.name} onFeedback={handleFeedback} />
        </div>

        <div className="border-t px-6 py-4">
          <form onSubmit={handleSubmit} className="flex gap-3 max-w-3xl mx-auto">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={responseLang === "id" ? "Tanyakan sesuatu tentang kebijakan perusahaan..." : "Ask anything about company policies..."}
              disabled={isLoading}
              className="flex-1"
            />
            <Button type="submit" disabled={isLoading || !input.trim()} size="icon">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
