import type { NextRequest } from "next/server";
import { developmentConnect, developmentProvider } from "@/lib/connectors/development-oauth.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  const provider = developmentProvider((await context.params).provider);
  return provider ? developmentConnect(request, provider) : Response.json({ code: "PROVIDER_NOT_SUPPORTED" }, { status: 404 });
}
