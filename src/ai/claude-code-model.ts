import { execFile } from 'node:child_process';
import { simulateReadableStream } from 'ai';
import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4FinishReason,
  LanguageModelV4GenerateResult,
  LanguageModelV4Message,
  LanguageModelV4Prompt,
  LanguageModelV4StreamResult,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';

/**
 * Runs the `claude` CLI. Returns the raw process result instead of throwing on a
 * non-zero exit so the caller can inspect stdout/stderr for a useful error message.
 */
export type ExecFn = (args: string[], stdin: string) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

/**
 * The subset of the `claude -p --output-format json` envelope this provider reads.
 *
 * `claude -p --help` documents `--json-schema` for requesting structured output but does
 * NOT document a separate envelope field carrying that structured payload — the only
 * documented output-carrying field is `result` (a string). So structured requests are
 * read from `result` too: we parse it as JSON (after stripping any ``` fences the model
 * may have wrapped it in) and re-serialize it, rather than reading a dedicated field.
 */
interface ClaudeCodeEnvelope {
  is_error?: boolean;
  result?: string;
  /** Present in newer CLI versions when `--json-schema` is used; preferred over parsing `result`. */
  structured_output?: unknown;
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_BUFFER_BYTES = 10 * 1024 * 1024;

function buildEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    // Strip Claude Code's own nested-session markers so a session that is itself running
    // inside `claude` (e.g. this very agent) doesn't trip the child CLI's nested-session check.
    if (key.startsWith('CLAUDECODE') || key.startsWith('CLAUDE_CODE_')) {
      delete env[key];
    }
  }
  return env;
}

const defaultExec: ExecFn = (args, stdin) =>
  new Promise((resolve, reject) => {
    const child = execFile(
      'claude',
      args,
      { maxBuffer: MAX_BUFFER_BYTES, timeout: DEFAULT_TIMEOUT_MS, env: buildEnv() },
      (error, stdout, stderr) => {
        if (error && typeof (error as NodeJS.ErrnoException).code !== 'number') {
          // Spawn-level failure (binary not found, timeout, killed, ...) rather than a
          // non-zero exit from `claude` itself — nothing meaningful to parse as JSON.
          reject(error);
          return;
        }
        const exitCode = error ? ((error as unknown as { code: number }).code ?? 1) : 0;
        resolve({ stdout, stderr, exitCode });
      },
    );
    child.stdin?.write(stdin);
    child.stdin?.end();
  });

function roleLabel(role: LanguageModelV4Message['role']): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function textOf(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content
    .filter((part): part is { type: 'text'; text: string } => (part as { type?: string }).type === 'text')
    .map((part) => part.text)
    .join('');
}

/** Collapses a V4 prompt into a system string and a single stdin string for the CLI. */
export function renderPrompt(prompt: LanguageModelV4Prompt): { system: string; input: string } {
  const systemParts: string[] = [];
  const others: LanguageModelV4Message[] = [];

  for (const message of prompt) {
    if (message.role === 'system') {
      systemParts.push(message.content);
    } else {
      others.push(message);
    }
  }

  const multi = others.length > 1;
  const input = others
    .map((message) => {
      const text = textOf(message.content);
      return multi ? `${roleLabel(message.role)}:\n${text}` : text;
    })
    .join('\n\n');

  return { system: systemParts.join('\n\n'), input };
}

function stripFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  return fenced ? fenced[1].trim() : trimmed;
}

function extractText(envelope: ClaudeCodeEnvelope, structured: boolean): string {
  const stripped = stripFences(envelope.result ?? '');
  if (!structured) return stripped;
  if (envelope.structured_output !== undefined && envelope.structured_output !== null) {
    return JSON.stringify(envelope.structured_output);
  }
  try {
    return JSON.stringify(JSON.parse(stripped));
  } catch {
    return stripped;
  }
}

function mapUsage(envelope: ClaudeCodeEnvelope): LanguageModelV4Usage {
  const inputTotal = envelope.usage?.input_tokens;
  const outputTotal = envelope.usage?.output_tokens;
  return {
    inputTokens: { total: inputTotal, noCache: inputTotal, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: outputTotal, text: outputTotal, reasoning: undefined },
  };
}

