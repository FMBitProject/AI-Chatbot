import { NextResponse } from "next/server";
import { and, or, sql, type SQLWrapper } from "drizzle-orm";
import { ValidationError } from "./errors";

type Key = { column: SQLWrapper; direction: "asc" | "desc" };
type Cursor = { scope: string; values: string[] };

// Text keys preserve Postgres timestamp microseconds, which JS Dates discard.
export function pagination(req: Request, keys: Key[], scope = new URL(req.url).pathname) {
  const query = new URL(req.url).searchParams;
  const rawLimit = query.get("limit") ?? "100";
  if (!/^\d+$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 100 || query.has("offset")) {
    throw new ValidationError("Invalid pagination parameters");
  }
  let cursor: Cursor | undefined;
  const rawCursor = query.get("cursor");
  if (rawCursor !== null) {
    try {
      if (!rawCursor || rawCursor.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(rawCursor)) throw new Error();
      const parsed: unknown = JSON.parse(Buffer.from(rawCursor, "base64url").toString());
      if (!parsed || typeof parsed !== "object") throw new Error();
      const candidate = parsed as Cursor;
      if (candidate.scope !== scope || !Array.isArray(candidate.values) || candidate.values.length !== keys.length ||
        !candidate.values.every(v => typeof v === "string" && v.length <= 256)) throw new Error();
      cursor = candidate;
    } catch { throw new ValidationError("Invalid cursor"); }
  }
  const columns = keys.map(k => sql`${k.column}::text collate "C"`);
  const condition = cursor ? or(...keys.map((key, i) => and(
    ...columns.slice(0, i).map((column, j) => sql`${column} = ${cursor!.values[j]}`),
    key.direction === "asc" ? sql`${columns[i]} > ${cursor!.values[i]}` : sql`${columns[i]} < ${cursor!.values[i]}`,
  ))) : undefined;
  return {
    limit: Number(rawLimit), scope, condition,
    order: columns.map((column, i) => sql`${column} ${sql.raw(keys[i].direction)}`),
    selection: sql<string[]>`json_build_array(${sql.join(keys.map(k => sql`${k.column}::text`), sql`, `)})`,
  };
}

export function paginated<T extends { _cursor: string[] }>(rows: T[], page: { limit: number; scope: string }) {
  const visible = rows.slice(0, page.limit);
  const headers: Record<string, string> = { "Cache-Control": "private, no-store" };
  if (rows.length > page.limit) {
    headers["X-Next-Cursor"] = Buffer.from(JSON.stringify({ scope: page.scope, values: visible[visible.length - 1]._cursor })).toString("base64url");
  }
  return NextResponse.json(visible.map(row => {
    const { _cursor, ...item } = row;
    void _cursor;
    return item;
  }), { headers });
}
