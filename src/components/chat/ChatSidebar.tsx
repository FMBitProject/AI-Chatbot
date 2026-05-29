"use client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PlusCircle, MessageSquare, LogOut, BrainCircuit, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
}

interface ChatSidebarProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  isAdmin?: boolean;
  userName?: string;
  userEmail?: string;
}

export function ChatSidebar({
  sessions,
  activeSessionId,
  onNewChat,
  onSelectSession,
  userName,
  userEmail,
  isAdmin,
}: ChatSidebarProps) {
  const router = useRouter();

  async function handleLogout() {
    await authClient.signOut();
    router.push("/login");
  }

  return (
    <div className="w-64 flex flex-col h-full bg-gray-900 text-white">
      <div className="p-4 flex items-center gap-2">
        <BrainCircuit className="h-6 w-6 text-blue-400" />
        <span className="font-bold text-lg">TanyaInternal</span>
      </div>
      <div className="px-3 pb-3">
        <Button onClick={onNewChat} variant="outline" className="w-full bg-gray-800 border-gray-700 text-white hover:bg-gray-700 hover:text-white">
          <PlusCircle className="h-4 w-4" />
          New Chat
        </Button>
      </div>
      <Separator className="bg-gray-800" />
      <ScrollArea className="flex-1 px-3 py-3">
        <div className="space-y-1">
          {sessions.length === 0 && (
            <p className="text-xs text-gray-500 text-center py-4">Belum ada riwayat chat</p>
          )}
          {sessions.map((session) => (
            <button
              key={session.id}
              onClick={() => onSelectSession(session.id)}
              className={cn(
                "w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors truncate",
                activeSessionId === session.id
                  ? "bg-gray-700 text-white"
                  : "text-gray-400 hover:bg-gray-800 hover:text-white"
              )}
            >
              <MessageSquare className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{session.title}</span>
            </button>
          ))}
        </div>
      </ScrollArea>
      <Separator className="bg-gray-800" />
      <div className="p-3 flex items-center gap-3">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-blue-600 text-white text-xs font-semibold">
            {userName?.[0]?.toUpperCase() ?? "U"}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{userName ?? "User"}</p>
          <p className="text-xs text-gray-400 truncate">{userEmail ?? ""}</p>
        </div>
        {isAdmin && (
          <Button variant="ghost" size="icon" onClick={() => router.push("/admin")} className="text-gray-400 hover:text-white hover:bg-gray-700 shrink-0" title="Dashboard Admin">
            <LayoutDashboard className="h-4 w-4" />
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={handleLogout} className="text-gray-400 hover:text-white hover:bg-gray-700 shrink-0">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
