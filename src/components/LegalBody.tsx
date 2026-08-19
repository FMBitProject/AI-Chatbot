"use client";

/**
 * The shared body renderer for /terms and /privacy.
 *
 * Both pages used to render `<p>{section.body}</p>`, which is why every clause
 * read with exactly the same weight — including the two a customer actually has
 * to act on before uploading anything (our Gemini account is on the free tier;
 * a paid plan can connect its own provider keys to escape it). A reader who
 * misses those has consented to something they would not have consented to,
 * which is the one failure mode a disclosure page has.
 *
 * So the content carries two lightweight markers instead of a markup library:
 *
 *   - `**...**` inside a body string renders as <strong>. Deliberately the only
 *     inline syntax supported — react-markdown is already a dependency, but
 *     handing a legal page a full markdown parser means a stray underscore in
 *     "PP_71" silently italicises half a clause.
 *   - `highlight: true` on a section lifts the whole clause into a bordered
 *     block, for the sections that are not merely important but *decision-
 *     changing*: what leaves the system, and what the customer can do about it.
 *
 * Highlighting is a scarce resource: three or four blocks per document read as
 * "these are the ones"; ten read as decoration and the reader skims all of them.
 */

export type LegalSection = {
  readonly title: string;
  readonly body: string;
  /** Lift into a bordered block — reserve for clauses that change a decision. */
  readonly highlight?: boolean;
};

/** `**bold**` -> <strong>, everything else verbatim. */
function emphasise(body: string) {
  // Split on the capturing group so the delimited runs land on odd indices —
  // no state machine, and unmatched `**` simply stays literal text rather than
  // swallowing the rest of the clause.
  return body.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 === 1 ? <strong key={i} className="font-semibold text-gray-900">{part}</strong> : part
  );
}

export function LegalBody({ sections }: { sections: readonly LegalSection[] }) {
  return (
    <div className="space-y-8 text-sm leading-relaxed text-gray-700">
      {sections.map((s) => (
        <div
          key={s.title}
          className={s.highlight ? "rounded-lg border border-teal-200 bg-teal-50/60 p-5" : undefined}
        >
          <h2 className="font-semibold text-gray-900 text-base mb-2">{s.title}</h2>
          <p>{emphasise(s.body)}</p>
        </div>
      ))}
    </div>
  );
}
