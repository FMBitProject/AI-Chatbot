// The grounding contract, in one place, for every channel that answers from
// documents.
//
// There are four: the chat UI, the public API, and the two Slack entry points.
// They had four different versions of this rule, and three of them were a
// single sentence — "Answer ONLY based on the provided document context. If not
// found, say so clearly." That sentence is not wrong, it is just not enough:
// a model can obey it completely, report that the documents do not cover the
// question, and then keep writing. Which is what happened, in the chat UI, to a
// question about a drug: the answer said the documents did not describe the
// therapy, then supplied starting, maintenance and maximum doses in mg/day from
// its own knowledge, formatted as a bullet list indistinguishable from anything
// quoted.
//
// That is the specific harm these rules are shaped around. The product's own
// FAQ promises the opposite in as many words — "kalau tidak ada dokumen yang
// relevan, AI menyatakan tidak menemukannya, bukan menebak dari pengetahuan
// umum internet" — and the customers most likely to test it are hospitals and
// clinics, whose documents are clinical pathways.
//
// Written as numbered rules 1-4 so the chat prompt can continue at 5 with its
// own formatting and tone rules. The shorter channels append it whole.
export const GROUNDING_RULES = `1. GROUNDING (ABSOLUTE, OVERRIDES EVERY OTHER RULE EXCEPT THE LANGUAGE RULE): Answer only from the document context provided. What you happen to know about the subject is not a source. It may not appear in the answer as background, as context, as "generally", as "commonly", as a rule of thumb, as a typical range, or as a helpful addition after a caveat.
2. If the context does not answer the question, say so with the exact "not found" message for the language you are answering in — and then STOP. Do not continue with what the answer usually is, what is generally true, what other sources say, or what the reader probably meant. Ending there is a correct answer. A fluent paragraph drawn from your own knowledge is a wrong one, and the reader has no way to tell the two apart.
3. NEVER state a number that is not written in the context: no dose, dosage range, frequency, threshold, percentage, price, deadline or date. This is the rule that causes real harm when broken — a plausible figure invented here is indistinguishable from one taken from an official document. If a figure IS in the context, reproduce it exactly, with its unit and every qualifier attached to it.
4. A partial answer is allowed and is better than silence, but every sentence in it must trace to the context. If the context covers part of the question, answer that part, then state plainly which part the documents do not cover — without filling the gap.`;

// Repeated at the very end of a prompt, immediately before the question.
//
// The grounding rules are stated thousands of tokens earlier — behind the
// persona, the catalogue and every retrieved excerpt — and the instruction
// nearest the question is the one that survives. This is a reread instruction
// rather than a restatement, because the failure was never the model forgetting
// the rule; it was the model following it and then continuing past it.
export const GROUNDING_REMINDER =
  "FINAL CHECK — before sending, reread your answer: every fact, name and number in it must appear "
  + "in the document context above. Delete anything that does not, even if you are confident it is "
  + "correct and even if it is prefaced as general information. If that leaves nothing to say, send "
  + "only the not-found message.";

// Sampling temperature for every answer generated from documents.
//
// These calls previously ran at the provider's default, which is tuned for
// fluent, varied prose. That is the wrong setting for the only job they have:
// repeating what a document says. Variety here does not produce a better
// answer, it produces a different one, and the difference is precisely the
// invented connective tissue this file exists to stop. Not zero, because the
// model still has to write readable Indonesian and greedy decoding makes it
// repeat itself.
export const RAG_TEMPERATURE = 0.2;

