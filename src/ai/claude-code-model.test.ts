import { generateText, Output, streamText } from 'ai';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { createClaudeCodeModel, renderPrompt, type ExecFn } from './claude-code-model';
import { testGradeSchema } from './schemas';

function envelope(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    is_error: false,
    result: 'ok',
    stop_reason: 'end_turn',
    usage: { input_tokens: 12, output_tokens: 34 },
    ...overrides,
  });
}

describe('renderPrompt', () => {
  it('joins system messages and renders a single user message verbatim', () => {
    const { system, input } = renderPrompt([
      { role: 'system', content: 'Be terse.' },
      { role: 'user', content: [{ type: 'text', text: 'Explain WACC.' }] },
    ]);
    expect(system).toBe('Be terse.');
    expect(input).toBe('Explain WACC.');
  });

  it('joins multiple system messages with a blank line', () => {
    const { system } = renderPrompt([
      { role: 'system', content: 'First.' },
      { role: 'system', content: 'Second.' },
      { role: 'user', content: [{ type: 'text', text: 'Hi' }] },
    ]);
    expect(system).toBe('First.\n\nSecond.');
  });

  it('prefixes with role labels when there is more than one non-system message', () => {
    const { input } = renderPrompt([
      { role: 'user', content: [{ type: 'text', text: 'Question' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Answer' }] },
    ]);
    expect(input).toBe('User:\nQuestion\n\nAssistant:\nAnswer');
  });
});

describe('createClaudeCodeModel', () => {
  it('sends the model alias, system prompt, output format, and pipes the user text as stdin', async () => {
    let seenArgs: string[] = [];
    let seenStdin = '';
    const exec: ExecFn = async (args, stdin) => {
      seenArgs = args;
      seenStdin = stdin;
      return { stdout: envelope({ result: 'Hello there.' }), stderr: '', exitCode: 0 };
    };

    const model = createClaudeCodeModel('haiku', { exec });
    const result = await model.doGenerate({
      prompt: [
        { role: 'system', content: 'You are a calm MBA coach.' },
        { role: 'user', content: [{ type: 'text', text: 'What is WACC?' }] },
      ],
    } as Parameters<typeof model.doGenerate>[0]);

    expect(seenArgs).toEqual(
      expect.arrayContaining(['--model', 'haiku', '--system-prompt', 'You are a calm MBA coach.', '--output-format', 'json']),
    );
    expect(seenStdin).toBe('What is WACC?');
    expect(result.content).toEqual([{ type: 'text', text: 'Hello there.' }]);
    expect(result.usage.inputTokens.total).toBe(12);
    expect(result.usage.outputTokens.total).toBe(34);
    expect(result.finishReason).toEqual({ unified: 'stop', raw: 'end_turn' });
  });

  it('passes --json-schema for a structured request and returns the JSON object as text', async () => {
    let seenArgs: string[] = [];
    const exec: ExecFn = async (args) => {
      seenArgs = args;
      return { stdout: envelope({ result: '{"score":88,"mistakes":["forgot tax shield"]}' }), stderr: '', exitCode: 0 };
    };

    const model = createClaudeCodeModel('haiku', { exec });
    const schema = { type: 'object', properties: { score: { type: 'number' } }, required: ['score'] };
    const result = await model.doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Grade this.' }] }],
      responseFormat: { type: 'json', schema },
    } as Parameters<typeof model.doGenerate>[0]);

    const schemaIndex = seenArgs.indexOf('--json-schema');
    expect(schemaIndex).toBeGreaterThan(-1);
    expect(JSON.parse(seenArgs[schemaIndex + 1])).toEqual(schema);

    const text = result.content[0];
    expect(text).toEqual({ type: 'text', text: JSON.stringify({ score: 88, mistakes: ['forgot tax shield'] }) });
  });

  it('rejects with the envelope result text when is_error is true', async () => {
    const exec: ExecFn = async () => ({
      stdout: envelope({ is_error: true, result: 'overloaded_error: try again later' }),
      stderr: '',
      exitCode: 0,
    });

    const model = createClaudeCodeModel('haiku', { exec });
    await expect(
      model.doGenerate({
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
      } as Parameters<typeof model.doGenerate>[0]),
    ).rejects.toThrow(/overloaded_error: try again later/);
  });

  it('rejects with stderr when the CLI exits non-zero and stdout is not valid JSON', async () => {
    const exec: ExecFn = async () => ({ stdout: '', stderr: 'claude: command not found', exitCode: 127 });

    const model = createClaudeCodeModel('haiku', { exec });
    await expect(
      model.doGenerate({
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
      } as Parameters<typeof model.doGenerate>[0]),
    ).rejects.toThrow(/claude: command not found/);
  });

  it('unwraps a ```json fenced structured result', async () => {
    const exec: ExecFn = async () => ({
      stdout: envelope({ result: '```json\n{"score":50,"mistakes":[]}\n```' }),
      stderr: '',
      exitCode: 0,
    });

    const model = createClaudeCodeModel('haiku', { exec });
    const result = await model.doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Grade' }] }],
      responseFormat: { type: 'json', schema: { type: 'object' } },
    } as Parameters<typeof model.doGenerate>[0]);

    expect(result.content).toEqual([{ type: 'text', text: JSON.stringify({ score: 50, mistakes: [] }) }]);
  });

  it('unwraps a plain ``` fenced non-structured result', async () => {
    const exec: ExecFn = async () => ({ stdout: envelope({ result: '```\nHello, world!\n```' }), stderr: '', exitCode: 0 });

    const model = createClaudeCodeModel('haiku', { exec });
    const result = await model.doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
    } as Parameters<typeof model.doGenerate>[0]);

    expect(result.content).toEqual([{ type: 'text', text: 'Hello, world!' }]);
  });

  it('works end-to-end through generateText with Output.object', async () => {
    const exec: ExecFn = async () => ({
      stdout: envelope({ result: '{"score":75,"mistakes":["mixed up NPV and IRR"]}' }),
      stderr: '',
      exitCode: 0,
    });
    const model = createClaudeCodeModel('sonnet', { exec });

    const { output } = await generateText({
      model,
      prompt: 'Grade this test.',
      output: Output.object({ schema: testGradeSchema }),
    });

    expect(output.score).toBe(75);
    expect(output.mistakes).toEqual(['mixed up NPV and IRR']);
  });

  it('doStream yields the full text through streamText', async () => {
    const exec: ExecFn = async () => ({ stdout: envelope({ result: 'The blended cost of capital.' }), stderr: '', exitCode: 0 });
    const model = createClaudeCodeModel('haiku', { exec });

    const result = streamText({ model, prompt: 'What is WACC?' });
    expect(await result.text).toBe('The blended cost of capital.');
  });

  it('rejects unsupported schemas so callers see a Zod validation error, not silent corruption', async () => {
    const exec: ExecFn = async () => ({ stdout: envelope({ result: '{"score":"not-a-number","mistakes":[]}' }), stderr: '', exitCode: 0 });
    const model = createClaudeCodeModel('haiku', { exec });

    await expect(
      generateText({ model, prompt: 'Grade this.', output: Output.object({ schema: z.object({ score: z.number() }) }) }),
    ).rejects.toThrow();
  });
});
