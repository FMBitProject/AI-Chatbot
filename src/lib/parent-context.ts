import { PARENT_CHARS } from "./chunker";

// Input is already access-filtered and sorted by CHILD similarity. Keep the
// strongest child as the citation/score for each parent; never sum sibling
// scores, which would favor long sections just for having more children.
export function expandParentContexts<T extends {
  id: string; documentId: string; text: string;
  parentText: string | null; parentIndex: number | null;
}>(chunks: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const chunk of chunks) {
    const hasParent = chunk.parentIndex !== null && chunk.parentText !== null
      && chunk.parentText.length > 0 && chunk.parentText.length <= PARENT_CHARS;
    const key = JSON.stringify(hasParent
      ? [chunk.documentId, "parent", chunk.parentIndex]
      : [chunk.documentId, "child", chunk.id]);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ ...chunk, text: hasParent ? chunk.parentText! : chunk.text });
  }
  return result;
}