function mapFinishReason(envelope: ClaudeCodeEnvelope): LanguageModelV4FinishReason {
  return { unified: 'stop', raw: envelope.stop_reason };
}

function buildArgs(modelId: string, system: string, options: LanguageModelV4CallOptions): string[] {
  // Flags chosen from `claude -p --help` (v2.1.220):
  //   -p --output-format json   non-interactive, single JSON envelope on stdout.
  //   --model <alias>           haiku | sonnet | opus.
  //   --tools ""                documented by --help as disabling all tools, which also
  //                              keeps the CLI to a single turn (no tool-call round trips).
  //                              There is no --max-turns flag in this CLI version.
  //   --no-session-persistence  don't write a resumable session to disk.
  //
  // Deliberately NOT using --bare: its own --help text says "Anthropic auth is strictly
  // ANTHROPIC_API_KEY or apiKeyHelper via --settings (OAuth and keychain are never read)".
  // The whole point of this provider is to run under the user's Claude Max OAuth login
  // instead of an API key, so --bare would silently break the one thing we need.
  const args = ['-p', '--output-format', 'json', '--model', modelId, '--tools', '', '--no-session-persistence'];

  if (system) {
    args.push('--system-prompt', system);
  }

  if (options.responseFormat?.type === 'json' && options.responseFormat.schema) {
    args.push('--json-schema', JSON.stringify(options.responseFormat.schema));
  }

  return args;
}

async function runGenerate(
  modelId: string,
  exec: ExecFn,
  options: LanguageModelV4CallOptions,
): Promise<LanguageModelV4GenerateResult> {
  const { system, input } = renderPrompt(options.prompt);
  const structured = options.responseFormat?.type === 'json' && Boolean(options.responseFormat.schema);
  const args = buildArgs(modelId, system, options);

  const { stdout, stderr, exitCode } = await exec(args, input);

  let envelope: ClaudeCodeEnvelope;
  try {
    envelope = JSON.parse(stdout) as ClaudeCodeEnvelope;
  } catch {
    throw new Error(`claude-code: could not parse CLI output as JSON: ${(stdout || stderr).slice(0, 2000)}`);
  }

  if (exitCode !== 0 || envelope.is_error) {
    throw new Error(`claude-code: ${envelope.result ?? stderr ?? `CLI exited with code ${exitCode}`}`);
  }

  return {
    content: [{ type: 'text', text: extractText(envelope, structured) }],
    finishReason: mapFinishReason(envelope),
    usage: mapUsage(envelope),
    warnings: [],
  };
}

/**
 * A `LanguageModelV4` that runs prompts through the local `claude` CLI (`claude -p`) instead
 * of calling the Anthropic API directly, so calls run under the machine's logged-in Claude
 * subscription rather than an `ANTHROPIC_API_KEY`. See `README.md` for setup and limitations.
 */
export function createClaudeCodeModel(modelId: string, deps?: { exec?: ExecFn }): LanguageModelV4 {
  const exec = deps?.exec ?? defaultExec;

  return {
    specificationVersion: 'v4',
    provider: 'claude-code',
    modelId,
    supportedUrls: {},

    async doGenerate(options: LanguageModelV4CallOptions): Promise<LanguageModelV4GenerateResult> {
      return runGenerate(modelId, exec, options);
    },

    async doStream(options: LanguageModelV4CallOptions): Promise<LanguageModelV4StreamResult> {
      const generated = await runGenerate(modelId, exec, options);
      const textContent = generated.content[0];
      const text = textContent && textContent.type === 'text' ? textContent.text : '';
      const id = 'text-1';

      return {
        stream: simulateReadableStream({
          chunks: [
            { type: 'text-start', id },
            { type: 'text-delta', id, delta: text },
            { type: 'text-end', id },
            { type: 'finish', usage: generated.usage, finishReason: generated.finishReason },
          ],
        }),
      };
    },
  };
}
