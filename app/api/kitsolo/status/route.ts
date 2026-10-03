import type { NextRequest } from "next/server";
import { kitSoloStatus } from "@/lib/plugins/kitsolo-oauth-client";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: NextRequest) { return kitSoloStatus(request, "studysolo"); }
