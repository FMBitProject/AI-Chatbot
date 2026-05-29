import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { CitationsAccordion } from "./CitationsAccordion";
import { BrainCircuit } from "lucide-react";
import { cn } from "@/lib/utils";

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
}

interface ChatMessagesProps {
  messages: Message[];
  isLoading: boolean;
  userName?: string;
}

export function ChatMessages({ messages, isLoading, userName }: ChatMessagesProps) {
  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-3 text-gray-400">
        <BrainCircuit className="h-12 w-12 text-blue-200" />
        <div>
          <p className="font-medium text-gray-500">Selamat datang di TanyaInternal AI</p>
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
              <AvatarFallback className="bg-blue-600 text-white text-xs">
                <BrainCircuit className="h-4 w-4" />
              </AvatarFallback>
            ) : (
              <AvatarFallback className="bg-gray-200 text-gray-700 text-xs font-semibold">
                {userName?.[0]?.toUpperCase() ?? "U"}
              </AvatarFallback>
            )}
          </Avatar>
          <div className={cn("max-w-[75%]", msg.role === "user" && "items-end")}>
            <div
              className={cn(
                "rounded-2xl px-4 py-3 text-sm leading-relaxed",
                msg.role === "user"
                  ? "bg-blue-600 text-white rounded-tr-sm"
                  : "bg-gray-100 text-gray-800 rounded-tl-sm"
              )}
            >
              {msg.content}
            </div>
            {msg.role === "assistant" && msg.citations && (
              <CitationsAccordion citations={msg.citations} />
            )}
          </div>
        </div>
      ))}
      {isLoading && (
        <div className="flex gap-3">
          <Avatar className="h-8 w-8 shrink-0 mt-1">
            <AvatarFallback className="bg-blue-600 text-white text-xs">
              <BrainCircuit className="h-4 w-4" />
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
