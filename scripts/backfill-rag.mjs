// One-off backfill after the pgvector + boundary-aware-chunking migration.
// For every existing document it: recovers the full text (from documents.raw_text
// if present, otherwise by stitching the old overlapping chunks back together),
// re-chunks it with the new chunker, re-embeds at 1536 dims, and replaces the
// document's chunks with rows that populate the native `embedding` vector column.
//
// Safe to re-run. Run against a NON-PRODUCTION Neon branch first.
//   DATABASE_URL=... GOOGLE_GENERATIVE_AI_API_KEY=... node scripts/backfill-rag.mjs
import { neon } from "@neondatabase/serverless";
import { embedMany } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";

// --- config from env, with .env.local fallback for local runs ---
function fromEnvFile(key) {
  try {
    const file = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of file.split("\n")) {
      if (line.startsWith("#") || !line.includes("=")) continue;
      const idx = line.indexOf("=");
      if (line.slice(0, idx).trim() === key) return line.slice(idx + 1).trim();
    }
  } catch {}
  return undefined;
}
const DATABASE_URL = process.env.DATABASE_URL || fromEnvFile("DATABASE_URL");
const GEMINI_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY || fromEnvFile("GOOGLE_GENERATIVE_AI_API_KEY");
if (!DATABASE_URL) throw new Error("DATABASE_URL not set");
if (!GEMINI_KEY) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY not set");

const sql = neon(DATABASE_URL);
const google = createGoogleGenerativeAI({
  apiKey: GEMINI_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta",
});

// --- chunker: kept in sync with src/lib/chunker.ts ---
const CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 200;
const MIN_CHUNK = 50;
function splitAtoms(text) {
  const atoms = [];
  for (const para of text.split(/(?<=\n\n)/)) {
    if (para.length <= CHUNK_SIZE) {
      if (para.length > 0) atoms.push(para);
      continue;
    }
    for (const sentence of para.split(/(?<=[.!?]\s)|(?<=\n)/)) {
      if (sentence.length === 0) continue;
      if (sentence.length <= CHUNK_SIZE) atoms.push(sentence);
      else for (let i = 0; i < sentence.length; i += CHUNK_SIZE) atoms.push(sentence.slice(i, i + CHUNK_SIZE));
    }
  }
  return atoms;
}
function chunkText(text) {
  const atoms = splitAtoms(text.replace(/\r\n/g, "\n"));
  const chunks = [];
  let current = "";
  for (const atom of atoms) {
    if (current === "" || (current + atom).length <= CHUNK_SIZE) {
      current += atom;
      continue;
    }
    chunks.push(current);
    current = current.slice(Math.max(0, current.length - CHUNK_OVERLAP)) + atom;
    while (current.length > CHUNK_SIZE) {
      chunks.push(current.slice(0, CHUNK_SIZE));
      current = current.slice(CHUNK_SIZE - CHUNK_OVERLAP);
    }
  }
  if (current) chunks.push(current);
  return chunks.map((c) => c.trim()).filter((c) => c.length > MIN_CHUNK);
}

// Stitch old overlapping chunks back into approximate source text.
function mergeOverlap(acc, next) {
  if (!acc) return next;
  const max = Math.min(acc.length, next.length, 400);
  for (let k = max; k > 0; k--) {
    if (acc.slice(acc.length - k) === next.slice(0, k)) return acc + next.slice(k);
  }
  return acc + "\n" + next;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Gemini free tier allows ~100 embed requests/minute and the SDK issues one
// request per value, so we embed in small batches and pace between them,
// retrying on 429 for the delay the API asks for.
async function embedAll(texts) {
  const BATCH = 15;
  const out = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH).map((t) => t.replace(/\n/g, " "));
    let done = false;
    for (let attempt = 0; attempt < 6 && !done; attempt++) {
      try {
        const { embeddings } = await embedMany({
          model: google.embedding("gemini-embedding-001"),
          values: batch,
          maxRetries: 0,
          providerOptions: { google: { outputDimensionality: 1536, taskType: "RETRIEVAL_DOCUMENT" } },
        });
        out.push(...embeddings);
        done = true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const m = msg.match(/retryDelay"?:?\s*"?(\d+)s/) || msg.match(/retry in (\d+)/i);
        const delay = (m ? parseInt(m[1], 10) : 30) + 3;
        console.log(`    rate-limited, waiting ${delay}s (attempt ${attempt + 1}/6)...`);
        await sleep(delay * 1000);
      }
    }
    if (!done) throw new Error("embedding failed after retries");
    if (i + BATCH < texts.length) await sleep(12000); // pace: ~15 per 12s < 100/min
  }
  return out;
}

async function main() {
  const docs = await sql`SELECT id, company_id, raw_text FROM documents ORDER BY created_at`;
  console.log(`Found ${docs.length} document(s).`);

  for (const doc of docs) {
    // Resumable: skip documents already fully migrated (raw_text saved and no
    // chunk left without an embedding).
    if (doc.raw_text) {
      const [{ pending }] = await sql`
        SELECT count(*)::int AS pending FROM document_chunks
        WHERE document_id = ${doc.id} AND embedding IS NULL`;
      const [{ total }] = await sql`
        SELECT count(*)::int AS total FROM document_chunks WHERE document_id = ${doc.id}`;
      if (total > 0 && pending === 0) {
        console.log(`  [skip] ${doc.id}: already migrated`);
        continue;
      }
    }

    const oldChunks = await sql`
      SELECT text FROM document_chunks WHERE document_id = ${doc.id} ORDER BY chunk_index`;

    let fullText = doc.raw_text;
    if (!fullText) {
      fullText = oldChunks.reduce((acc, c) => mergeOverlap(acc, c.text), "");
    }
    if (!fullText || fullText.trim().length < MIN_CHUNK) {
      console.log(`  [skip] ${doc.id}: no recoverable text`);
      continue;
    }

    const chunks = chunkText(fullText);
    if (chunks.length === 0) {
      console.log(`  [skip] ${doc.id}: produced 0 chunks`);
      continue;
    }

    const embeddings = await embedAll(chunks);

    // Persist the recovered text BEFORE deleting the old chunks, so the source
    // text is never lost if the run is interrupted mid-document.
    if (!doc.raw_text) {
      await sql`UPDATE documents SET raw_text = ${fullText} WHERE id = ${doc.id}`;
    }

    // Replace this document's chunks. (Per-doc; the FK cascade is on documents,
    // so we delete chunks explicitly here.)
    await sql`DELETE FROM document_chunks WHERE document_id = ${doc.id}`;
    for (let i = 0; i < chunks.length; i++) {
      const literal = `[${embeddings[i].join(",")}]`;
      await sql`
        INSERT INTO document_chunks (id, document_id, company_id, text, embedding, chunk_index)
        VALUES (${randomUUID()}, ${doc.id}, ${doc.company_id}, ${chunks[i]}, ${literal}::vector, ${i})`;
    }
    console.log(`  [ok]   ${doc.id}: ${oldChunks.length} → ${chunks.length} chunks re-embedded`);
  }

  console.log("Backfill complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
