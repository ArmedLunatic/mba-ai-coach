'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { TEST_COUNT, type SessionEvent, type SessionState } from '@/domain/session';
import { cn } from '@/lib/utils';
import { PhaseStepper } from './phase-stepper';

type Msg = { id: string; role: 'coach' | 'student'; content: string };

type Props = {
  sessionId: string;
  topic: string;
  courseName: string | null;
  initialState: SessionState;
  initialMessages: Msg[];
};

export function SessionRunner({ sessionId, topic, courseName, initialState, initialMessages }: Props) {
  const [state, setState] = useState(initialState);
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);

  async function send(event: SessionEvent) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/session/${sessionId}/step`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong.');
        return;
      }
      setState(data.state);
      setMessages(data.messages);
      setInput('');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (initialMessages.length === 0 && initialState.phase === 'learn') void send({ type: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages, busy]);

  const submitText = (make: (t: string) => SessionEvent) => {
    const t = input.trim();
    if (!t) return;
    void send(make(t));
  };

  return (
    <div className="grid gap-6">
      <PhaseStepper phase={state.phase} />

      <div className="grid gap-3">
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              'max-w-prose whitespace-pre-wrap rounded-lg px-4 py-3 text-sm leading-relaxed',
              m.role === 'coach' ? 'bg-muted' : 'justify-self-end bg-primary/10',
            )}
          >
            {m.content}
          </div>
        ))}
        {busy && <p className="text-sm text-muted-foreground">Coach is thinking…</p>}
        {error && (
          <div className="grid justify-items-start gap-2">
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
            {messages.length === 0 && state.phase === 'learn' && (
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void send({ type: 'start' })}>
                Try again
              </Button>
            )}
          </div>
        )}
        <div ref={bottom} />
      </div>

      <Card>
        <CardContent className="grid gap-3 pt-6">
          {state.phase === 'learn' && (
            <>
              {!state.learn.followUpUsed && (
                <div className="flex gap-2">
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask one follow-up question (optional)"
                    disabled={busy}
                    onKeyDown={(e) => e.key === 'Enter' && submitText((q) => ({ type: 'learn.followup', question: q }))}
                  />
                  <Button variant="outline" disabled={busy || !input.trim()} onClick={() => submitText((q) => ({ type: 'learn.followup', question: q }))}>
                    Ask
                  </Button>
                </div>
              )}
              <Button disabled={busy} onClick={() => send({ type: 'learn.done' })}>
                Got it, let&apos;s practice
              </Button>
            </>
          )}

          {(state.phase === 'practice' || state.phase === 'test') && (
            <>
              {state.phase === 'test' && (
                <p className="text-sm text-muted-foreground">
                  Question {Math.min(state.test.answers.length + 1, TEST_COUNT)} of {TEST_COUNT}
                </p>
              )}
              <Textarea value={input} onChange={(e) => setInput(e.target.value)} rows={3} placeholder="Your answer" disabled={busy} />
              <Button
                disabled={busy || !input.trim()}
                onClick={() =>
                  submitText((a) => (state.phase === 'practice' ? { type: 'practice.answer', answer: a } : { type: 'test.answer', answer: a }))
                }
              >
                Submit answer
              </Button>
            </>
          )}

          {state.phase === 'explain' && (
            <>
              <p className="text-sm">
                Explain <span className="font-medium">{topic}</span> in your own words, as if to a classmate. Three to six sentences.
              </p>
              <Textarea value={input} onChange={(e) => setInput(e.target.value)} rows={5} disabled={busy} />
              <Button disabled={busy || !input.trim()} onClick={() => submitText((t) => ({ type: 'explain.submit', text: t }))}>
                Get feedback
              </Button>
            </>
          )}

          {state.phase === 'feedback' && (
            <>
              <p className="text-sm">
                Test score: <span className="font-medium tabular-nums">{state.test.score ?? 0}/100</span>. How confident do you feel about {topic} now?
              </p>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Button key={n} variant="outline" disabled={busy} onClick={() => send({ type: 'feedback.confirm', selfConfidence: n })}>
                    {n}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">1 = not confident, 5 = very confident</p>
            </>
          )}

          {state.phase === 'done' && (
            <>
              <p className="text-sm">
                Session complete. {courseName ? `${courseName}: ` : ''}
                {topic} updated in your skill profile.
              </p>
              <Button render={<Link href="/" />}>Back to dashboard</Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
