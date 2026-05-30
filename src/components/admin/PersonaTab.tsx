"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/use-toast";
import { Sparkles, Bot, Save } from "lucide-react";
import { LogoIcon } from "@/components/Logo";
import { admin as adminT } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";

interface PersonaData {
  aiName: string;
  aiGreeting: string;
  aiPersonality: string;
}

export function PersonaTab({ lang = "id" }: { lang?: Lang }) {
  const T = adminT[lang];
  const [form, setForm] = useState<PersonaData>({ aiName: "IntelliBase AI", aiGreeting: "", aiPersonality: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/persona")
      .then((r) => r.json())
      .then((d: Partial<PersonaData>) => setForm({ aiName: d.aiName ?? "IntelliBase AI", aiGreeting: d.aiGreeting ?? "", aiPersonality: d.aiPersonality ?? "" }))
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
      toast({ title: "Persona AI berhasil disimpan." });
    } catch {
      toast({ variant: "destructive", title: "Gagal menyimpan persona." });
    } finally {
      setSaving(false);
    }
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
    </div>
  );
}
