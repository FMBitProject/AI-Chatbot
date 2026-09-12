import { eq, isNull, or } from "drizzle-orm";
import { documents } from "@/lib/db/schema";

export type DocumentAccess =
  | { role: "admin" }
  | { role: "employee"; department: string | null };

export function documentAccessCondition(access: DocumentAccess) {
  if (access.role === "admin") return undefined;
  return access.department
    ? or(isNull(documents.department), eq(documents.department, access.department))!
    : isNull(documents.department);
}
