import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-guard";
import { withTenant } from "@/lib/db/tenant";
import { documents } from "@/lib/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";

/**
 * The folders this workspace's documents are filed under.
 *
 * There is no `folders` table. A folder exists exactly as long as a document
 * sits in it, which is the behaviour a personal filing system wants: the list is
 * always the truth about the documents, an empty folder cannot linger, and
 * renaming one is moving its documents. The alternative — rows to create,
 * rename, delete, and keep in step with the documents referencing them — buys
 * nothing an individual account has asked for.
 *
 * requireUser, not requireAdmin: this is read by the chat page, where the
 * folder picker narrows a search. On an individual account the only member *is*
 * the admin, but the chat page is shared with company employees and must not
 * 403 for them.
 */
export async function GET(req: NextRequest) {
  const guard = await requireUser(req);
  if (!guard.ok) return guard.response;
  const { companyId, accountType } = guard.user;

  // Company accounts get an empty list, and it is not an oversight. The same
  // column means something else for them — the department that may see a
  // document — so the values are access-control metadata, not labels their
  // employees chose. Nothing in the UI shows a department picker, so handing
  // every employee the full list of department names would be disclosure
  // bought for no feature. Give companies folders and this is where it changes.
  const folders = accountType === "individual"
    ? await withTenant(companyId, (tx) =>
        tx.selectDistinct({ name: documents.department })
          .from(documents)
          .where(and(eq(documents.companyId, companyId), isNotNull(documents.department))))
    : [];

  return NextResponse.json({
    accountType,
    // Sorted here rather than in SQL so the ordering follows the reader's
    // language: localeCompare puts accented and lowercase names where a person
    // expects them, which ORDER BY under the database's default collation does
    // not promise.
    folders: folders
      .map((f) => f.name)
      .filter((name): name is string => !!name)
      .sort((a, b) => a.localeCompare(b, "id")),
  });
}
