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
