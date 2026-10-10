"use client";

import NoteCitationCard from "@/components/chat/sources/NoteCitationCard";
import type { ResultCardProps } from "@/lib/ai/agent/tools/registry";

export default function SearchNotesResultCard({ part }: ResultCardProps<"searchNotes">) {
  if (part.state !== "output-available" || !part.output.hits?.length) return null;
  const classHits = part.output.hits.filter((hit) => hit.kind !== "personal" && hit.path && !hit.path.startsWith("note:"));
  if (!classHits.length) return null;
  return <NoteCitationCard hits={classHits} />;
}
