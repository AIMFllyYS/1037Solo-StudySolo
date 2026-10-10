import { z } from 'zod';
import type { ThinkingRequestStyle } from '@/lib/ai/models';

const entry = z.object({
  apiModelId: z.string().trim().min(1).optional(),
  thinkingRequestStyle: z.enum(['none', 'openai-reasoning-effort', 'openrouter-reasoning', 'deepseek-thinking', 'mimo-thinking', 'gemini-thinking-level', 'anthropic-thinking', 'siliconflow']).optional(),
  enabled: z.boolean().optional(),
  temperature: z.number().finite().min(0).max(2).optional(),
});

/** Server-only operator overrides. IDs are opaque; never infer a vendor API name from a label. */
export function relayModelConfig(id: string, raw = process.env.RELAY_MODEL_CONFIG): {
  apiModelId?: string; thinkingRequestStyle: ThinkingRequestStyle; enabled: boolean; temperature?: number;
} {
  let config: z.infer<typeof entry> | undefined;
  if (raw?.trim()) {
    try {
      config = z.record(z.string(), entry).parse(JSON.parse(raw))[id];
    } catch {
      throw new Error('中转模型配置格式无效，请联系管理员检查 RELAY_MODEL_CONFIG。');
    }
  }
  // Built-in gateway calls use the OpenAI wire contract, never original-vendor payloads.
  return {
    ...config, enabled: config?.enabled ?? true,
    thinkingRequestStyle: config?.thinkingRequestStyle === 'none' ? 'none' : 'openai-reasoning-effort',
    ...(id === 'kimi-k3' ? { thinkingRequestStyle: 'none' as const, temperature: 1 } : {}),
  };
}
