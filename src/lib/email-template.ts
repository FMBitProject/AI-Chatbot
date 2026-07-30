// Auth mail goes out before anyone has told us which language they read: the
// language toggle lives in localStorage, which the server never sees. So every
// one of these is written twice, English first, rather than guessing wrong at
// the exact moment someone is trying to get into their account.
export type Bilingual = { en: string; id: string };

// Names reach these templates straight from whatever someone typed at signup,
// so they cannot be pasted into the markup raw. Escaping also renders the
// ordinary case correctly: "PT. Maju & Sejahtera" needs to arrive as "&amp;" to
// display as "&". Exported because callers that interpolate a name into a `body`
// string have to escape it before it gets here.
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function authEmail(opts: {
  heading: Bilingual;
  greetingName: string;
  body: Bilingual;
  action?: { url: string; label: Bilingual };
  code?: string;
  note: Bilingual;
}): string {
  // Only the wording repeats. The button and the OTP appear once, so nobody has
  // to wonder whether the second one is a different link or a different code.
  const words = (lang: "en" | "id") => `
    <h3 style="color:#111827;margin:0 0 12px;font-size:18px;">${opts.heading[lang]}</h3>
    <p style="color:#374151;line-height:1.6;margin:0 0 10px;">${lang === "en" ? "Hi" : "Halo"} <strong>${escapeHtml(opts.greetingName)}</strong>,</p>
    <p style="color:#374151;line-height:1.6;margin:0;">${opts.body[lang]}</p>
  `;

  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:40px 24px;background:#f9fafb;">
      <div style="background:white;border-radius:12px;padding:40px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <h2 style="color:#0d9488;margin:0 0 24px;">IntelliBase AI</h2>
        ${words("en")}
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        ${words("id")}
        ${opts.code ? `
          <div style="text-align:center;margin:32px 0;">
            <span style="font-size:36px;font-weight:800;letter-spacing:10px;color:#0d9488;">${opts.code}</span>
          </div>` : ""}
        ${opts.action ? `
          <div style="text-align:center;margin:32px 0;">
            <a href="${opts.action.url}" style="display:inline-block;background:#0d9488;color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">${opts.action.label.en} · ${opts.action.label.id}</a>
          </div>` : ""}
        <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0 0 6px;">${opts.note.en}</p>
        <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0;">${opts.note.id}</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">© 2026 IntelliBase AI</p>
      </div>
    </div>
  `;
}
