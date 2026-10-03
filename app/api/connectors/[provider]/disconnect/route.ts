import type { NextRequest } from "next/server";
import { connectorOwner, connectorFailure, requireConnectorOrigin, ConnectorError } from "@/lib/connectors/actor.server";
import { oauthConnectorId } from "@/lib/connectors/registry";
import { disconnectConnector } from "@/lib/connectors/connections.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  try { requireConnectorOrigin(request, true); const owner = await connectorOwner(request, true), provider = oauthConnectorId((await context.params).provider); if (!provider) throw new ConnectorError("PROVIDER_NOT_SUPPORTED"); return Response.json(await disconnectConnector(owner, provider), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return connectorFailure(error); }
}
