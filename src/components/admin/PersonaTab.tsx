"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/use-toast";
import { Sparkles, Bot, Save, Key, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { LogoIcon } from "@/components/Logo";
import { admin as adminT } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";

interface PersonaData {
  aiName: string;
  aiGreeting: string;
  aiPersonality: string;
}

interface ProviderKeys {
  groqApiKey: string;
  geminiApiKey: string;
}

export function PersonaTab({ lang = "id" }: { lang?: Lang }) {
  const T = adminT[lang];
  const [form, setForm] = useState<PersonaData>({ aiName: "IntelliBase AI", aiGreeting: "", aiPersonality: "" });
  const [keys, setKeys] = useState<ProviderKeys>({ groqApiKey: "", geminiApiKey: "" });
  const [hasGroqKey, setHasGroqKey] = useState(false);
  const [hasGeminiKey, setHasGeminiKey] = useState(false);
  const [showGroq, setShowGroq] = useState(false);
  const [showGemini, setShowGemini] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingKeys, setSavingKeys] = useState(false);

  useEffect(() => {
    fetch("/api/admin/persona")
      .then((r) => r.json())
      .then((d: Partial<PersonaData> & { hasGroqApiKey?: boolean; hasGeminiApiKey?: boolean }) => {
        setForm({ aiName: d.aiName ?? "IntelliBase AI", aiGreeting: d.aiGreeting ?? "", aiPersonality: d.aiPersonality ?? "" });
        setHasGroqKey(!!d.hasGroqApiKey);
        setHasGeminiKey(!!d.hasGeminiApiKey);
      })
      .catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await fetch("/api/admin/persona", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      toast({ title: lang === "en" ? "AI persona saved." : "Persona AI berhasil disimpan." });
    } catch {
      toast({ variant: "destructive", title: lang === "en" ? "Failed to save persona." : "Gagal menyimpan persona." });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveKeys() {
    setSavingKeys(true);
    try {
      const body: Record<string, string> = {};
      if (keys.groqApiKey !== "") body.groqApiKey = keys.groqApiKey;
      if (keys.geminiApiKey !== "") body.geminiApiKey = keys.geminiApiKey;
      await fetch("/api/admin/persona", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (keys.groqApiKey !== "") setHasGroqKey(keys.groqApiKey.length > 0);
      if (keys.geminiApiKey !== "") setHasGeminiKey(keys.geminiApiKey.length > 0);
      setKeys({ groqApiKey: "", geminiApiKey: "" });
      toast({ title: lang === "en" ? "API keys saved." : "API key berhasil disimpan." });
    } catch {
      toast({ variant: "destructive", title: lang === "en" ? "Failed to save API keys." : "Gagal menyimpan API key." });
    } finally {
      setSavingKeys(false);
    }
  }

  async function handleClearKey(provider: "groq" | "gemini") {
    await fetch("/api/admin/persona", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(provider === "groq" ? { groqApiKey: "" } : { geminiApiKey: "" }),
    });
    if (provider === "groq") setHasGroqKey(false);
    else setHasGeminiKey(false);
    toast({ title: lang === "en" ? "API key removed." : "API key dihapus." });
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold mb-1">{T.personaTitle}</h2>
        <p className="text-sm text-gray-500">{T.personaDesc}</p>
      </div>

      {/* Preview */}
      <Card className="border-blue-100 bg-blue-50/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2 text-blue-700">
            <Bot className="h-4 w-4" /> Preview Persona
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center shrink-0">
              <LogoIcon size="sm" />
            </div>
            <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 text-sm shadow-sm max-w-sm">
              <p className="font-semibold text-blue-700 text-xs mb-1">{form.aiName || "IntelliBase AI"}</p>
              <p className="text-gray-700">
                {form.aiGreeting || "Selamat datang! Saya siap membantu Anda menemukan informasi dari dokumen internal perusahaan."}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>{T.aiName}</Label>
          <Input
            placeholder="Contoh: Ava, Max, Aria, atau nama kustom"
            value={form.aiName}
            onChange={(e) => setForm({ ...form, aiName: e.target.value })}
          />
          <p className="text-xs text-gray-400">Nama ini akan muncul di header chat dan respons AI</p>
        </div>

        <div className="space-y-2">
          <Label>{T.greeting}</Label>
          <textarea
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm min-h-[80px] focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            placeholder="Contoh: Halo! Saya Ava, asisten AI PT Maju Bersama. Ada yang bisa saya bantu?"
            value={form.aiGreeting}
            onChange={(e) => setForm({ ...form, aiGreeting: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-blue-500" /> {T.personality}
          </Label>
          <textarea
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm min-h-[80px] focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            placeholder="Contoh: Selalu jawab dengan nada ramah namun profesional. Gunakan kata 'Anda' bukan 'kamu'. Tambahkan emoji relevan di akhir jawaban."
            value={form.aiPersonality}
            onChange={(e) => setForm({ ...form, aiPersonality: e.target.value })}
          />
          <p className="text-xs text-gray-400">Instruksi tambahan untuk mengatur gaya dan tone AI</p>
        </div>

        <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
          <Save className="h-4 w-4" />
          {saving ? T.savingPersona : T.savePersona}
        </Button>
      </div>

      {/* AI Provider Keys */}
      <div className="border-t pt-6 space-y-4">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Key className="h-4 w-4 text-gray-500" />
            {lang === "en" ? "AI Provider API Keys" : "API Key Penyedia AI"}
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            {lang === "en"
              ? "Use your own Groq & Gemini keys so your quota is separate from other companies."
              : "Gunakan API key Anda sendiri agar kuota Groq & Gemini terpisah dari perusahaan lain."}
          </p>
        </div>

        {/* Groq */}
        <div className="space-y-1.5">
          <Label className="flex items-center gap-2">
            Groq API Key
            {hasGroqKey && <span className="flex items-center gap-1 text-xs text-green-600 font-normal"><CheckCircle2 className="h-3.5 w-3.5" />{lang === "en" ? "Active" : "Aktif"}</span>}
          </Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showGroq ? "text" : "password"}
                placeholder={hasGroqKey ? (lang === "en" ? "Enter new key to replace…" : "Masukkan key baru untuk mengganti…") : "gsk_..."}
                value={keys.groqApiKey}
                onChange={(e) => setKeys({ ...keys, groqApiKey: e.target.value })}
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setShowGroq((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showGroq ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {hasGroqKey && (
              <Button variant="outline" size="sm" className="text-red-500 hover:text-red-600 shrink-0" onClick={() => handleClearKey("groq")}>
                {lang === "en" ? "Remove" : "Hapus"}
              </Button>
            )}
          </div>
          <p className="text-xs text-gray-400">{lang === "en" ? "Get your key at console.groq.com" : "Dapatkan key di console.groq.com"}</p>
        </div>

        {/* Gemini */}
        <div className="space-y-1.5">
          <Label className="flex items-center gap-2">
            Gemini API Key
            {hasGeminiKey && <span className="flex items-center gap-1 text-xs text-green-600 font-normal"><CheckCircle2 className="h-3.5 w-3.5" />{lang === "en" ? "Active" : "Aktif"}</span>}
          </Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showGemini ? "text" : "password"}
                placeholder={hasGeminiKey ? (lang === "en" ? "Enter new key to replace…" : "Masukkan key baru untuk mengganti…") : "AIza..."}
                value={keys.geminiApiKey}
                onChange={(e) => setKeys({ ...keys, geminiApiKey: e.target.value })}
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setShowGemini((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showGemini ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {hasGeminiKey && (
              <Button variant="outline" size="sm" className="text-red-500 hover:text-red-600 shrink-0" onClick={() => handleClearKey("gemini")}>
                {lang === "en" ? "Remove" : "Hapus"}
              </Button>
            )}
          </div>
          <p className="text-xs text-gray-400">{lang === "en" ? "Get your key at aistudio.google.com" : "Dapatkan key di aistudio.google.com"}</p>
        </div>

        <Button
          onClick={handleSaveKeys}
          disabled={savingKeys || (!keys.groqApiKey && !keys.geminiApiKey)}
          className="bg-blue-600 hover:bg-blue-700"
        >
          <Save className="h-4 w-4" />
          {savingKeys ? (lang === "en" ? "Saving…" : "Menyimpan…") : (lang === "en" ? "Save API Keys" : "Simpan API Keys")}
        </Button>
      </div>
    </div>
  );
}
