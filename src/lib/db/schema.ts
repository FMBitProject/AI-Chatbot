import { pgTable, text, timestamp, boolean, integer, vector, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Despite the name, a row here is a *workspace*: the tenant every document,
// chunk, chat session and transaction is keyed by. Two kinds live in it, told
// apart by `accountType`, and the table was not split because splitting it would
// mean a second tenant key running through RLS, retrieval, quotas and payments —
// four places where one key is exactly what makes them safe.
export const companies = pgTable("companies", {
  id: text("id").primaryKey(),
  // For an individual account this is the person's own name, and it is neither
  // shown as an organisation nor required to be unique — see the partial index
  // below. Renaming the column would touch every query in the app for no gain.
  name: text("name").notNull(),
  // "company"    — an organisation: an admin who manages employees, departments
  //                and seats. What every row was before this column existed,
  //                which is why it is the default and why the backfill is a
  //                one-liner.
  // "individual" — one person, one workspace. No employees, no seats; the
  //                `department` column on documents becomes their private
  //                folders instead of an access-control boundary.
  //
  // Immutable by design: nothing in the app writes it after signup. An
  // individual who later needs a team registers a company account, which keeps
  // this out of the plan/limit/seat logic where a mid-life switch would need
  // answers for questions nobody has asked yet (who owns the documents, what
  // happens to a personal plan with seats).
  accountType: text("account_type").$type<"company" | "individual">().default("company").notNull(),
  // "custom" is granted by hand (scripts/grant-custom-plan.mjs), never bought —
  // which is why it appears here but not on `transactions.plan` below.
  // "personal" is the individual-account tier and is refused to company
  // accounts at checkout (see /api/payment/create); the reverse holds too — an
  // individual cannot buy the team plans, whose headline feature is seats it
  // has nowhere to put.
  plan: text("plan").$type<"starter" | "personal" | "professional" | "enterprise" | "custom">().default("starter").notNull(),
  aiName: text("ai_name").default("IntelliBase AI").notNull(),
  aiGreeting: text("ai_greeting"),
  aiPersonality: text("ai_personality"),
  // BYOK: the customer's own provider credentials, available from Professional
  // upwards. Stored ENCRYPTED — "v1:<iv>:<tag>:<ciphertext>", AES-256-GCM under
  // BYOK_SECRET_KEY from the environment — so never read these columns directly.
  // Go through @/lib/byok, which unwraps them and binds each ciphertext to this
  // row's id and this column's name; a value moved between the two columns, or
  // between two companies, fails to decrypt rather than quietly working.
  //
  // Unlike api_keys.key_hash these cannot be hashed: the plaintext is sent to
  // Groq/Google on every question, so it has to survive the round trip.
  //
  // Nullable, and NULL is the normal case: it means "use the platform account".
  // Truthiness alone still answers "has a key?" without any decryption, which is
  // what /api/admin/company reports to the dashboard.
  groqApiKey: text("groq_api_key"),
  geminiApiKey: text("gemini_api_key"),
  dailyQuestionCount: integer("daily_question_count").default(0).notNull(),
  dailyQuestionDate: text("daily_question_date"), // "YYYY-MM-DD" (UTC)
  // Monthly usage is counted here rather than by counting chat_messages, so
  // questions asked through the public API and Slack — which never write chat
  // history — count toward the monthly quota like the chat UI does.
  monthlyQuestionCount: integer("monthly_question_count").default(0).notNull(),
  monthlyQuestionMonth: text("monthly_question_month"), // "YYYY-MM" (UTC)
  planExpiresAt: timestamp("plan_expires_at"),
  // Held by whichever indexing pass is currently draining this company's queue,
  // and only that one. Nothing about the queue itself needs it — documents are
  // claimed one at a time and are safe under any number of workers — but the
  // embedding provider is a shared, rate-limited resource, so a second pass does
  // not index faster, it just collects everyone's 429s sooner. See
  // acquireIndexingLease in @/lib/indexing.
  //
  // A deadline rather than a boolean, because the holder can die without
  // releasing: a killed invocation leaves the lease behind, and only its expiry
  // frees the queue again.
  indexingLeaseUntil: timestamp("indexing_lease_until"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  // Company names stay unique; personal names do not.
  //
  // The rule this replaces was a plain UNIQUE over the whole column, which is
  // right for organisations — "PT Sehat Sentosa" registering twice is almost
  // always the same customer locked out of their own account — and wrong for
  // people. There are a lot of Indonesians named Budi Santoso, and the second
  // one to sign up would have been told his *name* was already taken, with no
  // field on the form to change it.
  uniqueIndex("companies_name_unique_company")
    .on(t.name)
    .where(sql`${t.accountType} = 'company'`),
]);

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false),
  image: text("image"),
  companyId: text("company_id").references(() => companies.id),
  role: text("role").$type<"admin" | "employee">().default("employee").notNull(),
  department: text("department"),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  // No `twoFactorSecret` here on purpose. better-auth's twoFactor plugin only
  // contributes `twoFactorEnabled` to the user model; the secret and backup
  // codes live in its own `twoFactor` model. The column this replaces was added
  // by hand in migration 0001, was never read or written by anything, and held
  // NULL on every row — while `/api/admin/users` selected it with `select()`
  // and shipped it to the admin's browser. A credential column nothing uses is
  // a credential column nobody notices filling up.
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
});

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

