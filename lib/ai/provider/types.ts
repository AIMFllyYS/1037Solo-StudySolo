import { type ProviderKind, type CustomApiProtocol, type ThinkingRequestStyle } from "@/lib/ai/models";

import { type ImageApiStyle as CapabilityImageApiStyle } from "@/lib/ai/endpoints/capabilityEndpoints";

export type ImageApiStyle = CapabilityImageApiStyle;

export interface CustomProvider {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

export interface ResolvedProvider {
  billingProvider?: ProviderKind;
  /** Built-in OpenAI gateway uses its own sampling defaults, not the calling feature's temperature. */
  gatewayDefaults?: boolean;
  temperature?: number;
  /** 注册 id（菜单/设置），用于 getModelInfo、计费展示 */
  registryId: string;
  /** 发给上游 chat/completions 的 model 字段 */
  apiModelId: string;
  baseUrl: string;
  apiKey: string;
  reasoningField: string;
  thinkingRequestStyle: ThinkingRequestStyle;
  /** 三选一协议：决定请求路径与消息体格式；内置模型固定为 openai。 */
  apiProtocol: CustomApiProtocol;
  isCustom: boolean;
  configured: boolean;
  /** 当前使用的 endpoints 链索引 */
  endpointIndex: number;
  timeoutMs: number;
}

export interface ProviderCredentials {
  baseUrl: string;
  apiKey: string;
  configured: boolean;
}

/** 生图 provider 解析结果。 */
export interface ResolvedImageProvider {
  baseUrl: string;
  apiKey: string;
  /** 发给上游 /images/generations 的 model 字段。 */
  apiModelId: string;
  /** 注册 id（custom:xxx:yyy 或内置 id），用于计费展示与供应商归类。 */
  registryId: string;
  configured: boolean;
  isCustom: boolean;
  imageApiStyle: ImageApiStyle;
}