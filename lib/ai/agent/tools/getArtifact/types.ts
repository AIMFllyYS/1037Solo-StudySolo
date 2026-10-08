import type { TextToolOutput } from "@/lib/ai/agent/tools/_types";

export interface ArtifactCatalogItem {
  id: string;
  title: string;
  summary: string;
  /** 仅供 getArtifact 取回，不进 system / 历史正文。 */
  html?: string;
}

export interface GetArtifactInput {
  id: string;
  offset?:number;
}

export interface GetArtifactOutput extends TextToolOutput {
  artifactId: string;
  title?: string;
  found: boolean;
}
