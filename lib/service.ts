import { env } from "cloudflare:workers";
import { z } from "zod";
import { CATEGORIES, KINDS, PHASES, type Item, type Kind, type User } from "./types";
import { STARTER_DOCS, STARTER_TASKS } from "./seed";

export class AppError extends Error { constructor(public status: number, message: string) { super(message); } }
export function database(): D1Database { if (!env.DB) throw new AppError(503, "The workspace database is not available. Please try again shortly."); return env.DB; }
export function requestUser(request: Request): User | null {
  const id = request.headers.get("oai-authenticated-user-id");
  const email = request.headers.get("oai-authenticated-user-email");
  if (!id || !email) return null;
  let full = request.headers.get("oai-authenticated-user-full-name");
  if (full && request.headers.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8") { try { full = decodeURIComponent(full); } catch { full = null; } }
  return { id, email, name: full || email.split("@")[0] };
}
export function requireUser(request: Request): User { const u = requestUser(request); if (!u) throw new AppError(401, "Please sign in with your invited ChatGPT account."); return u; }
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) throw new AppError(403, "This action must be sent from your workspace.");
  if (request.headers.get("sec-fetch-site") === "cross-site") throw new AppError(403, "Cross-site writes are not allowed.");
}
export const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
export function errorReply(error: unknown) { if (error instanceof AppError) return reply({ error: error.message }, error.status); if (error instanceof z.ZodError) return reply({ error: error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") }, 400); console.error("Workspace request failed", error instanceof Error ? error.message : "Unknown failure"); return reply({ error: "The change could not be completed. Refresh to check its status before trying again." }, 500); }
export async function readBody(request: Request) { if (!request.headers.get("content-type")?.includes("application/json")) throw new AppError(415, "Send JSON data."); const text = await request.text(); if (text.length > 65000) throw new AppError(413, "This entry is too large. Please shorten it."); try { return JSON.parse(text); } catch { throw new AppError(400, "The submitted data could not be read."); } }

const word = (n: number) => z.string().trim().max(n);
const extraSchema = z.object({
  acceptance: word(5000).optional(), dependencies: z.array(word(100)).max(50).optional(), blocker: word(3000).optional(),
  version: word(100).optional(), source: word(1000).optional(), license: word(300).optional(), cost: word(100).optional(),
  rationale: word(5000).optional(), rollback: word(5000).optional(), testedAt: word(100).optional(), type: word(100).optional(),
  value: word(1000).optional(), direction: z.enum(["expense", "income"]).optional(), recurrence: z.enum(["once", "monthly"]).optional(),
  game: word(200).optional(), serverAddress: word(300).optional(), repository: word(1000).optional(), monthlyBudget: word(100).optional(),
}).strict();
const fields = z.object({
  title: word(180).min(1, "Give this item a title"), body: word(24000).default(""), status: word(40).optional(),
  category: z.enum(CATEGORIES as [string, ...string[]]).default("General"), phase: z.enum(PHASES).default("Define"),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"), owner: word(100).default(""),
  due: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/, "Use a valid date").default(""), pinned: z.boolean().default(false), extra: extraSchema.default({}),
});
const allowedStatus: Record<Kind, string[]> = { idea: ["submitted", "approved", "declined", "deferred", "changes"], task: ["todo", "in_progress", "blocked", "done"], note: ["active"], document: ["draft", "verified", "needs_review"], plugin: ["planned", "installed", "removed"], setting: ["draft", "verified", "needs_review"], budget: ["planned", "paid", "received"], workspace: ["active"] };
const defaultStatus: Record<Kind, string> = { idea: "submitted", task: "todo", note: "active", document: "draft", plugin: "planned", setting: "draft", budget: "planned", workspace: "active" };
const idSchema = word(150).min(1);
const uuidSchema = z.string().uuid();

type Raw = Omit<Item, "extra"> & { extra: string; last_mutation: string };
export function itemFromRow(row: Raw): Item { const { last_mutation: _ignored, ...rest } = row; return { ...rest, extra: JSON.parse(row.extra || "{}") }; }
export async function findItem(id: string): Promise<Item> { const raw = await database().prepare("SELECT * FROM records WHERE id = ?").bind(id).first<Raw>(); if (!raw) throw new AppError(404, "That item could not be found."); return itemFromRow(raw); }
function eventStatement(user: User, text: string, recordId: string | null, mutation?: string, conditional = true) {
  const db = database(), id = mutation ? `event_${mutation}` : crypto.randomUUID(), now = new Date().toISOString();
  if (mutation && recordId && conditional) return db.prepare("INSERT OR IGNORE INTO events (id, record_id, description, author_id, author_name, created_at) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM records WHERE id=? AND last_mutation=?)").bind(id, recordId, text, user.id, user.name, now, recordId, mutation);
  return db.prepare("INSERT OR IGNORE INTO events (id, record_id, description, author_id, author_name, created_at) VALUES (?,?,?,?,?,?)").bind(id, recordId, text, user.id, user.name, now);
}
function insertStatement(item: Item, mutation: string, condition?: { id: string; mutation: string }) {
  const values = [item.id, item.kind, item.title, item.body, item.status, item.category, item.phase, item.priority, item.owner, item.due, item.source_id, item.pinned, JSON.stringify(item.extra), item.version, mutation, item.created_by, item.created_name, item.created_at, item.updated_at];
  const base = "INSERT OR IGNORE INTO records (id,kind,title,body,status,category,phase,priority,owner,due,source_id,pinned,extra,version,last_mutation,created_by,created_name,created_at,updated_at) ";
  return condition ? database().prepare(base + "SELECT " + values.map(() => "?").join(",") + " WHERE EXISTS (SELECT 1 FROM records WHERE id=? AND last_mutation=?)").bind(...values, condition.id, condition.mutation) : database().prepare(base + "VALUES (" + values.map(() => "?").join(",") + ")").bind(...values);
}
function makeItem(kind: Kind, data: z.infer<typeof fields>, user: User, id: string): Item { const now = new Date().toISOString(); return { ...data, kind, id, status: data.status || defaultStatus[kind], pinned: data.pinned ? 1 : 0, source_id: null, version: 1, created_by: user.id, created_name: user.name, created_at: now, updated_at: now }; }
function validateStatus(kind: Kind, status: string) { if (!allowedStatus[kind].includes(status)) throw new AppError(400, "Choose a valid status for this type of item."); }
function validateMoney(kind: Kind, data: z.infer<typeof fields>) { if (kind === "budget" && (!data.extra.cost || !/^\d+(\.\d{1,2})?$/.test(data.extra.cost) || Number(data.extra.cost) > 1000000000)) throw new AppError(400, "Enter a nonnegative USD amount with at most two decimal places."); }
function validateLinks(data: z.infer<typeof fields>) { for (const url of [data.extra.source, data.extra.repository]) { if (!url) continue; try { const u = new URL(url); if (!["https:", "http:"].includes(u.protocol)) throw new Error(); } catch { throw new AppError(400, "Source and repository links must be valid http or https URLs."); } } }
async function validateDependencies(id: string, data: z.infer<typeof fields>) {
  const deps = data.extra.dependencies || [];
  if (!deps.length) return;
  const { results } = await database().prepare("SELECT * FROM records WHERE kind='task' AND status!='archived'").all<Raw>();
  const all = results.map(itemFromRow); const byId = new Map(all.map(t => [t.id, t]));
  for (const dep of deps) { if (!byId.has(dep)) throw new AppError(400, "A selected dependency no longer exists."); if (dep === id) throw new AppError(400, "A task cannot depend on itself."); }
  const reaches = (at: string, seen = new Set<string>()): boolean => { if (at === id) return true; if (seen.has(at)) return false; seen.add(at); return (byId.get(at)?.extra.dependencies || []).some(d => reaches(d, seen)); };
  if (deps.some(d => reaches(d))) throw new AppError(400, "Those dependencies would create a circular chain.");
  if (data.status === "done" && deps.some(d => byId.get(d)?.status !== "done")) throw new AppError(409, "Complete this task's dependencies before marking it done.");
}

export async function getState(user: User) {
  const db = database();
  const [records, comments, messages, events] = await Promise.all([
    db.prepare("SELECT * FROM records ORDER BY created_at ASC, id ASC").all<Raw>(),
    db.prepare("SELECT * FROM comments ORDER BY created_at ASC").all(),
    db.prepare("SELECT * FROM (SELECT * FROM messages ORDER BY created_at DESC LIMIT 200) ORDER BY created_at ASC").all(),
    db.prepare("SELECT * FROM events ORDER BY created_at DESC LIMIT 60").all(),
  ]);
  return { user, records: records.results.map(itemFromRow), comments: comments.results, messages: messages.results, events: events.results, revisions: [], initialized: records.results.some(r => r.id === "workspace_main") };
}

export async function mutate(user: User, input: unknown) {
  const base = z.object({ action: z.string(), requestId: uuidSchema }).passthrough().parse(input);
  const db = database(), mutation = base.requestId, now = new Date().toISOString();
  const value = base as Record<string, unknown>;
  if (base.action === "bootstrap") {
    const workspace = makeItem("workspace", fields.parse({ title: "Sentinel Server HQ", body: "Build a reliable server, a returning community, and sustainable revenue.", status: "active" }), user, "workspace_main");
    const items: Item[] = [workspace];
    const depends: Record<number, number[]> = { 2: [1], 3: [2], 4: [3], 5: [0], 6: [4, 5], 7: [6], 8: [0, 4], 9: [7, 8], 10: [9], 11: [10], 12: [1, 10], 13: [3, 4] };
    STARTER_TASKS.forEach(([phase, title, body, acceptance, category], i) => items.push(makeItem("task", fields.parse({ title, body, phase, category, priority: i < 4 ? "high" : "medium", extra: { acceptance, dependencies: (depends[i] || []).map(n => `starter_task_${n}`) } }), user, `starter_task_${i}`)));
    STARTER_DOCS.forEach(([key, title, body]) => items.push(makeItem("document", fields.parse({ title, body, category: "Documentation", extra: { type: key } }), user, `handbook_${key}`)));
    const results = await db.batch([...items.map(i => insertStatement(i, mutation)), eventStatement(user, "Created the starting roadmap and administrator handbook", "workspace_main", mutation)]);
    return { ok: true, created: results[0].meta.changes > 0 };
  }
  if (base.action === "create") {
    const kind = z.enum(KINDS).parse(value.kind); if (kind === "workspace") throw new AppError(400, "Use workspace settings to change the workspace.");
    const data = fields.parse(value.data); if (kind === "idea") data.status = "submitted";
    validateStatus(kind, data.status || defaultStatus[kind]); validateLinks(data); validateMoney(kind, data);
    const id = `${kind}_${mutation}`; if (kind === "task") await validateDependencies(id, data);
    const item = makeItem(kind, data, user, id);
    const results = await db.batch([insertStatement(item, mutation), eventStatement(user, `Added ${kind}: ${item.title}`, id, mutation)]);
    return { ok: true, id, duplicate: results[0].meta.changes === 0 };
  }
  if (base.action === "update") {
    const id = idSchema.parse(value.id), version = z.number().int().positive().parse(value.version), item = await findItem(id);
    const data = fields.parse(value.data); data.status ||= item.status;
    if (item.status === "archived") throw new AppError(409, "This item is archived.");
    if (item.kind === "idea" && data.status !== item.status) throw new AppError(400, "Use the decision controls to review an idea.");
    if (item.kind === "idea" && item.status === "approved") throw new AppError(409, "Approved ideas keep their original scope. Discuss changes or submit a follow-up idea.");
    validateStatus(item.kind, data.status); validateLinks(data); validateMoney(item.kind, data); if (item.kind === "task") await validateDependencies(id, data);
    const update = db.prepare("UPDATE records SET title=?,body=?,status=?,category=?,phase=?,priority=?,owner=?,due=?,pinned=?,extra=?,version=version+1,last_mutation=?,updated_at=? WHERE id=? AND version=?").bind(data.title, data.body, data.status, data.category, data.phase, data.priority, data.owner, data.due, data.pinned ? 1 : 0, JSON.stringify(data.extra), mutation, now, id, version);
    const commands: D1PreparedStatement[] = [update];
    if (item.kind === "document") commands.push(db.prepare("INSERT INTO revisions (id,record_id,title,body,status,version,author_id,author_name,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM records WHERE id=? AND last_mutation=?)").bind(crypto.randomUUID(), id, item.title, item.body, item.status, item.version, user.id, user.name, now, id, mutation));
    commands.push(eventStatement(user, `Updated ${item.kind}: ${data.title}${data.status !== item.status ? ` → ${data.status.replaceAll("_", " ")}` : ""}`, id, mutation));
    const results = await db.batch(commands); if (!results[0].meta.changes) throw new AppError(409, "This item changed while you were editing. Your draft is still here. Refresh it and merge the latest changes.");
    return { ok: true, id };
  }
  if (base.action === "decision") {
    const id = idSchema.parse(value.id), version = z.number().int().positive().parse(value.version), item = await findItem(id);
    if (item.kind !== "idea") throw new AppError(400, "Only ideas can be reviewed.");
    const decision = z.enum(["approved", "declined", "deferred", "changes"]).parse(value.decision), reason = word(6000).min(1, "Add a decision comment").parse(value.reason);
    if (item.status === "approved") throw new AppError(409, "This idea has already been approved. Its linked task is in the master plan.");
    const commands: D1PreparedStatement[] = [db.prepare("UPDATE records SET status=?,version=version+1,last_mutation=?,updated_at=? WHERE id=? AND version=? AND status!='approved'").bind(decision, mutation, now, id, version)];
    if (decision === "approved") {
      const task = makeItem("task", fields.parse({ title: item.title, body: item.body, phase: item.phase, category: item.category, priority: item.priority, owner: item.owner, due: item.due, extra: { acceptance: item.extra.acceptance || "Agree on a completion test before implementation." } }), user, `plan_${item.id}`); task.source_id = item.id;
      commands.push(insertStatement(task, mutation, { id, mutation }));
    }
    commands.push(db.prepare("INSERT OR IGNORE INTO comments (id,record_id,body,author_id,author_name,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM records WHERE id=? AND last_mutation=?)").bind(`decision_${mutation}`, id, `${decision === "changes" ? "Requested changes" : decision[0].toUpperCase() + decision.slice(1)}: ${reason}`, user.id, user.name, now, id, mutation));
    commands.push(eventStatement(user, `${decision === "changes" ? "Requested changes to" : decision[0].toUpperCase() + decision.slice(1)} idea: ${item.title}`, id, mutation));
    const results = await db.batch(commands); if (!results[0].meta.changes) throw new AppError(409, "This idea changed. Refresh it before recording your decision.");
    return { ok: true, id, taskId: decision === "approved" ? `plan_${item.id}` : null };
  }
  if (base.action === "comment") {
    const id = idSchema.parse(value.id); await findItem(id); const body = word(6000).min(1).parse(value.body);
    await db.batch([db.prepare("INSERT OR IGNORE INTO comments (id,record_id,body,author_id,author_name,created_at) VALUES (?,?,?,?,?,?)").bind(`comment_${mutation}`, id, body, user.id, user.name, now), eventStatement(user, "Added a discussion comment", id, mutation, false)]); return { ok: true };
  }
  if (base.action === "message") {
    const body = word(8000).min(1).parse(value.body);
    await db.prepare("INSERT OR IGNORE INTO messages (id,body,author_id,author_name,created_at) VALUES (?,?,?,?,?)").bind(`message_${mutation}`, body, user.id, user.name, now).run(); return { ok: true };
  }
  if (base.action === "archive") {
    const id = idSchema.parse(value.id), version = z.number().int().positive().parse(value.version), item = await findItem(id);
    if (item.kind === "workspace" || item.kind === "idea") throw new AppError(400, "Keep workspace and idea decision history intact.");
    if (item.kind === "task") { const rows = await db.prepare("SELECT extra FROM records WHERE kind='task' AND status NOT IN ('archived','done') AND id!=?").bind(id).all<{ extra: string }>(); if (rows.results.some(r => (JSON.parse(r.extra).dependencies || []).includes(id))) throw new AppError(409, "Remove this task from active dependencies before archiving it."); }
    const results = await db.batch([db.prepare("UPDATE records SET extra=json_set(extra,'$.archivedStatus',status),status='archived',version=version+1,last_mutation=?,updated_at=? WHERE id=? AND version=?").bind(mutation, now, id, version), eventStatement(user, `Archived ${item.kind}: ${item.title}`, id, mutation)]);
    if (!results[0].meta.changes) throw new AppError(409, "This item changed. Refresh before archiving it."); return { ok: true };
  }
  if (base.action === "restore") {
    const id = idSchema.parse(value.id), version = z.number().int().positive().parse(value.version), item = await findItem(id);
    if (item.status !== "archived") throw new AppError(409, "This item is not archived.");
    const restoredStatus = typeof item.extra.archivedStatus === "string" && allowedStatus[item.kind].includes(item.extra.archivedStatus) ? item.extra.archivedStatus : defaultStatus[item.kind];
    const results = await db.batch([db.prepare("UPDATE records SET status=?,extra=json_remove(extra,'$.archivedStatus'),version=version+1,last_mutation=?,updated_at=? WHERE id=? AND version=? AND status='archived'").bind(restoredStatus, mutation, now, id, version), eventStatement(user, `Restored ${item.kind}: ${item.title}`, id, mutation)]);
    if (!results[0].meta.changes) throw new AppError(409, "This item changed. Refresh before restoring it."); return { ok: true };
  }
  throw new AppError(400, "That action is not supported.");
}