// Storage for better-auth's twoFactor plugin — the table that was missing for
// as long as the plugin has been enabled.
//
// The plugin needs two places to write: a `twoFactorEnabled` flag on the user
// (which `users` has always had) and this model for the credential itself. The
// model was never created, so every 2FA call died inside the drizzle adapter
// with `The model "twoFactor" was not found in the schema object` — after the
// password check passed, which is why the UI's fallback toast blamed the
// password and nobody ever filed it as a bug.
//
// Field (property) names must match the plugin's schema exactly: the adapter
// resolves them against this object's TS property names (`schemaModel[field]`),
// not the SQL column names.
//
// Not RLS'd, deliberately: this is per-user auth data like `accounts` and
// `sessions`, owned by better-auth and never queried per-tenant. Only the four
// document/chat tables carry tenant policies.
export const twoFactors = pgTable("two_factor", {
  id: text("id").primaryKey(),
  // TOTP secret, symmetrically encrypted by better-auth with BETTER_AUTH_SECRET
  // before it gets here — a database leak does not expose usable seeds.
  secret: text("secret").notNull(),
  // Hashed one-time recovery codes, same encryption, consumed one per use.
  backupCodes: text("backup_codes").notNull(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // False between enable() and the first successful verify — the window where
  // the user has a secret but has not yet proven they can produce codes. The
  // sign-in hook ignores unverified TOTP so a half-finished setup can never
  // lock its owner out.
  verified: boolean("verified").notNull().default(true),
  // Sign-in verify failures since the last success; the plugin locks the
  // challenge once it crosses its threshold, until lockedUntil passes.
  failedVerificationCount: integer("failed_verification_count").notNull().default(0),
  lockedUntil: timestamp("locked_until"),
}, (t) => [
  // UNIQUE, not a plain index — one user has at most one 2FA credential.
  //
  // The adapter looks rows up by userId on every 2FA sign-in and every
  // enable/disable, and it uses findOne: with two rows it takes whichever
  // Postgres hands back first, and nothing says that is the same one twice.
  //
  // enable() is where they appear. It runs findOne → deleteMany(userId) →
  // create(), with no lock and no constraint: under READ COMMITTED two
  // concurrent calls both delete (neither sees the other's uncommitted insert)
  // and both insert. Measured, not theorised — six parallel enables on one
  // session left three rows and handed the user six different secrets. Whoever
  // scans the secret from a response whose row lost can never produce a code
  // that verifies, and the failure counters split across rows so the lockout
  // budget stops meaning anything.
  //
  // The constraint cannot fix the delete-then-insert race on its own; it turns
  // it into a failed insert (23505) the caller sees, instead of a second row
  // nobody sees. That is the trade this table wants: a duplicate here is
  // silent and permanent, an error is loud and retryable.
  uniqueIndex("two_factor_user_id_idx").on(t.userId),
]);

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

export const documents = pgTable("documents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  companyId: text("company_id").references(() => companies.id).notNull(),
  // One column, two readings, decided by the workspace's accountType:
  //   company    — the department that owns the document. NULL means shared,
  //                and an employee only ever retrieves NULL-or-their-own (see
  //                retrieveChunks). Access control.
  //   individual — the owner's own folder. NULL means unfiled. There is only
  //                one person in the workspace and their users.department is
  //                NULL, so nothing is ever hidden from them; the folder narrows
  //                a search when they ask it to. Organisation, not permission.
  //
  // Shared rather than split into a second column because the two are the same
  // shape — one optional tag partitioning a company's documents — and because a
  // second column would double every filter in retrieval.ts, where getting the
  // predicate wrong is a data leak. The folder filter narrows *on top of* the
  // department rule, never instead of it, so the company reading always holds.
  department: text("department"),
  // "queued"     — text extracted and stored, waiting for the indexer
  // "processing" — claimed by an indexing pass right now
  // "success"    — chunks + embeddings stored, searchable
  // "failed"     — see errorMessage; re-indexable if raw_text survived
  //
  // Plain text, no enum or check constraint, so adding "queued" needed no
  // migration. See src/lib/indexing.ts for the state machine.
  status: text("status").$type<"queued" | "processing" | "success" | "failed">().default("queued").notNull(),
  // Why a "failed" document failed, phrased for the admin who uploaded it.
  // Null for every other status.
  errorMessage: text("error_message"),
  summary: text("summary"),
  // Full extracted text, kept so a document can be re-chunked later without
  // re-uploading the original file.
  rawText: text("raw_text"),
  // When an indexing pass last claimed this document. Two jobs, both of which
  // created_at was standing in for and getting wrong:
  //   - deciding a "processing" row is stuck. created_at is the *upload* time,
  //     so a document uploaded this morning and claimed just now already looked
  //     ten minutes stale, and a second worker could requeue it mid-flight.
  //   - ordering the queue. Always-oldest-first means a document that reliably
  //     fails is re-claimed first on every pass and starves the rest; ordering
  //     by when we last *tried* rotates each failure to the back. Same fix as
  //     transactions.last_checked_at in the payment sweep.
  // NULL means never attempted, which sorts first.
  indexingStartedAt: timestamp("indexing_started_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const documentChunks = pgTable("document_chunks", {
  id: text("id").primaryKey(),
  documentId: text("document_id").references(() => documents.id, { onDelete: "cascade" }).notNull(),
  companyId: text("company_id").references(() => companies.id).notNull(),
  text: text("text").notNull(),
  embedding: vector("embedding", { dimensions: 1536 }),
  chunkIndex: integer("chunk_index").notNull().default(0),
}, (t) => [
  index("document_chunks_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
  // Structural guarantee that one document cannot end up with two copies of the
  // same chunk. Indexing rewrites a document's chunks as delete-then-insert
  // inside one transaction, which is safe against a crash but *not* against a
  // second writer: under READ COMMITTED the second transaction's DELETE cannot
  // see the first's uncommitted INSERT, so it deletes nothing, inserts its own
  // copy, and both survive the commit. Every chunk would then be retrieved
  // twice, silently spending the chat's context budget on the same text.
  //
  // The lease check in embedAndStore is what actually prevents two writers; this
  // index is the backstop that turns a mistake there into a failed insert
  // instead of a corrupted document.
  uniqueIndex("document_chunks_document_chunk_idx").on(t.documentId, t.chunkIndex),
]);

export const chatSessions = pgTable("chat_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id).notNull(),
  companyId: text("company_id").references(() => companies.id).notNull(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const transactions = pgTable("transactions", {
  id: text("id").primaryKey(),
  companyId: text("company_id").references(() => companies.id).notNull(),
  orderId: text("order_id").notNull().unique(),
  plan: text("plan").$type<"personal" | "professional" | "enterprise">().notNull(),
  amount: text("amount").notNull(),
  status: text("status").$type<"pending" | "paid" | "failed" | "expired">().default("pending").notNull(),
  snapToken: text("snap_token"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  paidAt: timestamp("paid_at"),
  // When the reconciliation sweep last asked Midtrans about this order. NULL
  // means never — those go first, so a payment that just landed is never stuck
  // behind orders the sweep has already given up on. See the ordering in
  // /api/cron/reconcile-payments.
  lastCheckedAt: timestamp("last_checked_at"),
}, (t) => [
  // At most one open order per company per plan.
  //
  // Checkout already looks for an existing pending order and offers it back
  // rather than minting a second one, but that check is a read followed by a
  // decision followed by a write — two requests arriving together both read
  // "none", and both write. Only the database can decide which one wins, so
  // this is where the rule belongs; the application check stays as the fast
  // path that keeps the common case from ever reaching it.
  //
  // Partial (`WHERE status = 'pending'`) because the constraint is about *open*
  // orders. A company renewing every month accumulates any number of paid ones,
  // and those must not collide.
  uniqueIndex("transactions_one_pending_per_plan")
    .on(t.companyId, t.plan)
    .where(sql`${t.status} = 'pending'`),
]);

export const apiKeys = pgTable("api_keys", {
  id: text("id").primaryKey(),
  // SHA-256 hash of the full key — the plaintext is shown to the admin once at
  // creation and never stored, so a database leak cannot expose usable keys.
  keyHash: text("key_hash").notNull().unique(),
  // First few chars of the key, kept in the clear purely for display (e.g. ib_a1b2c3d4…).
  keyPrefix: text("key_prefix").notNull(),
  name: text("name").notNull(),
  companyId: text("company_id").references(() => companies.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at"),
});

export const chatMessages = pgTable("chat_messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").references(() => chatSessions.id, { onDelete: "cascade" }).notNull(),
  role: text("role").$type<"user" | "assistant">().notNull(),
  content: text("content").notNull(),
  citationsJson: text("citations_json"),
  feedback: text("feedback").$type<"up" | "down">(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
