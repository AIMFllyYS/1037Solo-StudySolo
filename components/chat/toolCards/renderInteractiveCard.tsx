"use client";

import ArtifactCard from "@/components/chat/products/ArtifactCard";
import { useIsAgentSurface } from "@/lib/window/useManagedWindowSurface";
import type { ResultCardProps } from "@/lib/ai/agent/tools/registry";

export default function RenderInteractiveResultCard({ part, isStreaming }: ResultCardProps<"renderInteractive">) {
  const isAgentSurface = useIsAgentSurface();
  if (part.state !== "output-available") return null;
  return (
    <ArtifactCard
      artifactId={part.output.artifactId}
      title={part.output.title}
      prompt={part.output.prompt}
      modelId={part.output.modelId}
      unsupportedReason={part.output.unsupportedReason}
      autoStart={!!isStreaming}
      silent={isAgentSurface}
    />
  );
}
