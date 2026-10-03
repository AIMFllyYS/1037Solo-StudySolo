import type { NextRequest } from "next/server";
import { zoteroDevelopmentConnect } from "@/lib/connectors/development-zotero.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function POST(request: NextRequest) { return zoteroDevelopmentConnect(request); }
