import type { NextRequest } from "next/server";
import { zoteroDevelopmentConnect } from "@/lib/connectors/development-zotero.server";
import { desktopCloudBridgeEnabled, desktopConnectorAuthorizationPage } from "@/lib/sandbox/desktop-bridge.server";
import { sandboxFailure } from "@/lib/sandbox/config.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function POST(request: NextRequest) {
  if (desktopCloudBridgeEnabled()) { try { return desktopConnectorAuthorizationPage(request, "zotero"); } catch (error) { return sandboxFailure(error); } }
  return zoteroDevelopmentConnect(request);
}
