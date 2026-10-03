import type { NextRequest } from "next/server";
import { connectorOwner, connectorFailure, requireConnectorOrigin } from "@/lib/connectors/actor.server";
import { cancelAction } from "@/lib/connectors/service.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, context: { params: Promise<{ actionId: string }> }) {
  try { requireConnectorOrigin(request, true); const owner = await connectorOwner(request); return Response.json(await cancelAction(owner, (await context.params).actionId), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return connectorFailure(error); }
}
