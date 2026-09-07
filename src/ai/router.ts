import { anthropic } from '@ai-sdk/anthropic';
import type { LanguageModel } from 'ai';
import { createClaudeCodeModel } from './claude-code-model';

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

/**
 * Routes model calls through the local `claude` CLI instead of the Anthropic API, so they
 * run under the machine's logged-in Claude subscription. Enabled by `COACH_PROVIDER=claude-code`.
 * The two underlying models are created once and reused across calls.
 */
export function createClaudeCodeResolver(): ModelResolver {
  const haiku = createClaudeCodeModel('haiku');
  const sonnet = createClaudeCodeModel('sonnet');
  return (kind) => (isCheapTask(kind) ? haiku : sonnet);
}

/** Picks a resolver based on `COACH_PROVIDER`. Exported so tests can check it without going through the module-level cache. */
export function resolverForEnv(): ModelResolver {
  return process.env.COACH_PROVIDER === 'claude-code' ? createClaudeCodeResolver() : createAnthropicResolver();
}

let resolver: ModelResolver | null = null;

/** The only way call sites obtain a model. Tests swap the resolver with setModelResolver. */
export function modelFor(kind: TaskKind): LanguageModel {
  if (!resolver) resolver = resolverForEnv();
  return resolver(kind);
}

export function setModelResolver(r: ModelResolver | null): void {
  resolver = r;
}
