import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Every link IntelliBase sends out — cold outreach, WhatsApp forwards, LinkedIn
// — used to render as a bare text card, because the metadata named a title and
// description but never an image. This generates the card image at build time
// (no design asset to keep in sync, no CDN request at share time).
//
// Deliberately not a screenshot of the app: the card is displayed at ~500px
// wide in a chat list, where a dashboard shrinks to unreadable. It has room for
// one sentence, so it carries the promise and the domain, and nothing else.
export const alt =
  "IntelliBase AI — karyawan bertanya, AI menjawab dari dokumen resmi perusahaan";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Indonesian, not English: this is what a forwarded link looks like to the
// people actually being pitched. The page itself switches languages; a
// build-time image cannot, so it speaks the language of the market.
export default async function OpengraphImage() {
  const logo = await readFile(
    join(process.cwd(), "public", "web-app-manifest-192x192.png"),
    "base64",
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          // Flat fills rather than the page's gradient: satori renders
          // gradients, but banding at this size is worse than a solid brand
          // colour, and the dark band is what makes the teal read as a brand
          // rather than a default.
          backgroundColor: "#0A2E2E",
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <img
            src={`data:image/png;base64,${logo}`}
            width={72}
            height={72}
            alt=""
            // The manifest icon carries its own light backplate, which on this
            // dark panel reads as a stray white square unless it is rounded.
            style={{ borderRadius: 16 }}
          />
          <div style={{ display: "flex", fontSize: 38, fontWeight: 700 }}>
            <span style={{ color: "#FFFFFF" }}>IntelliBase</span>
            <span style={{ color: "#5EEAD4" }}>&nbsp;AI</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 62,
              fontWeight: 700,
              color: "#FFFFFF",
              lineHeight: 1.18,
            }}
          >
            <span>Karyawan bertanya. AI menjawab</span>
            <span>dari dokumen resmi perusahaan.</span>
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 28,
              fontSize: 30,
              color: "#99F6E4",
              lineHeight: 1.4,
            }}
          >
            SOP, regulasi HR, panduan IT, clinical pathway — dijawab dalam detik.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 26,
            color: "#5EEAD4",
          }}
        >
          <span>intellibaseai.com</span>
          <span>Gratis untuk tim kecil · Setup 10 menit</span>
        </div>
      </div>
    ),
    size,
  );
}
