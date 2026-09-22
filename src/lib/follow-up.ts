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

// Length alone does not establish a reference: "Berapa jatah cuti?" names
// its own topic. These complete elliptical forms do need the prior topic.
const ELLIPTICAL = /^(?:berapa lama|berapa banyak|mengapa|kenapa|how long|how many|why)[?!.\s]*$/i;
// "itu" in a definition introduces the named topic rather than referring back.
const NAMED_DEFINITION = /^apa\s+itu\s+\p{L}/iu;

/** Words, ignoring punctuation and repeated spaces. */
function wordCount(text: string): number {
  const cleaned = text.replace(/[^\p{L}\p{N}\s]+/gu, " ").trim();
  return cleaned.length === 0 ? 0 : cleaned.split(/\s+/).length;
}

/**
 * Whether this question should be searched for together with the previous one.
 *
 * A recognized elliptical question or a referential word, in a question still
 * short enough to be leaning on something. "Bagaimana dengan pasien anak untuk
 * prosedur tersebut?" is unanswerable alone; "Kalau karyawan mengundurkan diri,
 * bagaimana prosedur offboarding dan berapa lama akses emailnya dicabut?"
 * also contains "kalau" and needs nothing from the turn before it. The word
 * cap separates the two: a referential word on its own is not enough.
 *
 * Returns false when there is nothing to lean on, which is what makes the first
 * question of every session behave exactly as it does today.
 */
export function isFollowUpQuestion(question: string, previousQuestion: string | null | undefined): boolean {
  if (!previousQuestion || previousQuestion.trim().length === 0) return false;
  const q = question.trim().replace(/\s+/g, " ");
  if (q.length === 0) return false;
  const words = wordCount(q);
  if (words === 0 || NAMED_DEFINITION.test(q)) return false;
  return words <= 12 && (REFERENTIAL.test(q) || ELLIPTICAL.test(q));
}

/**
 * The text to embed for retrieval — the question itself, or a follow-up with
 * its topic anchor and immediate predecessor attached.
 *
 * User questions must be supplied oldest-first. Walk back only through the
 * current follow-up chain: a newly named topic resets the anchor. Keep at most
 * the anchor and latest question, each bounded to 200 characters, so long
 * sessions cannot overwhelm the current question or pull in older topics.
 * A single previous question is still accepted for callers without history.
 *
 * This affects retrieval ONLY. The prompt still receives the real question, and
 * the answer still has to come from the excerpts — searching with more context
 * finds better excerpts, it does not license a broader answer.
 */
export function retrievalQueryFor(
  question: string,
  history: string | readonly string[] | null | undefined,
): string {
  const questions = (typeof history === "string" ? [history] : history ?? [])
    .map((q) => q.trim())
    .filter(Boolean);
  const previousQuestion = questions.at(-1);
  if (!previousQuestion || !isFollowUpQuestion(question, previousQuestion)) return question;

  let anchorIndex = questions.length - 1;
  while (anchorIndex > 0 && isFollowUpQuestion(questions[anchorIndex], questions[anchorIndex - 1])) {
    anchorIndex--;
  }
  const context = [...new Set([
    questions[anchorIndex].slice(0, 200),
    previousQuestion.slice(0, 200),
  ])];
  return [...context, question.trim()].join("\n");
}
