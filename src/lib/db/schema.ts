import { pgTable, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";

export const companies = pgTable("companies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
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
  status: text("status").$type<"processing" | "success" | "failed">().default("processing").notNull(),
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
