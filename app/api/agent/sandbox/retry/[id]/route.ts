import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { authorizeSandbox, sandboxActionRequiresRecentAuth } from "@/lib/sandbox/actor.server";
import { sandboxFailure, SandboxError } from "@/lib/sandbox/config.server";
import { SandboxService } from "@/lib/sandbox/service.server";
import { readSandboxJson } from "@/lib/sandbox/request.server";
import { desktopCloudBridgeEnabled, forwardDesktopAgentRequest } from "@/lib/sandbox/desktop-bridge.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.object({ conversationId: z.string().regex(/^[A-Za-z0-9_.:-]{1,100}$/) }).strict();
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    if (desktopCloudBridgeEnabled()) return await forwardDesktopAgentRequest(request);
    const { id } = await context.params;
    const parsed = schema.safeParse({ conversationId: request.nextUrl.searchParams.get("conversation") });
    if (!parsed.success || !z.string().uuid().safeParse(id).success) throw new SandboxError("SANDBOX_RETRY_INVALID");
    const scope = await authorizeSandbox(request, parsed.data.conversationId, false);
    if (request.headers.get("x-studysolo-owner-binding") !== createHash("sha256").update(scope.owner).digest("hex")) throw new SandboxError("ACCOUNT_CHANGED", 409);
    return Response.json(await new SandboxService().authRetryStatus(scope, id), { headers: { "Cache-Control": "private, no-store", Vary: "Cookie, Authorization" } });
  } catch (error) { return sandboxFailure(error); }
}
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    if (desktopCloudBridgeEnabled()) return await forwardDesktopAgentRequest(request);
    const parsed = schema.safeParse(await readSandboxJson(request, 2000));
    const { id } = await context.params;
    if (!parsed.success || !z.string().uuid().safeParse(id).success) throw new SandboxError("SANDBOX_RETRY_INVALID");
    const scope = await authorizeSandbox(request, parsed.data.conversationId, false);
    if (request.headers.get("x-studysolo-owner-binding") !== createHash("sha256").update(scope.owner).digest("hex")) throw new SandboxError("ACCOUNT_CHANGED", 409);
    const output = await new SandboxService().resumeAuthRetry(scope, id, async action => {
      const current = await authorizeSandbox(request, scope.conversationId, sandboxActionRequiresRecentAuth(action));
      if (current.owner !== scope.owner) throw new SandboxError("ACCOUNT_CHANGED", 409);
      return current;
    });
    return Response.json(output, { headers: { "Cache-Control": "private, no-store", Vary: "Cookie, Authorization" } });
  } catch (error) { return sandboxFailure(error); }
}
