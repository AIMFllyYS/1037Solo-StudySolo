import type { NextRequest } from "next/server";
import { authorizeSandbox } from "@/lib/sandbox/actor.server";
import { sandboxFailure } from "@/lib/sandbox/config.server";
import { SandboxService } from "@/lib/sandbox/service.server";
import { desktopCloudBridgeEnabled, forwardDesktopAgentRequest } from "@/lib/sandbox/desktop-bridge.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, context: { params: Promise<{ artifactId: string }> }) {
  try {
    if (desktopCloudBridgeEnabled()) return await forwardDesktopAgentRequest(request);
    const scope = await authorizeSandbox(request, request.nextUrl.searchParams.get("conversation") ?? "", false);
    const { artifactId } = await context.params;
    const result = await new SandboxService().artifact(scope, artifactId);
    return new Response(new Blob([Uint8Array.from(result.bytes)]), { headers: {
      "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.manifest.filename)}`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", Vary: "Cookie, Authorization",
    } });
  } catch (error) { return sandboxFailure(error); }
}
