import type { NextRequest } from 'next/server';
import type { UIMessageStreamWriter } from 'ai';
import type { CustomApiGroup } from '@/lib/ai/models';
import type { resolveProvider } from '@/lib/ai/provider';
import type { ChatRequest } from '@/lib/ai/agent/requestSchema';
import type { ChatMessage, ChatOptions, ChatContext } from '@/lib/types/chat';
export interface ChatGenerationInput {
  req: NextRequest;
  body: ChatRequest;
  writer: UIMessageStreamWriter<ChatMessage>;
  modelId?: string;
  effectiveModelId?: string;
  effectiveCustom: Parameters<typeof resolveProvider>[1];
  customGroups: CustomApiGroup[];
  automaticModels?: string[];
  isImageMode: boolean;
  secrets: string[];
  formatError: (error: unknown) => string;
  generationAbort: AbortController;
  generationSignal: AbortSignal;
  userId: string | null;
  requestId: string;
  autoSearch: boolean;
  options: ChatOptions;
  chatCtx: ChatContext & { academicYear: ChatRequest['academicYear'] };
  localUsedSteps: number;
}
