"use client";

import ImageGenCard from "@/components/chat/products/ImageGenCard";
import type { ResultCardProps } from "@/lib/ai/agent/tools/registry";

export default function GenerateImageResultCard({ part }: ResultCardProps<"generateImage">) {
  if (part.state !== "output-available") return null;
  return (
    <ImageGenCard
      imageGenId={part.output.imageGenId}
      prompt={part.output.prompt}
      title={part.output.title}
      size={part.output.size}
      count={part.output.count}
      modelId={part.output.modelId}
    />
  );
}
