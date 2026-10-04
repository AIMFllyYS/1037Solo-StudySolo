import type { NextRequest } from "next/server";
import { z } from "zod";
import { authorizeSkillInstaller } from "@/lib/sandbox/actor.server";
import { installedPackages, manageSkillPackage, skillRuntimeReady } from "@/lib/sandbox/skills.server";
import { sandboxFailure, SandboxError } from "@/lib/sandbox/config.server";
import { desktopCloudBridgeEnabled, forwardDesktopAgentRequest } from "@/lib/sandbox/desktop-bridge.server";
import { readSandboxJson } from "@/lib/sandbox/request.server";
import { createHash } from "node:crypto";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.object({ packageId: z.enum(["notes-to-handbook", "gb-standard-docx-pdf"]), action: z.enum(["install", "uninstall"]) }).strict();
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie, Authorization" };
export async function GET(request: NextRequest) {
  try {
    if (desktopCloudBridgeEnabled()) return await forwardDesktopAgentRequest(request);
    const scope = await authorizeSkillInstaller(request);
    return Response.json({ ownerBinding: createHash("sha256").update(scope.owner).digest("hex"), ready: skillRuntimeReady(), installed: (await installedPackages(scope)).map(({ packageId, version, digest }) => ({ packageId, version, digest })) }, { headers });
  } catch (error) { return sandboxFailure(error); }
}
export async function POST(request: NextRequest) {
  try {
    if (desktopCloudBridgeEnabled()) return await forwardDesktopAgentRequest(request);
    const scope = await authorizeSkillInstaller(request);
    const binding = request.headers.get("x-studysolo-owner-binding");
    if (binding !== null && binding !== createHash("sha256").update(scope.owner).digest("hex")) throw new SandboxError("ACCOUNT_CHANGED", 409);
    const parsed = schema.safeParse(await readSandboxJson(request, 2000));
    if (!parsed.success) throw new SandboxError("SKILL_PACKAGE_REQUEST_INVALID");
    return Response.json(await manageSkillPackage(scope, parsed.data.packageId, parsed.data.action === "install"), { headers });
  } catch (error) { return sandboxFailure(error); }
}
