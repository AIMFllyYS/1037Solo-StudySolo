import { REQUEST_LIMITS } from "./limits";
import { RequestTooLargeError } from "./errors";
import { chatRequestSchema, type ChatRequest } from "./chat";
import { artifactRequestSchema, documentRequestSchema, imageGenRequestSchema, recordRequestSchema, canvasReviseRequestSchema, type ArtifactRequest, type DocumentRequest, type ImageGenRequest, type RecordRequest, type CanvasReviseRequest } from "./satellite";
function rawRequestBytes(raw: unknown): number {
  try {
    return new TextEncoder().encode(typeof raw === "string" ? raw : JSON.stringify(raw ?? {})).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/** 解析请求体；不合法时抛出 ZodError，由路由转成用户可读的错误事件。 */
export function parseChatRequest(raw: unknown): ChatRequest {
  if (rawRequestBytes(raw) > REQUEST_LIMITS.requestBytes) {
    throw new RequestTooLargeError();
  }
  return chatRequestSchema.parse(raw ?? {});
}

export function parseArtifactRequest(raw: unknown): ArtifactRequest {
  return artifactRequestSchema.parse(raw ?? {});
}

export function parseDocumentRequest(raw: unknown): DocumentRequest {
  return documentRequestSchema.parse(raw ?? {});
}

export function parseImageGenRequest(raw: unknown): ImageGenRequest {
  return imageGenRequestSchema.parse(raw ?? {});
}

export function parseRecordRequest(raw: unknown): RecordRequest {
  return recordRequestSchema.parse(raw ?? {});
}

export function parseCanvasReviseRequest(raw: unknown): CanvasReviseRequest {
  return canvasReviseRequestSchema.parse(raw ?? {});
}