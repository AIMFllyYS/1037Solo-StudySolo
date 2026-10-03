import type { NextRequest } from "next/server";
import { zoteroDevelopmentCallback } from "@/lib/connectors/development-zotero.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: NextRequest) { return zoteroDevelopmentCallback(request); }
