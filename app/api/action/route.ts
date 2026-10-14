import { errorReply, mutate, readBody, reply, requireUser, sameOrigin } from "@/lib/service";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { try { const user = requireUser(request); sameOrigin(request); return reply(await mutate(user, await readBody(request))); } catch (e) { return errorReply(e); } }
