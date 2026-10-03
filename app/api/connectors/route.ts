import { desktopCloudBridgeEnabled, forwardDesktopAgentRequest } from "@/lib/sandbox/desktop-bridge.server";
import { sandboxFailure } from "@/lib/sandbox/config.server";
import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { connectorOwner, connectorFailure, requireConnectorOrigin } from "@/lib/connectors/actor.server";
import { connectionStatus } from "@/lib/connectors/connections.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  if (desktopCloudBridgeEnabled()) return forwardDesktopAgentRequest(request).catch(sandboxFailure);
  try { requireConnectorOrigin(request); const owner = await connectorOwner(request); return Response.json({ connections: await connectionStatus(owner), ownerBinding: createHash("sha256").update(owner).digest("hex") }, { headers: { "Cache-Control": "private, no-store", Vary: "Cookie, Authorization" } }); }
  catch (error) { return connectorFailure(error); }
}
