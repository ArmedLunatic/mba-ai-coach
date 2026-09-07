import { afterEach, describe, expect, it } from 'vitest';
import { createAnthropicResolver, isCheapTask, modelFor, setModelResolver } from './router';
import { mockModel } from './test-utils';

afterEach(() => setModelResolver(null));

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
