import { desktopCloudBridgeEnabled, forwardDesktopAgentRequest } from "@/lib/sandbox/desktop-bridge.server";
import { sandboxFailure } from "@/lib/sandbox/config.server";
import type { NextRequest } from "next/server";
import { connectorOwner, connectorFailure, requireConnectorOrigin } from "@/lib/connectors/actor.server";
import { confirmAction } from "@/lib/connectors/service.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, context: { params: Promise<{ actionId: string }> }) {
  if (desktopCloudBridgeEnabled()) return forwardDesktopAgentRequest(request).catch(sandboxFailure);
  try { requireConnectorOrigin(request, true); const owner = await connectorOwner(request, true); return Response.json(await confirmAction(owner, (await context.params).actionId, request.signal), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return connectorFailure(error); }
}
