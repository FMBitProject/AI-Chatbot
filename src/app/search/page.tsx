"use client";
import { useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LogoFull } from "@/components/Logo";
import { Search, FileText, ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

interface SearchResult {
  id: string;
  text: string;
  documentName: string;
  documentId: string;
  score: number;
}

export default function SearchPage() {
  const { data: session } = authClient.useSession();
  const user = session?.user as { role?: string } | undefined;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  // Set when the server refuses the search (e.g. a seat frozen by the plan
  // limit), so the page explains why instead of showing a bare "no results".
  const [notice, setNotice] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function doSearch(q: string) {
    if (!q.trim()) { setResults([]); setSearched(false); return; }
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json() as SearchResult[] | { error?: string; message?: string };
      if (!res.ok || !Array.isArray(data)) {
        setResults([]);
        setNotice(!Array.isArray(data) && data?.message ? data.message : null);
        return;
      }
      setNotice(null);
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 600);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    doSearch(query);
  }

  function highlight(text: string, q: string) {
    if (!q) return text;
    const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
    return parts.map((part, i) =>
      part.toLowerCase() === q.toLowerCase()
        ? <mark key={i} className="bg-yellow-100 text-yellow-800 rounded px-0.5">{part}</mark>
        : part
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <LogoFull size="sm" />
        <div className="flex items-center gap-3">
          <Link href="/chat">
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /> Chat</Button>
          </Link>
          {user?.role === "admin" && (
            <Link href="/admin">
              <Button variant="outline" size="sm">Dashboard</Button>
            </Link>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Cari Dokumen Internal</h1>
          <p className="text-gray-500 text-sm">Telusuri seluruh dokumen perusahaan Anda secara instan</p>
        </div>

        <form onSubmit={handleSubmit} className="relative mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <Input
            value={query}
            onChange={handleChange}
            placeholder="Ketik kata kunci, topik, atau frasa dari dokumen..."
            className="pl-12 h-12 text-base rounded-xl shadow-sm"
            autoFocus
          />
          {loading && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />}
        </form>

        {!searched && (
          <div className="text-center text-gray-400 mt-16">
            <Search className="h-12 w-12 mx-auto mb-3 text-gray-200" />
            <p className="text-sm">Mulai ketik untuk mencari di seluruh dokumen perusahaan</p>
          </div>
        )}

        {searched && !loading && notice && (
          <div className="mt-10 mx-auto max-w-md rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
            <p className="text-sm text-amber-900">{notice}</p>
          </div>
        )}

        {searched && !loading && !notice && results.length === 0 && (
          <div className="text-center text-gray-400 mt-16">
            <p className="text-sm">Tidak ditemukan hasil untuk <strong>&ldquo;{query}&rdquo;</strong></p>
          </div>
        )}

        {results.length > 0 && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">{results.length} hasil ditemukan untuk <strong>&ldquo;{query}&rdquo;</strong></p>
            {results.map((r) => (
              <div key={r.id} className="bg-white rounded-xl border p-5 hover:border-blue-300 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="h-4 w-4 text-blue-500 shrink-0" />
                  <span className="text-xs font-semibold text-blue-600 truncate">{r.documentName}</span>
                  <span className="ml-auto text-xs text-gray-300 shrink-0">{Math.round(r.score * 100)}% relevan</span>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">
                  {highlight(r.text.slice(0, 300), query)}
                  {r.text.length > 300 && "..."}
                </p>
                <Link href={`/chat?q=${encodeURIComponent(r.text.slice(0, 100))}`}>
                  <Button variant="ghost" size="sm" className="mt-3 text-blue-600 text-xs p-0 h-auto hover:text-blue-800">
                    Tanya AI tentang ini →
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
