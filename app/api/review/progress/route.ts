// Next.js request adapter; server policy, schema and storage are separate responsibilities.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export { GET, POST } from "@/lib/review-mode/progress/server/handlers";
