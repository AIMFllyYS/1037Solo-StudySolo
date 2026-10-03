import type { NextRequest } from "next/server";
import { z } from "zod";
import { authorizeSandbox } from "@/lib/sandbox/actor.server";
import { sandboxFailure, SandboxError } from "@/lib/sandbox/config.server";
import { SandboxService } from "@/lib/sandbox/service.server";
import { desktopCloudBridgeEnabled, forwardDesktopAgentRequest } from "@/lib/sandbox/desktop-bridge.server";
import { readSandboxJson } from "@/lib/sandbox/request.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.object({
  conversationId: z.string().regex(/^[A-Za-z0-9_.:-]{1,100}$/),
  action: z.enum(["status", "open", "exec", "poll", "write", "read", "list", "cancel", "close", "publish"]),
  sessionId: z.string().uuid().optional(), commandId: z.string().uuid().optional(),
  command: z.string().max(32000).optional(), path: z.string().max(256).optional(), content: z.string().max(262144).optional(), timeoutSeconds: z.number().int().min(1).max(600).optional(),
}).strict();
export async function POST(request: NextRequest) {
  try {
    if (desktopCloudBridgeEnabled()) return await forwardDesktopAgentRequest(request);
    const parsed = schema.safeParse(await readSandboxJson(request, 400000));
    if (!parsed.success) throw new SandboxError("SANDBOX_REQUEST_INVALID");
    const { conversationId, ...input } = parsed.data;
    const scope = await authorizeSandbox(request, conversationId, !["status", "poll", "read", "list"].includes(input.action));
    const output = await new SandboxService().operate(scope, input);
    return Response.json({ ...output, conversationId }, { headers: { "Cache-Control": "private, no-store", Vary: "Cookie, Authorization" } });
  } catch (error) { return sandboxFailure(error); }
}
