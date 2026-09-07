import { anthropic } from '@ai-sdk/anthropic';
import type { LanguageModel } from 'ai';

export type TaskKind = 'greeting' | 'test-gen' | 'grade' | 'trend' | 'learn' | 'socratic' | 'critique' | 'feedback';
export type ModelResolver = (kind: TaskKind) => LanguageModel;

export const MODEL_IDS = { cheap: 'claude-haiku-4-5', coach: 'claude-sonnet-5' } as const;

const CHEAP = new Set<TaskKind>(['greeting', 'test-gen', 'grade', 'trend']);

export function isCheapTask(kind: TaskKind): boolean {
  return CHEAP.has(kind);
}

export function createAnthropicResolver(): ModelResolver {
  return (kind) => anthropic(isCheapTask(kind) ? MODEL_IDS.cheap : MODEL_IDS.coach);
}

let resolver: ModelResolver | null = null;

/** The only way call sites obtain a model. Tests swap the resolver with setModelResolver. */
export function modelFor(kind: TaskKind): LanguageModel {
  if (!resolver) resolver = createAnthropicResolver();
  return resolver(kind);
}

export function setModelResolver(r: ModelResolver | null): void {
  resolver = r;
}
