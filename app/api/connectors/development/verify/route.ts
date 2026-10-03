import type { NextRequest } from "next/server";
import { developmentDiscovery } from "@/lib/connectors/development-discovery.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: NextRequest) { return developmentDiscovery(request); }
