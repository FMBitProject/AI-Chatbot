import { pgTable, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";

export const companies = pgTable("companies", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  plan: text("plan").$type<"starter" | "professional" | "enterprise">().default("starter").notNull(),
  aiName: text("ai_name").default("IntelliBase AI").notNull(),
  aiGreeting: text("ai_greeting"),
  aiPersonality: text("ai_personality"),
  groqApiKey: text("groq_api_key"),
  geminiApiKey: text("gemini_api_key"),
  dailyQuestionCount: integer("daily_question_count").default(0).notNull(),
  dailyQuestionDate: text("daily_question_date"),
  planExpiresAt: timestamp("plan_expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
  twoFactorSecret: text("two_factor_secret"),
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
  department: text("department"),
  status: text("status").$type<"processing" | "success" | "failed">().default("processing").notNull(),
  summary: text("summary"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const documentChunks = pgTable("document_chunks", {
  id: text("id").primaryKey(),
  documentId: text("document_id").references(() => documents.id, { onDelete: "cascade" }).notNull(),
  companyId: text("company_id").references(() => companies.id).notNull(),
  text: text("text").notNull(),
  embeddingJson: text("embedding_json"),
  chunkIndex: integer("chunk_index").notNull().default(0),
});

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
  plan: text("plan").$type<"professional" | "enterprise">().notNull(),
  amount: text("amount").notNull(),
  status: text("status").$type<"pending" | "paid" | "failed" | "expired">().default("pending").notNull(),
  snapToken: text("snap_token"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  paidAt: timestamp("paid_at"),
});

export const apiKeys = pgTable("api_keys", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
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
