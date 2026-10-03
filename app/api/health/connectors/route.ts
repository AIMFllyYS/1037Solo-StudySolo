import { inspectConnectorConfiguration } from "@/lib/connectors/config.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Non-sensitive application readiness only; no user connections or token values. */
export function GET() {
  return Response.json(inspectConnectorConfiguration(), {
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
