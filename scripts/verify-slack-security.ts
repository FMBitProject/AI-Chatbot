/**
 * Behavioural checks for the Slack webhook security controls.
 *
 * Run with `npx tsx --env-file=.env.local scripts/verify-slack-security.ts`.
 *
 * Not a test suite — the repo has no runner — but these four functions are
 * pure, dependency-free and now load-bearing for security, which makes them the
 * cheapest things in the codebase to keep honest. Checked in rather than run
 * once and deleted, so a later edit has something to fail against instead of a
 * claim in a pull request that the checks passed at the time.
 */
import { createHmac } from "crypto";
import { escapeSlackText, verifySlackSignature, readSlackBody, MAX_SLACK_BODY_BYTES } from "@/lib/slack";
import { formatSlackAnswer } from "@/lib/slack-answer";

let failures = 0;
function check(name: string, passed: boolean) {
  if (!passed) failures++;
  console.log(`${passed ? "pass" : "FAIL"}  ${name}`);
}

// --- escapeSlackText --------------------------------------------------------
// The three characters are markup in Slack's mrkdwn, so leaving them in place
// lets a question published in_channel carry a link attributed to this app.
check("labelled hyperlink is defused",
  escapeSlackText("<https://evil.example|Klik di sini>") === "&lt;https://evil.example|Klik di sini&gt;");
check("channel broadcast is defused",
  escapeSlackText("<!channel>") === "&lt;!channel&gt;");
check("user mention is defused",
  escapeSlackText("<@U012345>") === "&lt;@U012345&gt;");
check("ampersand is escaped first, so escapes are not re-escaped",
  escapeSlackText("a & <b>") === "a &amp; &lt;b&gt;");
check("plain text is untouched",
  escapeSlackText("Cuti minimal 2 minggu sebelumnya") === "Cuti minimal 2 minggu sebelumnya");
check("our own mrkdwn survives (asterisks are not escaped)",
  escapeSlackText("*Jawaban:*") === "*Jawaban:*");
// Documented consequence, not a desired one: if the Slack app's "Escape
// channels, users, and links" setting is ever turned on, Slack pre-escapes the
// text and this escapes it again. Asserted so the day it changes, this file
// says why the output looks wrong.
check("KNOWN: pre-escaped input is escaped twice (Slack escape setting must stay OFF)",
  escapeSlackText("&lt;b&gt;") === "&amp;lt;b&amp;gt;");

// --- formatSlackAnswer ------------------------------------------------------
check("sources render as an escaped footer",
  formatSlackAnswer({ text: "Cuti 12 hari.", sources: ["SOP_Cuti.pdf"] })
    === "Cuti 12 hari.\n\n_Sumber: SOP_Cuti.pdf_");
check("a document named like markup cannot inject it",
  formatSlackAnswer({ text: "Jawaban.", sources: ["<!channel>.pdf"] })
    === "Jawaban.\n\n_Sumber: &lt;!channel&gt;.pdf_");
check("no sources means no footer",
  formatSlackAnswer({ text: "Maaf, informasi tidak ditemukan.", sources: [] })
    === "Maaf, informasi tidak ditemukan.");
check("answer text is escaped too",
  formatSlackAnswer({ text: "<!here> lihat ini", sources: [] }) === "&lt;!here&gt; lihat ini");

// --- verifySlackSignature ---------------------------------------------------
const SECRET = "test-signing-secret";
const sign = (ts: string, body: string) =>
  "v0=" + createHmac("sha256", SECRET).update(`v0:${ts}:${body}`).digest("hex");
const now = Math.floor(Date.now() / 1000);
const body = "team_id=T1&text=halo";

// The one that matters most: tightening the guard must not reject real traffic.
check("a current, correctly signed request is accepted",
  verifySlackSignature(SECRET, sign(String(now), body), String(now), body));
check("a six-minute-old request is rejected (replay window)",
  !verifySlackSignature(SECRET, sign(String(now - 360), body), String(now - 360), body));
check("a far-future timestamp is rejected",
  !verifySlackSignature(SECRET, sign(String(now + 99999), body), String(now + 99999), body));
check("a missing timestamp is rejected",
  !verifySlackSignature(SECRET, sign("", body), "", body));
check("a non-numeric timestamp is rejected",
  !verifySlackSignature(SECRET, sign("abc", body), "abc", body));
check("a tampered body is rejected",
  !verifySlackSignature(SECRET, sign(String(now), body), String(now), body + "X"));
check("the wrong secret is rejected",
  !verifySlackSignature("other-secret", sign(String(now), body), String(now), body));
check("a malformed signature is rejected without throwing",
  !verifySlackSignature(SECRET, "v0=deadbeef", String(now), body));

// --- readSlackBody ----------------------------------------------------------
// Counted while draining, so a sender cannot buy itself room by lying about
// Content-Length or omitting it — which is what the first version of this
// check, reading the header alone, allowed.
const post = (payload: string, headers: Record<string, string> = {}) =>
  new Request("https://example.invalid/api/slack/command", { method: "POST", body: payload, headers });

async function bodyChecks() {
  check("a normal body is returned intact",
    (await readSlackBody(post(body))) === body);

  const oversize = "x".repeat(MAX_SLACK_BODY_BYTES + 1);
  check("an oversized body is refused",
    (await readSlackBody(post(oversize))) === null);
  check("an oversized body is refused even while under-reporting Content-Length",
    (await readSlackBody(post(oversize, { "content-length": "10" }))) === null);
  check("a body at exactly the limit is accepted",
    (await readSlackBody(post("x".repeat(MAX_SLACK_BODY_BYTES))))?.length === MAX_SLACK_BODY_BYTES);
  check("multi-byte characters survive the manual chunk join",
    (await readSlackBody(post("pertanyaan é 中文 🎉"))) === "pertanyaan é 中文 🎉");

  console.log(failures === 0 ? "\nall checks passed" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

bodyChecks();
