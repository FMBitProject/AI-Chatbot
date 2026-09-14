"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AI_PROVIDERS, PROVIDER_CATALOG, type AiProvider, type AiSettingsView } from "@/lib/ai-providers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Draft = { model: string; apiKey: string; remove: boolean };
export function AiProvidersCard({ canEdit, lang }: { canEdit: boolean; lang: "id" | "en" }) {
  const en = lang === "en";
  const [settings, setSettings] = useState<AiSettingsView | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<AiProvider, Draft>>>({});
  const [primary, setPrimary] = useState<AiProvider | "">("");
  const [fallback, setFallback] = useState<AiProvider | "">("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [testResults, setTestResults] = useState<Partial<Record<AiProvider, string>>>({});
  const accept = useCallback((data: AiSettingsView) => {
    setSettings(data); setPrimary(data.primary ?? ""); setFallback(data.fallback ?? "");
    setDrafts(Object.fromEntries(data.providers.map(p => [p.provider, { model: p.model, apiKey: "", remove: false }])));
    setTestResults({});
  }, []);
  const load = useCallback(async () => {
    try {
      setError("");
      const res = await fetch("/api/admin/ai-providers", { cache: "no-store" });
      if (!res.ok) throw new Error("Load failed");
      accept(await res.json());
    } catch { setError(en ? "Could not load AI settings. Please retry." : "Pengaturan AI gagal dimuat. Silakan coba lagi."); }
  }, [accept, en]);
  useEffect(() => {
    // Yield the initial fetch so React finishes mounting before its result can
    // update state; this is also consistent with the admin audit panel.
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);
  async function send(path: string, method: string, body?: unknown) {
    const res = await fetch(path, { method, headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error?.message ?? (en ? "Request failed." : "Permintaan gagal."));
    }
    return res.status === 204 ? null : res.json();
  }
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try { await action(); }
    catch (err) { setError(err instanceof Error ? err.message : (en ? "Request failed." : "Permintaan gagal.")); }
    finally { lock.current = false; setBusy(false); }
  }
  function update(provider: AiProvider, patch: Partial<Draft>) {
    setDrafts(prev => ({ ...prev, [provider]: { ...prev[provider]!, ...patch } }));
    setTestResults(prev => ({ ...prev, [provider]: undefined }));
    setNotice("");
  }
  async function save(disable = false) {
    await run(async () => {
      const data = await send("/api/admin/ai-providers", "PUT", {
        primary: disable ? null : primary || null, fallback: disable ? null : fallback || null,
        providers: disable ? [] : AI_PROVIDERS.map(provider => {
          const draft = drafts[provider]!;
          return { provider, model: draft.model,
            ...(draft.remove ? { apiKey: null } : draft.apiKey.trim() ? { apiKey: draft.apiKey.trim() } : {}) };
        }),
      });
      accept(data);
      setNotice(en ? "AI settings saved." : "Pengaturan AI tersimpan.");
    });
  }
  async function test(provider: AiProvider) {
    await run(async () => {
      const draft = drafts[provider]!;
      await send("/api/admin/ai-providers/test", "POST", { provider, model: draft.model,
        ...(draft.apiKey.trim() ? { apiKey: draft.apiKey.trim() } : {}) });
      setTestResults(prev => ({ ...prev, [provider]: en ? "Connection successful" : "Koneksi berhasil" }));
      setNotice(en ? "Test passed. Save to apply any changes." : "Tes berhasil. Simpan untuk menerapkan perubahan.");
    });
  }
  const selectClass = "w-full rounded-md border border-gray-300 bg-white p-2 text-sm disabled:opacity-50";
  return <Card className="border-violet-200">
    <CardHeader><CardTitle>{en ? "Your AI providers (BYOK)" : "Provider AI Anda (BYOK)"}</CardTitle>
      <p className="text-sm text-gray-500">{en
        ? "Choose who answers your questions. Your plan's chat limits still apply; provider usage is billed to your own account."
        : "Pilih provider yang menjawab pertanyaan. Batas chat paket tetap berlaku; biaya pemakaian provider mengikuti akun API Anda."}</p>
    </CardHeader>
    <CardContent className="space-y-5">
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {notice && <p role="status" className="text-sm text-green-700">{notice}</p>}
      {!settings ? <Button variant="outline" onClick={() => void load()}>{error ? (en ? "Retry" : "Coba lagi") : (en ? "Loading…" : "Memuat…")}</Button> : <>
        {settings.legacy && settings.primary && <p className="text-sm text-amber-700">{en
          ? "Your existing keys are in use. Saving migrates them to these settings. Add your Gemini key before enabling the new BYOK configuration."
          : "Key lama Anda masih digunakan. Menyimpan akan memindahkannya ke pengaturan ini. Lengkapi key Gemini sebelum mengaktifkan konfigurasi BYOK baru."}</p>}
        <label className="block space-y-1 text-sm font-medium">{en ? "Primary provider" : "Provider utama"}
          <select className={selectClass} value={primary} disabled={busy || !canEdit} onChange={e => {
            const value = e.target.value as AiProvider | ""; setPrimary(value);
            if (!value || value === fallback) setFallback("");
          }}>
            <option value="">{en ? "IntelliBase platform" : "Platform IntelliBase"}</option>
            {AI_PROVIDERS.map(p => <option key={p} value={p}>{PROVIDER_CATALOG[p].label}</option>)}
          </select>
        </label>
        <label className="block space-y-1 text-sm font-medium">{en ? "Fallback provider (optional)" : "Provider cadangan (opsional)"}
          <select className={selectClass} value={fallback} disabled={busy || !canEdit || !primary} onChange={e => setFallback(e.target.value as AiProvider | "")}>
            <option value="">{en ? "No fallback" : "Tanpa cadangan"}</option>
            {AI_PROVIDERS.filter(p => p !== primary).map(p => <option key={p} value={p}>{PROVIDER_CATALOG[p].label}</option>)}
          </select>
        </label>
        <p className="text-sm text-gray-600">{primary ? (en
          ? "Answers use only your selected providers. Fallback is used for rate limits before an answer starts. Google Gemini is required for document embedding and search; it only answers questions if selected above."
          : "Jawaban hanya memakai provider pilihan Anda. Cadangan digunakan saat batas pemakaian tercapai sebelum jawaban dimulai. Google Gemini wajib untuk embedding dan pencarian dokumen; Gemini hanya menjawab jika dipilih di atas.") : (en
          ? "Platform mode uses IntelliBase accounts for answers and embedding. Saved keys are kept but are not used."
          : "Mode platform memakai akun IntelliBase untuk jawaban dan embedding. Key tersimpan tetap disimpan tetapi tidak dipakai.")}</p>
        {settings.providers.filter(row => canEdit || row.hasKey).map(row => {
          const draft = drafts[row.provider]!;
          const catalog = PROVIDER_CATALOG[row.provider];
          return <fieldset key={row.provider} disabled={busy} className="rounded-lg border p-3 space-y-2">
            <legend className="px-1 text-sm font-semibold">{catalog.label}</legend>
            <p className="text-xs text-gray-500">{draft.remove ? (en ? "Will be removed on save" : "Akan dihapus saat disimpan") : row.hasKey ? (en ? "Key stored" : "Key tersimpan") : (en ? "No key stored" : "Belum ada key")}</p>
            {canEdit && <>
              <label className="block space-y-1 text-sm">{en ? "Answer model" : "Model jawaban"}
                <select className={selectClass} value={draft.model} onChange={e => update(row.provider, { model: e.target.value })}>
                  {catalog.models.map(model => <option key={model} value={model}>{model}</option>)}
                </select>
              </label>
              <label className="block space-y-1 text-sm">API key
                <Input type="password" autoComplete="off" spellCheck={false} value={draft.apiKey} maxLength={400}
                  placeholder={row.hasKey ? (en ? "Leave blank to keep stored key" : "Kosongkan untuk mempertahankan key") : (en ? "Paste your API key" : "Tempel API key Anda")}
                  onChange={e => update(row.provider, { apiKey: e.target.value, remove: false })} />
              </label>
              <a className="text-xs text-blue-600 underline" href={catalog.keysUrl} target="_blank" rel="noreferrer">{en ? "Get an API key" : "Dapatkan API key"}</a>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" disabled={draft.remove || (!draft.apiKey.trim() && !row.hasKey)} onClick={() => void test(row.provider)}>{en ? "Test connection" : "Tes koneksi"}</Button>
                {row.hasKey && <Button variant="outline" size="sm" onClick={() => update(row.provider, { remove: !draft.remove, apiKey: "" })}>{draft.remove ? (en ? "Undo removal" : "Batalkan hapus") : (en ? "Remove key on save" : "Hapus key saat simpan")}</Button>}
              </div>
            </>}
            {!canEdit && row.hasKey && <Button variant="outline" size="sm" onClick={() => void run(async () => {
              await send(`/api/admin/ai-providers?provider=${row.provider}`, "DELETE"); await load();
            })}>{en ? "Remove key" : "Hapus key"}</Button>}
            {testResults[row.provider] && <p className="text-xs text-green-700" role="status">{testResults[row.provider]}</p>}
            {!testResults[row.provider] && row.lastTestedAt && <p className="text-xs text-gray-500">{en ? "Last successful test: " : "Tes terakhir berhasil: "}{new Date(row.lastTestedAt).toLocaleString(en ? "en-US" : "id-ID")}</p>}
          </fieldset>;
        })}
        <p className="text-xs text-gray-500">{en ? "Keys are encrypted and never shown again. Connection tests make small requests that may incur provider charges. Embedding stays on gemini-embedding-001."
          : "Key dienkripsi dan tidak ditampilkan kembali. Tes koneksi mengirim permintaan kecil yang dapat dikenai biaya provider. Embedding tetap gemini-embedding-001."}</p>
        <div className="flex flex-wrap gap-2">
          {canEdit && <Button disabled={busy} onClick={() => void save()}>{busy ? (en ? "Processing…" : "Memproses…") : (en ? "Save settings" : "Simpan pengaturan")}</Button>}
          {settings.primary && <Button variant="outline" disabled={busy} onClick={() => void save(true)}>{en ? "Use platform accounts" : "Gunakan akun platform"}</Button>}
        </div>
        {!canEdit && <p className="text-sm text-gray-500">{en ? "A paid plan is required to add keys or choose providers. You can still disable BYOK and remove keys." : "Paket berbayar diperlukan untuk menambah key atau memilih provider. Anda tetap dapat menonaktifkan BYOK dan menghapus key."}</p>}
      </>}
    </CardContent>
  </Card>;
}
