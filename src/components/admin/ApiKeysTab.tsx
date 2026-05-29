"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import { Copy, Trash2, Plus, Key, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface ApiKey {
  id: string;
  name: string;
  key: string;
  createdAt: string;
  lastUsedAt?: string | null;
}

export function ApiKeysTab() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/api-keys").then((r) => r.json()).then((d: ApiKey[]) => setKeys(d)).catch(() => {});
  }, []);

  async function handleCreate() {
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/admin/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName }),
      });
      const data = await res.json() as { key: string; name: string };
      setNewKeyValue(data.key);
      setNewKeyName("");
      const r2 = await fetch("/api/admin/api-keys");
      setKeys(await r2.json() as ApiKey[]);
    } catch {
      toast({ variant: "destructive", title: "Gagal membuat API key." });
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch("/api/admin/api-keys", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setKeys((prev) => prev.filter((k) => k.id !== id));
    toast({ title: "API key dihapus." });
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
        {keys.length === 0 && <p className="text-sm text-gray-400">Belum ada API key.</p>}
        {keys.map((k) => (
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
