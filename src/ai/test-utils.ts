import type { LanguageModel } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import type { ModelResolver, TaskKind } from './router';

/** A model that always answers with `text` (JSON string for structured outputs). */
export function mockModel(text: string): LanguageModel {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text', text }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 1, text: 1, reasoning: undefined },
      },
      warnings: [],
    }),
  });
}

export function mockResolver(byKind: Partial<Record<TaskKind, string>>, fallback = 'ok'): ModelResolver {
  return (kind) => mockModel(byKind[kind] ?? fallback);
}
