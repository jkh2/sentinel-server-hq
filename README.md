# Sentinel Server HQ

A private, two-person workspace for planning, building, operating, and growing a game server.

## Included

- Shared overview and a seven-phase roadmap.
- First-use walkthrough, replayable Help & guide, optional section tips, and a downloadable short user guide.
- Ideas with discussion, required decision comments, and approval-to-task promotion.
- Task owners, priorities, dates, acceptance criteria, dependencies, and blockers.
- Persistent team chat with refresh polling while the page is visible.
- Shared notes, pinned notes, and handoffs.
- Administrator handbook with revision history and review states.
- Plugin registry and settings/rationale records.
- A planning budget ledger.
- Activity history, recoverable archives, and a complete JSON export.
- ChatGPT sign-in and an authenticated MCP endpoint with five read tools and two draft-submission tools.

The workspace contains no real server configuration by default. The optional starting plan creates 14 suggested tasks and 8 draft handbook pages. It does not install plugins, operate the game server, or activate payments.

## First use

1. Sign in using a ChatGPT account invited to the private site.
2. Select **Load starting plan**. The action is safe to repeat and preserves existing work.
3. Set the workspace name, game, server address, repository link, and budget under **Workspace settings**.
4. Assign the first tasks. Agree on how the two admins make decisions.
5. Record verified server details in the handbook and registries.
6. Use **Help & guide** in the header for a seven-step walkthrough. Tips can be dismissed per section, turned off, or reset. These preferences are local to the signed-in account in that browser.

The short guide is also available at `/user-guide.md`.

All invited site visitors share the application data and can contribute. Site viewer/editor roles govern access to the hosted site and its source; they are not read-only roles inside this collaboration application. Invite only the two intended admins. The hosting platform enforces the invitation boundary before requests reach the application. Data endpoints also require a signed-in identity, and browser writes require a same-origin request.

## Stack

- React and TypeScript on the supplied Vinext/Cloudflare Workers starter.
- Cloudflare D1 persistence, with Drizzle-managed schema migrations.
- Dispatch-owned ChatGPT sign-in and private access policies.
- Stateless HTTP MCP endpoint at `/mcp`.

The live first version uses private Sites hosting. The source is portable and can be copied into a separate GitHub repository. This is a full-stack application: publishing its code with GitHub Pages alone does not provide the database, authentication, or Worker backend. Preserving these capabilities on a different host requires the equivalent deployment bindings and authentication.

## Development and verification

Use Node 24 or newer for the SQLite-backed workflow tests. Install the dependencies with the package manager and lockfile recorded in this checkout. Do not mix package-manager lockfiles.

```sh
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit
node --test tests/workflows.test.mjs
pnpm run build
```

The workflow tests use an isolated in-memory SQLite database and the actual service SQL. They check shared initialization, approval promotion, competing decisions, idempotent submissions, optimistic editing, handbook revisions, task dependency rules, archive restoration, input validation, origin checks, and MCP authorization boundaries. They do not simulate a second user's actual hosted login or verify a ChatGPT plugin installation.

For the supported local preview and migration workflow, see the Sites starter instructions. Hosted migrations are applied during publication. Never change an already-applied migration; add a new migration for schema changes.

## Data model

- `records`: ideas, tasks, notes, handbook pages, plugins, settings, budget entries, and workspace metadata.
- `comments`: per-record discussion and decision comments.
- `messages`: team-room conversation.
- `revisions`: previous handbook content saved before edits.
- `events`: attributed application activity.

Approval and its plan task are written transactionally. A unique source reference prevents duplicate promotion. Version checks reject stale changes. A person's unsaved draft is retained in the open editor while the latest saved version is available for review; the person explicitly acknowledges a merged draft before resubmitting. Unsaved editor content is not a durable shared record until saved.

Task dependencies are checked for existence, cycles, and completion. Archiving a task required by unfinished work is rejected. Archives retain records and can be restored. Handbook verification is a human statement; approval of an idea never proves a server change was applied.

## ChatGPT connection

The hosting manifest declares the `mcp` capability. The hosting platform provisions authentication and the connection/plugin metadata after publication. Use the **ChatGPT connection** page for instructions. Each teammate connects from their own eligible account, with access limited by the same site invitation policy.

Tools: `project_summary`, `list_ideas`, `list_tasks`, `read_handbook`, `read_notes`, `submit_idea`, and `add_note`.

There is no AI approval, server-execution, spending, credential-access, or destructive tool. Write tools submit drafts attributed to the authenticated caller. Discovery contains no private project data. A successful deployed endpoint does not prove the plugin is installed in an account; verify a real authenticated read after connecting.

## Operational practices

- Keep secrets and private player records outside general project content and source control.
- Export workspace JSON regularly and keep it in your chosen protected backup location.
- Export includes archived records, full chat history, and document revisions; the chat screen shows the latest 200 messages.
- JSON export is a recovery artifact; automated import is not implemented in this version.
- Keep production and local databases separate. Never test restoration over live data.
- Use pull requests and a second-person review for substantial changes after copying the source to GitHub.

## Current limits

- The first version uses six-second refresh polling, not a WebSocket connection.
- No direct Pine Hosting server-control integration is enabled.
- Budget entries are a planning ledger, not accounting or payment processing.
- The public source mirror is https://github.com/jkh2/sentinel-server-hq. The private live deployment and its production database are separate from that public source repository. GitHub pushes do not automatically deploy the live site in this version.
- Hosted second-account access and ChatGPT tool calls must be verified using the intended accounts.
