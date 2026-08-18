"use client";
import { useCallback, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import { Copy, Trash2, Plus, Key, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { readApiError } from "@/lib/errors";

interface ApiKey {
  id: string;
  name: string;
  key: string;
  createdAt: string;
  lastUsedAt?: string | null;
}

// NOT MOUNTED. The "API Access" tab was taken out of the admin dashboard in
// bc61f47 (2026-05-29) and nothing has imported this component since, so none of
// the behaviour below is reachable today — `/api/admin/api-keys` and
// `/api/v1/query` are still live, but there is no UI that creates a key.
//
// Fixed rather than left alone because the bugs here were the kind that come
// back with the tab: whoever re-adds it would re-add a delete button that lies.
// If the API tab is not coming back, delete this file instead.
export function ApiKeysTab() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  // `r.ok` before `r.json()`, plus an Array.isArray check. An expired session
  // answers 401 with `{ error: "Unauthorized" }` — valid JSON, so `.catch()`
  // never ran, `setKeys` stored an object, and the `keys.map()` in the render
  // threw "keys.map is not a function". With no error boundary around this tab,
  // that TypeError took the whole admin page to the 500 screen over what was
  // really "please sign in again".
  const load = useCallback(() => {
    fetch("/api/admin/api-keys")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ApiKey[] | null) => {
        if (Array.isArray(d)) {
          setKeys(d);
          setFailed(false);
        } else {
          setFailed(true);
        }
      })
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/admin/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName }),
      });
      // Without this, a refused create fell through to `data.key` being
      // undefined. The success card is guarded on that value, so nothing
      // appeared at all — no key, no error, no explanation.
      if (!res.ok) {
        const { message } = await readApiError(res);
        toast({ variant: "destructive", title: "Gagal membuat API key.", description: message });
        return;
      }
      const data = await res.json() as { key: string; name: string };
      setNewKeyValue(data.key);
      setNewKeyName("");
      load();
    } catch {
      toast({ variant: "destructive", title: "Gagal membuat API key.", description: "Periksa koneksi Anda lalu coba lagi." });
    } finally {
      setCreating(false);
    }
  }

  // The row is removed and the toast is shown only once the server confirms it.
  // Before, both ran unconditionally: a 401 or a 500 still cleared the row and
  // still said "API key dihapus", so an admin closed the tab believing a key was
  // dead while it was still live and still able to query every document in the
  // workspace through /api/v1/query. A delete button that lies about a
  // credential is worse than one that fails loudly.
  async function handleDelete(id: string) {
    try {
      const res = await fetch("/api/admin/api-keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const { message } = await readApiError(res);
        toast({ variant: "destructive", title: "API key TIDAK dihapus.", description: message });
        return;
      }
      setKeys((prev) => prev.filter((k) => k.id !== id));
      toast({ title: "API key dihapus." });
    } catch {
      toast({
        variant: "destructive",
        title: "API key TIDAK dihapus.",
        description: "Periksa koneksi Anda lalu coba lagi. Key ini masih aktif.",
      });
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold mb-1">API Access</h2>
        <p className="text-sm text-gray-500">Integrasikan IntelliBase ke sistem internal Anda menggunakan REST API.</p>
      </div>

      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="pt-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700">API key hanya ditampilkan sekali saat dibuat. Simpan di tempat aman.</p>
          </div>
        </CardContent>
      </Card>

      {newKeyValue && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-4">
            <p className="text-xs font-semibold text-green-700 mb-2">✅ API key baru berhasil dibuat — simpan sekarang!</p>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-white rounded px-2 py-1.5 flex-1 break-all font-mono border">{newKeyValue}</code>
              <Button size="icon" variant="ghost" onClick={() => { navigator.clipboard.writeText(newKeyValue); toast({ title: "Disalin!" }); }}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-green-600 mt-2">Endpoint: <code className="bg-white px-1 rounded">POST /api/v1/query</code> · Header: <code className="bg-white px-1 rounded">Authorization: Bearer {newKeyValue.slice(0, 10)}...</code></p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        <Label>Buat API Key Baru</Label>
        <div className="flex gap-2">
          <Input placeholder="Nama key (contoh: HRIS Integration)" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleCreate()} />
          <Button onClick={handleCreate} disabled={creating || !newKeyName.trim()} className="bg-blue-600 hover:bg-blue-700 shrink-0">
            <Plus className="h-4 w-4" /> Buat
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label>API Keys Aktif</Label>
        {/* Before the empty-state line, because "Belum ada API key" is a claim
            we cannot make when the read failed — and it is the one claim that
            would stop an admin looking for a key they need to revoke. */}
        {failed ? (
          <div className="text-sm">
            <p className="text-gray-500 mb-3">Gagal memuat daftar API key. Periksa koneksi Anda, lalu coba lagi.</p>
            <Button variant="outline" size="sm" onClick={load}>Coba Lagi</Button>
          </div>
        ) : keys.length === 0 ? (
          <p className="text-sm text-gray-400">Belum ada API key.</p>
        ) : null}
        {!failed && keys.map((k) => (
          <div key={k.id} className="flex items-center gap-3 p-3 border rounded-lg bg-white">
            <Key className="h-4 w-4 text-gray-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800">{k.name}</p>
              <code className="text-xs text-gray-400 font-mono">{k.key}</code>
            </div>
            <div className="text-xs text-gray-400 shrink-0">
              {k.lastUsedAt ? `Terakhir: ${new Date(k.lastUsedAt).toLocaleDateString("id-ID")}` : "Belum digunakan"}
            </div>
            <Button variant="ghost" size="icon" className="text-gray-400 hover:text-red-500 shrink-0" onClick={() => handleDelete(k.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="rounded-xl border p-4 bg-gray-50 text-xs space-y-2">
        <p className="font-semibold text-gray-700">Contoh Penggunaan API:</p>
        <pre className="bg-white rounded border p-3 overflow-x-auto text-gray-600">{`curl -X POST ${typeof window !== "undefined" ? window.location.origin : ""}/api/v1/query \\
  -H "Authorization: Bearer ib_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"question": "Apa saja prosedur cuti tahunan?", "language": "id"}'`}</pre>
        <p className="text-gray-500">Response: <code className="bg-white px-1 rounded">{"{ answer, sources, model }"}</code></p>
      </div>
    </div>
  );
}
