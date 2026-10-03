import type { NextRequest } from "next/server";
import { developmentDashboard } from "@/lib/connectors/development-oauth.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: NextRequest) { return developmentDashboard(request); }
