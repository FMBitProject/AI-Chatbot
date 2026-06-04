"use client";
import { CheckCircle2, Circle } from "lucide-react";
import { checkPassword } from "@/lib/password";

interface Props {
  password: string;
  lang?: "id" | "en";
}

export function PasswordRequirements({ password, lang = "id" }: Props) {
  if (!password) return null;
  const c = checkPassword(password);

  const rules = [
    { key: "minLength", met: c.minLength, label: lang === "en" ? "Minimum 8 characters" : "Minimal 8 karakter" },
    { key: "hasUppercase", met: c.hasUppercase, label: lang === "en" ? "At least 1 uppercase letter" : "Minimal 1 huruf kapital" },
    { key: "hasNumber", met: c.hasNumber, label: lang === "en" ? "At least 1 number" : "Minimal 1 angka" },
    { key: "hasSpecial", met: c.hasSpecial, label: lang === "en" ? "At least 1 special character (!@#$...)" : "Minimal 1 karakter spesial (!@#$...)" },
  ];

  return (
    <ul className="space-y-1 mt-1">
      {rules.map((r) => (
        <li key={r.key} className={`flex items-center gap-1.5 text-xs ${r.met ? "text-green-600" : "text-gray-400"}`}>
          {r.met
            ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            : <Circle className="h-3.5 w-3.5 shrink-0" />}
          {r.label}
        </li>
      ))}
    </ul>
  );
}
