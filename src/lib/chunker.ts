const CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 200;
const MIN_CHUNK = 50;

// Break text into "atoms" that never exceed CHUNK_SIZE, preferring natural
// boundaries: first paragraphs (\n\n), then sentences / lines, and only as a
// last resort a hard character cut. Delimiters stay attached to each atom so
// the reassembled chunk keeps the document's original punctuation and spacing.
function splitAtoms(text: string, size: number): string[] {
  const atoms: string[] = [];

  // Split after each blank line, keeping the "\n\n" on the preceding paragraph.
  for (const para of text.split(/(?<=\n\n)/)) {
    if (para.length <= size) {
      if (para.length > 0) atoms.push(para);
      continue;
    }
    // Oversized paragraph: split after sentence-ending punctuation + whitespace,
    // or after a single newline.
    for (const sentence of para.split(/(?<=[.!?]\s)|(?<=\n)/)) {
      if (sentence.length === 0) continue;
      if (sentence.length <= size) {
        atoms.push(sentence);
      } else {
        // Pathological (no punctuation, e.g. a huge table row): hard slice.
        for (let i = 0; i < sentence.length; i += size) {
          atoms.push(sentence.slice(i, i + size));
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
  return splitText(text, CHUNK_SIZE, CHUNK_OVERLAP).filter(c => c.length > MIN_CHUNK);
}

function splitText(text: string, size: number, overlapSize: number): string[] {
  const clean = text.replace(/\r\n/g, "\n");
  const atoms = splitAtoms(clean, size);

  const chunks: string[] = [];
  let current = "";

  for (const atom of atoms) {
    if (current === "" || (current + atom).length <= size) {
      current += atom;
      continue;
    }

    chunks.push(current);
    const overlap = current.slice(Math.max(0, current.length - overlapSize));
    current = overlap + atom;

    while (current.length > size) {
      chunks.push(current.slice(0, size));
      current = current.slice(size - overlapSize);
    }
  }

  if (current) chunks.push(current);

  return chunks.map((c) => c.trim()).filter(Boolean);
}

// Character budgets, NOT tokenizer counts. Roughly 300–400 tokens per child
// and 1,000–1,300 per parent for typical prose; actual tokenization varies.
export const CHILD_CHARS = 1200;
export const PARENT_CHARS = 4000;

export interface ParentChildChunk {
  text: string;
  parentText: string;
  parentIndex: number;
}

export function chunkParentDocument(text: string): ParentChildChunk[] {
  const clean = text.replace(/\r\n?/g, "\n").trim();
  if (clean.length <= MIN_CHUNK) return [];
  // Keep explicit Markdown headings with their section. Plain extracted text
  // falls back to paragraph/sentence boundaries with the same hard size cap.
  const sections = clean.split(/\n(?=#{1,6}\s+\S)/);
  const parents = sections.flatMap(section => splitText(section, PARENT_CHARS, 0));
  return parents.flatMap((parentText, parentIndex) =>
    splitText(parentText, CHILD_CHARS, 160).map(text => ({ text, parentText, parentIndex })));
}
