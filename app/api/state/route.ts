import { errorReply, getState, reply, requireUser } from "@/lib/service";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { try { return reply(await getState(requireUser(request))); } catch (e) { return errorReply(e); } }
