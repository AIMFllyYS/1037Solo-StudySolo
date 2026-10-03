// Dedicated independent-Agent entry. The shared handler grants execution only
// for this actual route plus the verified surface and Account scope.
import type { NextRequest } from "next/server";
import { POST as localPOST } from "@/app/api/chat/route";
import { desktopCloudBridgeEnabled, forwardDesktopAgentRequest } from "@/lib/sandbox/desktop-bridge.server";
import { sandboxFailure } from "@/lib/sandbox/config.server";
export async function POST(request: NextRequest) {
  if (!desktopCloudBridgeEnabled()) return localPOST(request);
  try { return await forwardDesktopAgentRequest(request); } catch (error) { return sandboxFailure(error); }
}
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
