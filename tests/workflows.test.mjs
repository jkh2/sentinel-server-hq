import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, ".sites-runtime", "workflow-tests");
await mkdir(output, { recursive: true });
async function compile(source, target) {
  let text = await readFile(path.join(root, source), "utf8");
  text = text.replace('import { env } from "cloudflare:workers";', 'const env = globalThis.__sentinelTestEnv;')
    .replaceAll('"./types"', '"./types.mjs"').replaceAll('"./seed"', '"./seed.mjs"').replaceAll('"@/lib/service"', '"./service.mjs"').replaceAll('"@/lib/types"', '"./types.mjs"');
  await writeFile(path.join(output, target), ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
}
for (const file of ["types", "seed", "service"]) await compile(`lib/${file}.ts`, `${file}.mjs`);
await compile("app/mcp/route.ts", "mcp.mjs");
globalThis.__sentinelTestEnv = {};
const { mutate, getState, findItem, sameOrigin, requireUser } = await import(pathToFileURL(path.join(output, "service.mjs")));
const { POST: mcp } = await import(pathToFileURL(path.join(output, "mcp.mjs")));
let sqlite;
class Statement {
  constructor(sql, params = []) { this.sql = sql; this.params = params; }
  bind(...params) { return new Statement(this.sql, params); }
  async first() { return sqlite.prepare(this.sql).get(...this.params) || null; }
  async all() { return { results: sqlite.prepare(this.sql).all(...this.params), success: true }; }
  async run() { return { success: true, meta: { changes: Number(sqlite.prepare(this.sql).run(...this.params).changes) } }; }
}
beforeEach(async () => {
  sqlite = new DatabaseSync(":memory:"); sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.exec(await readFile(path.join(root, "drizzle/0000_early_zombie.sql"), "utf8"));
  globalThis.__sentinelTestEnv.DB = { prepare: sql => new Statement(sql), async batch(statements) { sqlite.exec("BEGIN"); try { const result = []; for (const statement of statements) result.push(await statement.run()); sqlite.exec("COMMIT"); return result; } catch(e) { sqlite.exec("ROLLBACK"); throw e; } } };
});
afterEach(() => sqlite.close());
const james = { id: "test-james", name: "James", email: "james@example.test" };
const tyler = { id: "test-tyler", name: "Tyler", email: "tyler@example.test" };
const command = (action, values = {}) => ({ action, requestId: crypto.randomUUID(), ...values });
async function create(kind, data, actor = james) { const result = await mutate(actor, command("create", { kind, data })); return await findItem(result.id); }
const editData = (item, changes) => ({ ...item, pinned: !!item.pinned, ...changes });

test("two people share a persistent starting plan without duplicate initialization", async () => {
  const first = await mutate(james, command("bootstrap")); const second = await mutate(tyler, command("bootstrap"));
  assert.equal(first.created, true); assert.equal(second.created, false);
  const state = await getState(tyler); assert.equal(state.records.filter(r => r.kind === "task").length, 14); assert.equal(state.records.filter(r => r.kind === "document").length, 8); assert.equal(state.events.length, 1); assert.equal(state.initialized, true);
});
test("approval records reasoning and creates exactly one linked plan task", async () => {
  const idea = await create("idea", { title: "AI welcome guide", body: "Use approved documentation", phase: "Customize", owner: "Tyler" });
  await mutate(tyler, command("decision", { id: idea.id, version: idea.version, decision: "approved", reason: "Useful for onboarding; test accuracy first." }));
  await assert.rejects(mutate(james, command("decision", { id: idea.id, version: idea.version, decision: "approved", reason: "Again" })), /already been approved/);
  const state = await getState(james), tasks = state.records.filter(r => r.source_id === idea.id); assert.equal(tasks.length, 1); assert.equal(tasks[0].phase, "Customize"); assert.equal(tasks[0].owner, "Tyler"); assert.equal(tasks[0].status, "todo"); assert.equal(state.comments.filter(c => c.record_id === idea.id).length, 1); assert.match(state.comments[0].body, /Useful for onboarding/);
});
test("a competing decision cannot overwrite the first decision or add a task", async () => {
  const idea = await create("idea", { title: "New gameplay mode" });
  await mutate(tyler, command("decision", { id: idea.id, version: 1, decision: "deferred", reason: "Test the core first" }));
  await assert.rejects(mutate(james, command("decision", { id: idea.id, version: 1, decision: "approved", reason: "Old screen" })), /changed/);
  const state = await getState(james); assert.equal(state.records.find(r => r.id === idea.id).status, "deferred"); assert.equal(state.records.filter(r => r.source_id === idea.id).length, 0); assert.equal(state.comments.length, 1);
});
test("duplicate creates, comments, and messages are idempotent", async () => {
  const input = command("create", { kind: "note", data: { title: "Handoff", body: "Start here" } });
  const a = await mutate(james, input); await mutate(james, input);
  const comment = command("comment", { id: a.id, body: "Got it" }); await mutate(tyler, comment); await mutate(tyler, comment);
  const msg = command("message", { body: "Ready to test" }); await mutate(tyler, msg); await mutate(tyler, msg);
  const state = await getState(james); assert.equal(state.records.length, 1); assert.equal(state.comments.length, 1); assert.equal(state.messages.length, 1); assert.equal(state.events.length, 2);
});
test("stale edits preserve the first save and document history", async () => {
  const doc = await create("document", { title: "Recovery", body: "Original instructions" });
  await mutate(tyler, command("update", { id: doc.id, version: doc.version, data: editData(doc, { body: "Tested instructions", status: "verified" }) }));
  await assert.rejects(mutate(james, command("update", { id: doc.id, version: doc.version, data: editData(doc, { body: "A stale draft" }) })), /changed while you were editing/);
  assert.equal((await findItem(doc.id)).body, "Tested instructions"); const revisions = sqlite.prepare("SELECT * FROM revisions").all(); assert.equal(revisions.length, 1); assert.equal(revisions[0].body, "Original instructions");
});
test("dependencies prevent cycles, premature completion, and accidental removal", async () => {
  const backup = await create("task", { title: "Test backup" }); const launch = await create("task", { title: "Launch", extra: { dependencies: [backup.id] } });
  await assert.rejects(mutate(james, command("update", { id: backup.id, version: 1, data: editData(backup, { extra: { dependencies: [launch.id] } }) })), /circular/);
  await assert.rejects(mutate(james, command("update", { id: launch.id, version: 1, data: editData(launch, { status: "done" }) })), /dependencies/);
  await assert.rejects(mutate(james, command("archive", { id: backup.id, version: 1 })), /active dependencies/);
  await mutate(james, command("update", { id: backup.id, version: 1, data: editData(backup, { status: "done" }) }));
  await mutate(tyler, command("update", { id: launch.id, version: 1, data: editData(launch, { status: "done" }) })); assert.equal((await findItem(launch.id)).status, "done");
});
test("archived records can be restored with their previous status", async () => {
  const plugin = await create("plugin", { title: "Example plugin", status: "installed", extra: { version: "1.2" } });
  await mutate(james, command("archive", { id: plugin.id, version: 1 })); const archived = await findItem(plugin.id); assert.equal(archived.status, "archived");
  await mutate(tyler, command("restore", { id: plugin.id, version: archived.version })); const restored = await findItem(plugin.id); assert.equal(restored.status, "installed"); assert.equal(restored.extra.version, "1.2"); assert.equal(restored.extra.archivedStatus, undefined);
});
test("access and origin checks reject anonymous or cross-origin writes", () => {
  assert.throws(() => requireUser(new Request("https://hq.test/api/state")), /sign in/);
  assert.throws(() => sameOrigin(new Request("https://hq.test/api/action", { headers: { Origin: "https://unrelated.test" } })), /workspace/);
  assert.throws(() => sameOrigin(new Request("https://hq.test/api/action")), /workspace/);
  sameOrigin(new Request("https://hq.test/api/action", { headers: { Origin: "https://hq.test" } }));
});
test("validation rejects empty decisions, dangerous URLs, and invalid budget amounts", async () => {
  const idea = await create("idea", { title: "Something" });
  await assert.rejects(mutate(james, command("decision", { id: idea.id, version: 1, decision: "approved", reason: " " })));
  await assert.rejects(create("plugin", { title: "Bad source", extra: { source: "javascript:alert(1)" } }), /http/);
  await assert.rejects(create("budget", { title: "Bad amount", extra: { cost: "-10" } }), /nonnegative/);
  assert.equal((await findItem(idea.id)).status, "submitted");
});
test("MCP discovery exposes no records and anonymous tool calls fail", async () => {
  const call = body => mcp(new Request("https://hq.test/mcp", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, ...body }) }));
  const tools = await (await call({ method: "tools/list" })).json(); assert.equal(tools.result.tools.length, 7); assert.equal(tools.result.tools.some(t => /approve|execute|delete/.test(t.name)), false);
  const response = await call({ method: "tools/call", params: { name: "project_summary" } }); assert.equal(response.status, 401);
});
test("an authenticated ChatGPT caller can submit a draft but cannot approve it", async () => {
  const response = await mcp(new Request("https://hq.test/mcp", { method: "POST", headers: { "oai-authenticated-user-id": tyler.id, "oai-authenticated-user-email": tyler.email }, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "submit_idea", arguments: { title: "AI-assisted proposal", body: "Evaluate first", request_id: crypto.randomUUID() } } }) }));
  const result = await response.json(); assert.equal(result.result.structuredContent.ok, true); const state = await getState(james); assert.equal(state.records[0].status, "submitted"); assert.equal(state.records[0].extra.type, "AI-assisted draft"); assert.equal(state.records.filter(r => r.kind === "task").length, 0);
});
