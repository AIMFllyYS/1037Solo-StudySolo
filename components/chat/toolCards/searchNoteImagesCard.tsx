"use client";

import NoteImageGallery from "@/components/chat/sources/NoteImageGallery";
import type { ResultCardProps } from "@/lib/ai/agent/tools/registry";

export default function SearchNoteImagesResultCard({ part }: ResultCardProps<"searchNoteImages">) {
  if (part.state !== "output-available" || !part.output.images?.length) return null;
  const query = typeof part.input === "object" && part.input
    ? String((part.input as { query?: unknown }).query ?? "")
    : "";
  return <NoteImageGallery images={part.output.images} query={query} />;
}
