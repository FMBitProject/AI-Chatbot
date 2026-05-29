import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { CitationsAccordion } from "./CitationsAccordion";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import { LogoIcon } from "@/components/Logo";

export interface Citation {
  id: string;
  text: string;
  documentName?: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  feedback?: "up" | "down";
}

interface ChatMessagesProps {
  messages: Message[];
  isLoading: boolean;
  userName?: string;
  onFeedback?: (messageId: string, feedback: "up" | "down") => void;
}

export function ChatMessages({ messages, isLoading, userName, onFeedback }: ChatMessagesProps) {
  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-3 text-gray-400">
        <LogoIcon size="lg" />
        <div>
          <p className="font-medium text-gray-500">Selamat datang di IntelliBase</p>
          <p className="text-sm">Tanyakan apa saja seputar kebijakan &amp; SOP perusahaan Anda</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {messages.map((msg) => (
        <div key={msg.id} className={cn("flex gap-3", msg.role === "user" && "flex-row-reverse")}>
          <Avatar className="h-8 w-8 shrink-0 mt-1">
            {msg.role === "assistant" ? (
              <AvatarFallback className="bg-gradient-to-br from-blue-600 to-violet-600 p-0 overflow-hidden">
                <LogoIcon size="sm" />
              </AvatarFallback>
            ) : (
              <AvatarFallback className="bg-gray-200 text-gray-700 text-xs font-semibold">
                {userName?.[0]?.toUpperCase() ?? "U"}
              </AvatarFallback>
            )}
          </Avatar>
          <div className={cn("max-w-[75%]", msg.role === "user" && "items-end")}>
            <div className={cn(
              "rounded-2xl px-4 py-3 text-sm leading-relaxed",
              msg.role === "user"
                ? "bg-blue-600 text-white rounded-tr-sm"
                : "bg-gray-100 text-gray-800 rounded-tl-sm"
            )}>
              {msg.role === "user" ? msg.content : (
                <ReactMarkdown
                  components={{
                    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                    ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
                    li: ({ children }) => <li>{children}</li>,
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              )}
            </div>
            {msg.role === "assistant" && (
              <>
                {msg.citations && <CitationsAccordion citations={msg.citations} />}
                {onFeedback && msg.content && (
                  <div className="flex gap-1 mt-1 ml-1">
                    <button
                      onClick={() => onFeedback(msg.id, "up")}
                      className={cn(
                        "p-1.5 rounded-md transition-colors",
                        msg.feedback === "up"
                          ? "text-green-600 bg-green-50"
                          : "text-gray-400 hover:text-green-600 hover:bg-green-50"
                      )}
                      title="Jawaban membantu"
                    >
                      <ThumbsUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => onFeedback(msg.id, "down")}
                      className={cn(
                        "p-1.5 rounded-md transition-colors",
                        msg.feedback === "down"
                          ? "text-red-500 bg-red-50"
                          : "text-gray-400 hover:text-red-500 hover:bg-red-50"
                      )}
                      title="Jawaban tidak membantu"
                    >
                      <ThumbsDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      ))}
      {isLoading && (
        <div className="flex gap-3">
          <Avatar className="h-8 w-8 shrink-0 mt-1">
            <AvatarFallback className="bg-gradient-to-br from-blue-600 to-violet-600 text-white text-xs p-0 overflow-hidden">
              <LogoIcon size="sm" />
            </AvatarFallback>
          </Avatar>
          <div className="space-y-2 pt-2 max-w-[60%]">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-4 w-36" />
          </div>
        </div>
      )}
    </div>
  );
}
