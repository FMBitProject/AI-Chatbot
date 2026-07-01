const CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 200;
const MIN_CHUNK = 50;

// Break text into "atoms" that never exceed CHUNK_SIZE, preferring natural
// boundaries: first paragraphs (\n\n), then sentences / lines, and only as a
// last resort a hard character cut. Delimiters stay attached to each atom so
// the reassembled chunk keeps the document's original punctuation and spacing.
function splitAtoms(text: string): string[] {
  const atoms: string[] = [];

  // Split after each blank line, keeping the "\n\n" on the preceding paragraph.
  for (const para of text.split(/(?<=\n\n)/)) {
    if (para.length <= CHUNK_SIZE) {
      if (para.length > 0) atoms.push(para);
      continue;
    }
    // Oversized paragraph: split after sentence-ending punctuation + whitespace,
    // or after a single newline.
    for (const sentence of para.split(/(?<=[.!?]\s)|(?<=\n)/)) {
      if (sentence.length === 0) continue;
      if (sentence.length <= CHUNK_SIZE) {
        atoms.push(sentence);
      } else {
        // Pathological (no punctuation, e.g. a huge table row): hard slice.
        for (let i = 0; i < sentence.length; i += CHUNK_SIZE) {
          atoms.push(sentence.slice(i, i + CHUNK_SIZE));
        }
      }
    }
  }
  return atoms;
}

// Greedily pack boundary-aligned atoms into chunks up to CHUNK_SIZE, carrying a
// CHUNK_OVERLAP-character tail from the previous chunk so context isn't lost at
// chunk seams.
export function chunkText(text: string): string[] {
  const clean = text.replace(/\r\n/g, "\n");
  const atoms = splitAtoms(clean);

  const chunks: string[] = [];
  let current = "";

  for (const atom of atoms) {
    if (current === "" || (current + atom).length <= CHUNK_SIZE) {
      current += atom;
      continue;
    }

    chunks.push(current);
    const overlap = current.slice(Math.max(0, current.length - CHUNK_OVERLAP));
    current = overlap + atom;

    while (current.length > CHUNK_SIZE) {
      chunks.push(current.slice(0, CHUNK_SIZE));
      current = current.slice(CHUNK_SIZE - CHUNK_OVERLAP);
    }
  }

  if (current) chunks.push(current);

  return chunks.map((c) => c.trim()).filter((c) => c.length > MIN_CHUNK);
}
