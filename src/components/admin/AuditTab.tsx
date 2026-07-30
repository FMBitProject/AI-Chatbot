"use client";
import { useEffect, useState } from "react";
import { admin as adminT } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, ThumbsUp, ThumbsDown, Minus } from "lucide-react";

interface AuditLog {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  feedback?: string | null;
  sessionTitle: string;
  userName: string;
  userEmail: string;
}

export function AuditTab({ lang = "id" }: { lang?: Lang }) {
  const T = adminT[lang];
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    // A failed request must leave `logs` an array — an error body reaching it
    // would throw on the .filter() below rather than showing an empty table.
    fetch("/api/admin/audit")
      .then((r) => r.ok ? r.json() : null)
      .then((d: AuditLog[] | null) => { if (Array.isArray(d)) setLogs(d); })
      .catch(() => {});
  }, []);

  const filtered = logs.filter((l) =>
    l.role === "user" &&
    (search === "" ||
      l.content.toLowerCase().includes(search.toLowerCase()) ||
      l.userName.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold mb-1">{T.auditTitle}</h2>
        <p className="text-sm text-gray-500">{T.auditDesc}</p>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          className="pl-9"
          placeholder={T.searchAudit}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        {filtered.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-8">{T.noAudit}</p>
        )}
        {filtered.map((log) => {
          const nextLog = logs[logs.indexOf(log) - 1];
          const aiResponse = nextLog?.role === "assistant" ? nextLog : null;
          return (
            <div key={log.id} className="border rounded-xl p-4 hover:bg-gray-50 transition-colors">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-teal-100 flex items-center justify-center text-xs font-bold text-teal-700 shrink-0">
                    {log.userName[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{log.userName}</p>
                    <p className="text-xs text-gray-400">{log.userEmail}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {aiResponse?.feedback === "up" && <ThumbsUp className="h-3.5 w-3.5 text-green-500" />}
                  {aiResponse?.feedback === "down" && <ThumbsDown className="h-3.5 w-3.5 text-red-500" />}
                  {!aiResponse?.feedback && <Minus className="h-3.5 w-3.5 text-gray-300" />}
                  <span className="text-xs text-gray-400">
                    {new Date(log.createdAt).toLocaleString("id-ID")}
                  </span>
                </div>
              </div>
              <p className="text-sm text-gray-700 mb-1">
                <span className="font-medium text-teal-600">Q: </span>{log.content}
              </p>
              {aiResponse && (
                <p className="text-xs text-gray-500 line-clamp-2">
                  <span className="font-medium">A: </span>{aiResponse.content.slice(0, 150)}...
                </p>
              )}
              <Badge variant="secondary" className="mt-2 text-xs">{log.sessionTitle}</Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
}
