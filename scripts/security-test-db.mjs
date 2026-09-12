// Ephemeral PostgreSQL for security tests. No Neon URL or network is used.
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { PgDialect, getTableConfig } from "drizzle-orm/pg-core";
import { SQL } from "drizzle-orm";
import * as schema from "../src/lib/db/schema.ts";

export const pg = new PGlite();
const dialect = new PgDialect();
const quote = (value) => `"${value.replaceAll('"', '""')}"`;
// Build relevant tables from the real schema, including defaults and FKs.
for (const table of [schema.companies, schema.users, schema.accounts, schema.sessions,
  schema.verifications, schema.twoFactors, schema.documents]) {
  const config = getTableConfig(table);
  const columns = config.columns.map((col) => {
    let definition = `${quote(col.name)} ${col.getSQLType()}`;
    if (col.primary) definition += " PRIMARY KEY";
    if (col.notNull) definition += " NOT NULL";
    if (col.isUnique) definition += " UNIQUE";
    if (col.default !== undefined) {
      const value = col.default instanceof SQL ? dialect.sqlToQuery(col.default).sql
        : typeof col.default === "string" ? `'${col.default.replaceAll("'", "''")}'` : String(col.default);
      definition += ` DEFAULT ${value}`;
    }
    return definition;
  });
  for (const fk of config.foreignKeys) {
    const ref = fk.reference();
    columns.push(`FOREIGN KEY (${ref.columns.map(c => quote(c.name)).join(",")}) REFERENCES ${quote(getTableConfig(ref.foreignTable).name)} (${ref.foreignColumns.map(c => quote(c.name)).join(",")}) ON DELETE ${fk.onDelete ?? "no action"}`);
  }
  await pg.exec(`CREATE TABLE ${quote(config.name)} (${columns.join(",")})`);
}
await pg.exec("CREATE UNIQUE INDEX company_name ON companies(name) WHERE account_type = 'company'");

export const db = drizzle(pg, { schema });
// Match neon-http's atomic batch contract while executing the real INSERTs.
db.batch = (queries) => pg.transaction(async (tx) => {
  const results = [];
  for (const query of queries) {
    const compiled = query.toSQL();
    results.push(await tx.query(compiled.sql, compiled.params));
  }
  return results;
});
export const mail = { fail: false, sent: [] };
export async function sendMail(message) {
  if (mail.fail) throw new Error("Simulated mail failure");
  mail.sent.push(message);
}
