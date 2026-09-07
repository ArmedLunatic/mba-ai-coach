import { afterEach, describe, expect, it } from 'vitest';
import { createAnthropicResolver, isCheapTask, modelFor, resolverForEnv, setModelResolver } from './router';
import { mockModel } from './test-utils';

afterEach(() => {
  setModelResolver(null);
  delete process.env.COACH_PROVIDER;
});

describe('router', () => {
  it('classifies cheap vs coaching tasks', () => {
    expect(isCheapTask('grade')).toBe(true);
    expect(isCheapTask('test-gen')).toBe(true);
    expect(isCheapTask('greeting')).toBe(true);
    expect(isCheapTask('trend')).toBe(true);
    expect(isCheapTask('socratic')).toBe(false);
    expect(isCheapTask('critique')).toBe(false);
  });

  it('maps cheap tasks to Haiku and coaching tasks to Sonnet', () => {
    process.env.ANTHROPIC_API_KEY = 'test';
    const resolve = createAnthropicResolver();
    const modelId = (m: unknown) => (m as { modelId: string }).modelId;
    expect(modelId(resolve('grade'))).toBe('claude-haiku-4-5');
    expect(modelId(resolve('learn'))).toBe('claude-sonnet-5');
  });

  it('lets tests override the resolver', () => {
    const m = mockModel('hi');
    setModelResolver(() => m);
    expect(modelFor('learn')).toBe(m);
  });
});

describe('resolverForEnv', () => {
  const providerOf = (m: unknown) => (m as { provider: string }).provider;
  const modelIdOf = (m: unknown) => (m as { modelId: string }).modelId;

  it('selects Claude Code models with provider "claude-code" when COACH_PROVIDER=claude-code', () => {
    process.env.COACH_PROVIDER = 'claude-code';
    const resolve = resolverForEnv();

    const haiku = resolve('grade');
    const sonnet = resolve('learn');

    expect(providerOf(haiku)).toBe('claude-code');
    expect(modelIdOf(haiku)).toBe('haiku');
    expect(providerOf(sonnet)).toBe('claude-code');
    expect(modelIdOf(sonnet)).toBe('sonnet');
  });

  it('selects Anthropic models when COACH_PROVIDER is unset', () => {
    delete process.env.COACH_PROVIDER;
    process.env.ANTHROPIC_API_KEY = 'test';
    const resolve = resolverForEnv();

    expect(providerOf(resolve('grade'))).toMatch(/^anthropic/);
    expect(modelIdOf(resolve('grade'))).toBe('claude-haiku-4-5');
    expect(modelIdOf(resolve('learn'))).toBe('claude-sonnet-5');
  });
});
