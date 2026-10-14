export const PHASES = ["Define", "Set up", "Customize", "Test", "Launch", "Grow", "Sustain"] as const;
export const CATEGORIES = ["Infrastructure", "Gameplay", "Community", "Marketing", "Revenue", "AI", "Documentation", "General"];
export const KINDS = ["idea", "task", "note", "document", "plugin", "setting", "budget", "workspace"] as const;
export type Kind = typeof KINDS[number];
export type Extra = { acceptance?: string; dependencies?: string[]; blocker?: string; version?: string; source?: string; license?: string; cost?: string; rationale?: string; rollback?: string; testedAt?: string; type?: string; value?: string; direction?: string; recurrence?: string; game?: string; serverAddress?: string; repository?: string; monthlyBudget?: string; [key: string]: unknown };
export interface Item { id: string; kind: Kind; title: string; body: string; status: string; category: string; phase: string; priority: string; owner: string; due: string; source_id: string | null; pinned: number; extra: Extra; version: number; created_by: string; created_name: string; created_at: string; updated_at: string; }
export interface Comment { id: string; record_id: string; body: string; author_id: string; author_name: string; created_at: string; }
export interface Message { id: string; body: string; author_id: string; author_name: string; created_at: string; }
export interface Activity { id: string; record_id: string | null; description: string; author_id: string; author_name: string; created_at: string; }
export interface Revision { id: string; record_id: string; title: string; body: string; status: string; version: number; author_id: string; author_name: string; created_at: string; }
export interface User { id: string; name: string; email: string; }
export interface State { user: User; records: Item[]; comments: Comment[]; messages: Message[]; events: Activity[]; revisions: Revision[]; initialized: boolean; }

export const STATUS_LABELS: Record<string, string> = { submitted: "Submitted", approved: "Approved", declined: "Declined", deferred: "Deferred", changes: "Needs changes", todo: "To do", in_progress: "In progress", blocked: "Blocked", done: "Done", draft: "Draft", verified: "Verified", needs_review: "Needs review", archived: "Archived", active: "Active", planned: "Planned", installed: "Installed", removed: "Removed", paid: "Paid", received: "Received" };
