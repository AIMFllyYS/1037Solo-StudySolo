import type { NextRequest } from "next/server";
import { z } from "zod";
import { authorizeSkillInstaller } from "@/lib/sandbox/actor.server";
import { installedPackages, manageSkillPackage, skillRuntimeReady } from "@/lib/sandbox/skills.server";
import { sandboxFailure, SandboxError } from "@/lib/sandbox/config.server";
import { desktopCloudBridgeEnabled, forwardDesktopAgentRequest } from "@/lib/sandbox/desktop-bridge.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.object({ packageId: z.enum(["notes-to-handbook", "gb-standard-docx-pdf"]), action: z.enum(["install", "uninstall"]) }).strict();
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie, Authorization" };
export async function GET(request: NextRequest) {
  try {
    if (desktopCloudBridgeEnabled()) return await forwardDesktopAgentRequest(request);
    const scope = await authorizeSkillInstaller(request);
    return Response.json({ ready: skillRuntimeReady(), installed: (await installedPackages(scope)).map(({ packageId, version, digest }) => ({ packageId, version, digest })) }, { headers });
  } catch (error) { return sandboxFailure(error); }
}
export async function POST(request: NextRequest) {
  try {
    if (desktopCloudBridgeEnabled()) return await forwardDesktopAgentRequest(request);
    const scope = await authorizeSkillInstaller(request), raw = await request.text();
    if (Buffer.byteLength(raw) > 2000) throw new SandboxError("SANDBOX_REQUEST_TOO_LARGE", 413);
    const parsed = schema.safeParse(JSON.parse(raw));
    if (!parsed.success) throw new SandboxError("SKILL_PACKAGE_REQUEST_INVALID");
    return Response.json(await manageSkillPackage(scope, parsed.data.packageId, parsed.data.action === "install"), { headers });
  } catch (error) { return sandboxFailure(error); }
}
