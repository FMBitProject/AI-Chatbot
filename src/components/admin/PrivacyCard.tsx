"use client";
import { useEffect, useState } from "react";
import { AI_PROVIDERS, PROVIDER_CATALOG, type AiProvider } from "@/lib/ai-providers";
import { Button } from "@/components/ui/button";

type View = { revision: number; allowedProviders: AiProvider[]; events?: { id: string; action: string; provider: string | null; purpose: string | null; documentIds: string[]; createdAt: string }[] };
export function PrivacyCard({ lang }: { lang: "id" | "en" }) {
  const en = lang === "en";
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function load() {
    const response = await fetch("/api/admin/privacy", { cache: "no-store" });
    if (!response.ok) throw new Error(en ? "Could not load privacy settings." : "Pengaturan privasi gagal dimuat.");
    setView(await response.json());
  }
  useEffect(() => {
    let active = true;
    fetch("/api/admin/privacy", { cache: "no-store" }).then(async r => {
      if (!r.ok) throw new Error();
      const data = await r.json();
      if (active) setView(data);
    }).catch(() => { if (active) setMessage(en ? "Could not load privacy settings." : "Pengaturan privasi gagal dimuat."); });
    return () => { active = false; };
  }, [en]);
  async function save() {
    if (!view) return;
    setBusy(true); setMessage("");
    try {
      const res = await fetch("/api/admin/privacy", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: view.revision, allowedProviders: view.allowedProviders }) });
      if (!res.ok) throw new Error(res.status === 409 ? (en ? "Settings changed. Reload and try again." : "Pengaturan berubah. Muat ulang lalu coba lagi.") : (en ? "Could not save settings." : "Pengaturan gagal disimpan."));
      await load();
      setMessage(en ? "Saved. Earlier chat history is excluded from future AI context." : "Tersimpan. Riwayat chat sebelumnya tidak lagi dipakai sebagai konteks AI.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Error"); }
    finally { setBusy(false); }
  }
  return <section className="rounded-xl border bg-white p-5 space-y-4">
    <h3 className="font-semibold">{en ? "Data privacy" : "Privasi data"}</h3>
    <p className="text-sm text-gray-600">{en ? "Allow these providers to process workspace data, including embeddings, summaries, answers and fallbacks. Provider account retention and training settings must be verified separately." : "Izinkan provider berikut memproses data workspace, termasuk embedding, ringkasan, jawaban, dan fallback. Retensi serta penggunaan untuk pelatihan harus diverifikasi terpisah pada akun provider."}</p>
    <p className="text-sm text-gray-600">{en ? "Google is currently required for embeddings. Disabling it pauses search, indexing and AI answers. Disabling every provider pauses all external AI processing." : "Google saat ini diperlukan untuk embedding. Menonaktifkannya menghentikan pencarian, indexing, dan jawaban AI. Nonaktifkan semua provider untuk menghentikan seluruh pemrosesan AI eksternal."}</p>
    {view && <>
      <fieldset disabled={busy} className="flex flex-wrap gap-4"><legend className="sr-only">{en ? "Allowed providers" : "Provider yang diizinkan"}</legend>{AI_PROVIDERS.map(provider => <label key={provider} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={view.allowedProviders.includes(provider)} onChange={e => setView({ ...view, allowedProviders: e.target.checked ? [...view.allowedProviders, provider] : view.allowedProviders.filter(p => p !== provider) })} />{PROVIDER_CATALOG[provider].label}</label>)}</fieldset>
      <p className="text-xs text-gray-500">{en ? "Saving resets AI conversation context across this workspace. History remains readable. Requests already sent cannot be recalled." : "Menyimpan akan mereset konteks percakapan AI di workspace ini. Riwayat tetap bisa dibaca. Request yang sudah terkirim tidak bisa ditarik kembali."}</p>
      <Button onClick={save} disabled={busy}>{en ? "Save privacy settings" : "Simpan pengaturan privasi"}</Button>
      <details><summary className="cursor-pointer text-sm">{en ? "Recent privacy events (up to 50)" : "Aktivitas privasi terakhir (maksimal 50)"}</summary><p className="text-xs text-gray-500 my-2">{en ? "Provider attempts do not confirm receipt or deletion at the provider. No document content is stored here." : "Percobaan pengiriman tidak membuktikan penerimaan atau penghapusan di provider. Isi dokumen tidak disimpan di catatan ini."}</p><ul className="text-xs space-y-2 break-words">{view.events?.map(event => <li key={event.id}>{new Date(event.createdAt).toLocaleString()} · {event.action} · {event.provider ?? "—"} · {event.purpose ?? "—"}{event.documentIds.length ? ` · ${event.documentIds.join(", ")}` : ""}</li>)}</ul></details>
    </>}
    {message && <p role="status" className="text-sm">{message}</p>}
    <button type="button" className="text-sm underline" disabled={busy} onClick={() => load().catch(error => setMessage(error.message))}>{en ? "Reload" : "Muat ulang"}</button>
  </section>;
}