// How an answer reads, for the same four channels the rules above govern.
//
// Separate from GROUNDING_RULES because the two are different kinds of rule and
// only one of them is safety-critical. Everything above decides what may appear
// in an answer; everything here decides how it is worded once that question is
// settled. Keeping them apart is what makes it safe to loosen the tone later
// without anyone having to reread the grounding contract to check what moved.
//
// The problem it fixes: a chat answer to "untuk identifikasi pasien bagaimana
// caranya" came back as five bold headings and eleven bullets — a faithful,
// entirely grounded reformatting of the SOP, and nothing a colleague would ever
// say out loud. The old rules asked for exactly that. They specified a "formal,
// professional tone appropriate for a corporate internal knowledge base" (a
// description of an archive, not of a conversation) and then asked for bold
// headings, bullets and numbered lists as the default shape of every answer,
// with nothing anywhere instructing the model to address the person asking.
//
// Unnumbered on purpose. The chat prompt continues GROUNDING_RULES at 5 with
// its own numbered rules, while the three shorter channels append prose; a
// block with no numbers of its own drops into either without renumbering.
//
// Deliberately not paired with a temperature change. Warmth here comes from
// instructions, which are auditable, rather than from sampling, which is not:
// RAG_TEMPERATURE stays where it is precisely because the invented connective
// tissue it holds back is the same connective tissue a friendlier voice invites.
export const ANSWER_STYLE = `VOICE AND SHAPE (this section changes how an answer is worded, never what it may contain — where it disagrees with rules 1-4 above, those win):
- Open by naming where the answer comes from, as an ordinary sentence rather than a header: "Menurut SOP Identifikasi Pasien, ..." / "Berdasarkan Kebijakan Cuti, ...". Use the document title exactly as it is written above the excerpt you are using. If the excerpts carry no title, open without one — never invent or guess a title, and never name a document you did not quote.
- Write to the person asking. Aim for a senior colleague who knows the document well and is explaining it to someone on the same shift: warm, plain, professional. Not stiff, not chatty. No emoji, no exclamation marks, no flattery about the question.
- Let the question decide the shape. A definition, a yes/no, a single figure or a one-step answer is one to three plain sentences: do not inflate it into headings and bullets because the source document is formatted that way. A procedure that really is a sequence of four or more steps keeps its numbered list, but introduce it with a sentence of your own ("Prosedurnya ada lima tahap:") and write each step as a sentence, not as a bold heading with sub-bullets under it. Between those two cases, prefer prose.
- Keep the document's own words for the things that must not drift — terms, names, numbers, and every qualifier attached to a number — and use your own for the sentences that connect them.
- The not-found message is the exception to all of the above. When the documents do not answer the question, send that exact sentence by itself: no opener naming a document, no apology in your own words, no offer to help further, nothing before it and nothing after it.`;

// An invitation to keep going in app chat, which has stored conversation history.
//
// Not part of ANSWER_STYLE: /api/v1/query answers an integration, the public demo
// answers standalone sample questions, and Slack does not replay prior turns.
// None of those channels can resolve an acceptance such as "yes, explain more".
//
// The "only when the documents hold more" clause is what stops this from
// reopening the hole the grounding rules close. An unbounded offer to elaborate
// is an offer to elaborate from memory: a model that has exhausted the context
// and is asked to suggest a follow-up will happily propose one it can only
// answer by inventing, and the reader has no way to know that until they accept.
export const FOLLOW_UP_OFFER =
  "- Close with one short offer to go further, and pick what to offer from the OFFERABLE DETAILS list below. Say "
  + "what that entry is ABOUT, in your own natural phrasing — never paste the line as written. The entry \"Gelang "
  + "tambahan dipasang bila ada risiko khusus\" becomes \"Mau saya jelaskan soal gelang tambahan untuk risiko "
  + "khusus?\", not \"Mau saya perinci Gelang tambahan dipasang bila ada risiko khusus?\". Nothing outside that list "
  + "may be offered, however obviously a document like this one ought to contain it: an offer the excerpts cannot "
  + "honour costs the reader a turn and comes back \"not found\". If the list is absent or empty, or nothing in it is "
  + "worth offering, end on the answer with no offer at all. One at most, one line, and never after a not-found "
  + "message.";

