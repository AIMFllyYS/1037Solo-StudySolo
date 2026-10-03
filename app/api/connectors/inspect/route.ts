import type { NextRequest } from "next/server";
import { connectorOwner, connectorFailure, requireConnectorOrigin, ConnectorError } from "@/lib/connectors/actor.server";
import { connectorId } from "@/lib/connectors/registry";
import { connectorOperations, readConnector, proposeAction } from "@/lib/connectors/service.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  try {
    requireConnectorOrigin(request, true); const owner = await connectorOwner(request);
    const raw = await request.text(); if (raw.length > 36000) throw new ConnectorError("REQUEST_TOO_LARGE", 413);
    const input = JSON.parse(raw), provider = connectorId(input.provider);
    if (!provider) throw new ConnectorError("PROVIDER_REQUIRED");
    const result = input.action === "discover" ? await connectorOperations(owner, provider, request.signal) : input.action === "read" ? await readConnector(owner, provider, String(input.operation ?? ""), input.arguments ?? {}, request.signal) : input.action === "propose" ? await proposeAction(owner, provider, String(input.operation ?? ""), input.arguments ?? {}, request.signal) : null;
    if (!result) throw new ConnectorError("OPERATION_NOT_ALLOWED", 403);
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return connectorFailure(error); }
}
