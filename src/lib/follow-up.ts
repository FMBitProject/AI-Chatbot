// Whether a question can be searched for on its own, and what to search for
// when it cannot.
//
// The retriever embeds the question and nothing else. That is right for the
// first question of a session and wrong for the second one: "kalau yang ungu?"
// is a perfectly clear thing to ask a colleague who just explained the wristband
// colours, and a meaningless thing to hand a vector search. Four words, none of
// them naming the topic, so the nearest chunks are whatever the corpus happens
// to keep near the word "ungu" — and the reader gets "informasi tidak ditemukan"
// for a question the documents answer plainly. That failure is what makes a chat
// feel like a search box: every question has to be asked from scratch.
//
// So a question that leans on the one before it is searched for together with
// the one before it. Detection is a heuristic and is deliberately conservative
// in one direction only: a missed follow-up costs what we already have today,
// while a false positive drags an unrelated previous question into the embedding
// and can spoil retrieval for a question that was fine on its own.
//
// No imports, on purpose — that is what lets scripts/rag.test.mts run this file
// directly under --experimental-strip-types, with no alias resolution and no
// database (see AGENTS.md).

// Words that point at something already said rather than naming it.
//
// Indonesian and English together because one workspace uses both, often in the
// same session. Each one is anchored as a whole word: "itu" must not match
// inside "institusi", and "then" must not match inside "strengthen".
//
// What is deliberately NOT here: the suffix "-nya" ("dosisnya", "prosedurnya").
// It is the most common referential marker in Indonesian and also appears in
// ordinary standalone nouns ("biayanya berapa?" is a complete question), so it
// would fire on nearly everything and turn "conservative" into "always".
const REFERENTIAL = new RegExp(
  "\\b(" + [
    // Indonesian
    "itu", "tersebut", "tadi", "sebelumnya", "kalau", "kalo", "bagaimana dengan",
    "gimana dengan", "gimana kalau", "lalu", "terus", "selanjutnya", "lainnya",
    "apa lagi", "berikutnya", "yang mana", "sama juga", "bagaimana jika",
    // English
    "what about", "how about", "and the", "and what", "that one", "those",
    "the same", "then what", "next one", "any others", "what else",
  ].join("|") + ")\\b",
  "i",
);

/** Words, ignoring punctuation and repeated spaces. */
function wordCount(text: string): number {
  const cleaned = text.replace(/[^\p{L}\p{N}\s]+/gu, " ").trim();
  return cleaned.length === 0 ? 0 : cleaned.split(/\s+/).length;
}

/**
 * Whether this question should be searched for together with the previous one.
 *
 * Two independent signals, either of which is enough:
 *
 * - Four words or fewer. A question that short is almost never self-contained
 *   ("kalau yang ungu?", "berapa lama?", "and the red one?") and the few that
 *   are ("apa itu DNR?") lose nothing by being searched alongside the question
 *   before them, because the topic is the same either way. Five was the first
 *   try and it was one too many: "apa isi SOP identifikasi pasien?" is exactly
 *   five words and names its own topic.
 * - A referential word, in a question still short enough to be leaning on
 *   something. "Bagaimana dengan pasien anak untuk prosedur tersebut?" is
 *   eight words and unanswerable alone; "Kalau karyawan mengundurkan diri,
 *   bagaimana prosedur offboarding dan berapa lama akses emailnya dicabut?"
 *   also contains "kalau" and needs nothing from the turn before it. The word
 *   cap is what separates the two, and it is the reason a referential word on
 *   its own is not enough.
 *
 * Returns false when there is nothing to lean on, which is what makes the first
 * question of every session behave exactly as it does today.
 */
export function isFollowUpQuestion(question: string, previousQuestion: string | null | undefined): boolean {
  if (!previousQuestion || previousQuestion.trim().length === 0) return false;
  const q = question.trim();
  if (q.length === 0) return false;
  const words = wordCount(q);
  return words <= 4 || (words <= 12 && REFERENTIAL.test(q));
}

/**
 * The text to embed for retrieval — the question itself, or the question with
 * its predecessor attached.
 *
 * The previous question goes FIRST and the current one last, so that the
 * sentence the reader actually asked is the one closest to the end. It is also
 * truncated: a long previous question attached to a short current one would
 * dominate the embedding it is only supposed to disambiguate.
 *
 * This affects retrieval ONLY. The prompt still receives the real question, and
 * the answer still has to come from the excerpts — searching with more context
 * finds better excerpts, it does not license a broader answer.
 */
export function retrievalQueryFor(question: string, previousQuestion: string | null | undefined): string {
  if (!isFollowUpQuestion(question, previousQuestion)) return question;
  return `${previousQuestion!.trim().slice(0, 200)}\n${question.trim()}`;
}