// The list of things a closing offer is allowed to be about.
//
// FOLLOW_UP_OFFER used to state the rule and trust the model to apply it:
// offer only what the excerpts hold. The primary Groq model (a small one)
// obeyed the shape of that instruction and not its substance — after an answer
// about what each wristband colour means, it offered "Mau saya perinci prosedur
// penanganan pasien DNR?", a procedure that appears nowhere in the excerpt. The
// offer is plausible, adjacent, and exactly the kind of thing a document like
// that *would* contain, which is why a model reaches for it and why a reader
// accepts it. Accepting costs a turn and comes back "tidak ditemukan".
//
// Tightening the sentence was tried first and changed nothing. So the rule stops
// being a rule and becomes a menu: the excerpts are reduced to a list of short
// phrases taken verbatim from them, and the offer has to be about one of those.
// Choosing from a closed list is a task a small model can actually do; judging
// whether something it just thought of appears in a wall of text is not.
//
// Fail-closed, and this is the half that matters: when nothing can be extracted,
// the list is empty and the instruction becomes "do not offer". No list, no
// offer — never "no list, use your judgement".
//
// Extraction keeps complete short sentences instead of truncating their leading
// clauses: a discarded tail can contain "tidak dibahas" and reverse the meaning.
// Long or explicitly negative sentences are omitted; offers are optional.
// This remains a conservative text heuristic, not a semantic proof that a topic
// is answerable. The full excerpts and grounding rules still govern the answer.

/** Leading list markers ("1.", "-", "•") and citation markers ("[1]"). */
const LEAD_NOISE = /^(?:\[\d+\]\s*)?(?:\d+[.)]\s*|[-*•]\s*)?/;
const NEGATED_DETAIL = /\b(?:tidak|belum|bukan|jangan|not|never|no|unavailable|cannot)\b|\b\w+n['’]t\b/i;

// Includes the menu header and separators. Chat reserves this exact amount
// before choosing excerpts; a word-count cap alone cannot bound prompt size.
export const MAX_OFFERABLE_BLOCK_CHARS = 1_000;

/**
 * Complete short sentences/headings from the excerpts that a follow-up offer may
 * be about.
 *
 * Deduplicated case-insensitively and capped, because this goes into every
 * prompt: the list is a menu, not a second copy of the context. Markdown
 * headings come first when a document has them — they are what the author
 * themselves considered a topic — and complete short sentences fill the rest.
 */
export function offerableDetails(excerpts: { text: string }[], max = 8): string[] {
  const seen = new Set<string>();
  const headings: string[] = [];
  const clauses: string[] = [];

  const add = (into: string[], raw: string) => {
    const phrase = raw.replace(LEAD_NOISE, "").replace(/\s+/g, " ").trim().replace(/[.,;:]+$/, "");
    const words = phrase.split(" ").filter(Boolean);
    // Never remove a trailing qualifier or negation just to fit the menu.
    if (words.length < 3 || words.length > 8 || NEGATED_DETAIL.test(phrase)) return;
    const key = phrase.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    into.push(phrase);
  };

  for (const excerpt of excerpts) {
    const text = (excerpt.text ?? "").replace(/\r\n?/g, "\n");
    for (const line of text.split("\n")) {
      const heading = /^#{1,6}\s+(.*)$/.exec(line.trim());
      if (heading) add(headings, heading[1]);
    }
    // Preserve commas, colons and parentheses: the text after them can reverse
    // what the opening clause appears to say.
    // TODO: Heading diproses lagi sebagai kalimat dengan marker ##, sehingga duplikat dapat menghabiskan slot menu.
    for (const sentence of text.split(/(?<=[.!?])\s+|\n+/)) {
      if (sentence.trim().length > 0) add(clauses, sentence);
    }
  }

  return [...headings, ...clauses].slice(0, max);
}

/**
 * The menu as it appears in a prompt, or "" when there is nothing to offer.
 *
 * The empty string is not a degenerate case to be tidied away later — it is how
 * "this answer gets no closing offer" is expressed, and FOLLOW_UP_OFFER is
 * written to read correctly without this section present.
 */
export function offerableDetailsBlock(details: string[]): string {
  if (details.length === 0) return "";
  const header = "OFFERABLE DETAILS — where the excerpts above go on to say more. This list exists for ONE purpose: to "
    + "choose the closing offer from. It is not extra context, it answers nothing, and no line of it may be copied "
    + "into the body of the answer.\n";
  const lines: string[] = [];
  let length = header.length;
  for (const detail of details) {
    const line = `- ${detail}`;
    const addedLength = line.length + (lines.length > 0 ? 1 : 0);
    // Skip whole entries, never cut a sentence midway to make it fit.
    if (length + addedLength > MAX_OFFERABLE_BLOCK_CHARS) continue;
    lines.push(line);
    length += addedLength;
  }
  return lines.length > 0 ? header + lines.join("\n") : "";
}
