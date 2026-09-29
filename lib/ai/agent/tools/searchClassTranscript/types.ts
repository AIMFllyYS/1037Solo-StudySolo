import type { TextToolOutput } from "@/lib/ai/agent/tools/_types";

export type SearchClassTranscriptScope = "current" | "past";

export interface ClassTranscriptHit {
  sessionId: string;
  sessionTitle: string;
  segmentId: string;
  text: string;
  /** 本轮回答里的 [n] 编号。 */
  citeIndex?: number;
}

export interface SearchClassTranscriptInput {
  query: string;
  scope?: SearchClassTranscriptScope;
}

export interface SearchClassTranscriptOutput extends TextToolOutput {
  contextKey?: string;
  deduped?: boolean;
  scope: SearchClassTranscriptScope;
  hits: ClassTranscriptHit[];
}
