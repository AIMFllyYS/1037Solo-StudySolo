import type { NextRequest } from "next/server";
import { developmentCallback, developmentProvider } from "@/lib/connectors/development-oauth.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  const provider = developmentProvider((await context.params).provider);
  return provider ? developmentCallback(request, provider) : Response.json({ code: "PROVIDER_NOT_SUPPORTED" }, { status: 404 });
}
