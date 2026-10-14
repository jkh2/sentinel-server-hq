import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const records = sqliteTable("records", {
  id: text("id").primaryKey(), kind: text("kind").notNull(), title: text("title").notNull(),
  body: text("body").notNull().default(""), status: text("status").notNull().default("draft"),
  category: text("category").notNull().default("General"), phase: text("phase").notNull().default("Define"),
  priority: text("priority").notNull().default("medium"), owner: text("owner").notNull().default(""),
  due: text("due").notNull().default(""), sourceId: text("source_id"), pinned: integer("pinned").notNull().default(0),
  extra: text("extra").notNull().default("{}"), version: integer("version").notNull().default(1),
  lastMutation: text("last_mutation").notNull(), createdBy: text("created_by").notNull(),
  createdName: text("created_name").notNull(), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, t => [uniqueIndex("record_source_unique").on(t.sourceId), index("records_kind_idx").on(t.kind)]);

export const comments = sqliteTable("comments", {
  id: text("id").primaryKey(), recordId: text("record_id").notNull().references(() => records.id),
  body: text("body").notNull(), authorId: text("author_id").notNull(), authorName: text("author_name").notNull(),
  createdAt: text("created_at").notNull(),
}, t => [index("comments_record_idx").on(t.recordId)]);

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(), body: text("body").notNull(), authorId: text("author_id").notNull(),
  authorName: text("author_name").notNull(), createdAt: text("created_at").notNull(),
}, t => [index("messages_time_idx").on(t.createdAt)]);

export const revisions = sqliteTable("revisions", {
  id: text("id").primaryKey(), recordId: text("record_id").notNull().references(() => records.id),
  title: text("title").notNull(), body: text("body").notNull(), status: text("status").notNull(),
  version: integer("version").notNull(), authorId: text("author_id").notNull(), authorName: text("author_name").notNull(), createdAt: text("created_at").notNull(),
});

export const events = sqliteTable("events", {
  id: text("id").primaryKey(), recordId: text("record_id"), description: text("description").notNull(),
  authorId: text("author_id").notNull(), authorName: text("author_name").notNull(), createdAt: text("created_at").notNull(),
}, t => [index("events_time_idx").on(t.createdAt)]);
