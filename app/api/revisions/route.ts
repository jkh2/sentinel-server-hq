import { database, errorReply, reply, requireUser } from "@/lib/service";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { try { requireUser(request); const id = new URL(request.url).searchParams.get("id"); if (!id || id.length > 150) return reply({ error: "Choose a document." }, 400); const result = await database().prepare("SELECT * FROM revisions WHERE record_id=? ORDER BY version DESC LIMIT 100").bind(id).all(); return reply({ revisions: result.results }); } catch(e) { return errorReply(e); } }
