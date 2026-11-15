import { useEffect, useRef, useState } from 'react';
import { HeartHandshake, MoreHorizontal, Send, X } from 'lucide-react';
import type { AiStatus, ChatRequest, ChatResponse } from '@orbital/contracts';

/**
 * Companion chat (Mochi M1). Ordinary conversation is answered by the local model (Ollama) and streamed here
 * already guarded by the main process. Safety, journal, memory and app commands are deterministic. When no
 * model is available Mochi shows a visible "simple mode" badge — template replies are never presented as AI.
 * Urgent support replies use fixed wording and a distinct, calm presentation — never playful.
 */
export function ChatPanel({ name, onClose, onMenu, onUrgent }: { name: string; onClose(): void; onMenu(): void; onUrgent(): void }) {
  const [res, setRes] = useState<ChatResponse | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingUser, setPendingUser] = useState<string | null>(null);
  const [streamText, setStreamText] = useState('');
  const [ai, setAi] = useState<AiStatus | null>(null);
  const list = useRef<HTMLDivElement>(null);

  const send = async (req: ChatRequest) => {
    setBusy(true);
    setStreamText('');
    setPendingUser(req.text ?? null);
    try {
      const r = await window.orbitalPet.invoke('companion:chat', req);
      setRes(r);
      if (r.urgent) onUrgent();
    } finally {
      setBusy(false);
      setPendingUser(null);
      setStreamText('');
    }
  };
  useEffect(() => {
    void window.orbitalPet.invoke('ai:status').then(setAi);
    const offs = [window.orbitalPet.on('ai:status', setAi), window.orbitalPet.on('chat:stream', (e) => !e.done && setStreamText(e.text))];
    void send({ action: 'open' });
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [res, streamText, pendingUser]);
  const simple = !ai || ai.simpleMode;

  const submit = () => {
    const t = text.trim();
    if (!t || busy) return;
    setText('');
    void send({ text: t });
  };
  const turns = res?.history.slice(-8) ?? [];
  const support = res?.mode === 'support';

  return (
    <div data-testid="chat" className="companion-panel flex h-[248px] w-[272px] flex-col overflow-hidden rounded-2xl border border-line bg-surface text-[13px] text-ink">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="text-[12px] font-semibold">
          {name}
          {res?.mode === 'journal' && <span className="ml-1.5 font-normal text-ink-3">· private journal</span>}
        </span>
        <span className="flex items-center gap-1.5">
          {simple ? (
            <span
              data-testid="simple-mode"
              title={ai?.detail ?? 'Local AI is not available. Mochi is using simple built-in replies.'}
              className="rounded-full bg-[color-mix(in_oklab,var(--o-watch)_18%,transparent)] px-1.5 py-px text-[10.5px] font-semibold text-[var(--o-watch)]"
            >
              Simple mode
            </span>
          ) : (
            <span data-testid="ai-mode" title={`Replies by ${ai?.activeModel} on this computer (Ollama)`} className="text-[10.5px] text-ink-3">
              local AI
            </span>
          )}
          <button onClick={onMenu} aria-label="Menu" className="text-ink-3 hover:text-ink">
            <MoreHorizontal size={14} />
          </button>
          <button onClick={onClose} aria-label="Close chat" className="text-ink-3 hover:text-ink">
            <X size={14} />
          </button>
        </span>
      </div>
      {simple && (
        <p className="border-b border-line bg-surface-2 px-3 py-1 text-[11px] leading-[15px] text-ink-3">
          {ai?.state === 'off' ? 'AI is turned off — simple replies.' : ai?.state === 'model-missing' ? 'Local model not installed — simple replies.' : 'Local AI unavailable — simple replies.'}{' '}
          {ai?.state !== 'off' && (
            <button onClick={() => void window.orbitalPet.invoke('app:openDashboard', { section: 'setup' })} className="font-semibold text-accent underline">
              Set up
            </button>
          )}
        </p>
      )}
      <div ref={list} className="flex-1 space-y-1.5 overflow-y-auto px-3 py-2">
        {turns.map((t, k) => (
          <p
            key={k}
            className={
              t.from === 'user'
                ? 'ml-6 rounded-xl rounded-br-sm bg-accent px-2.5 py-1.5 text-bg'
                : support && k === turns.length - 1
                  ? 'rounded-xl border border-line bg-surface-2 px-2.5 py-1.5 leading-[18px]'
                  : 'mr-6 rounded-xl rounded-bl-sm bg-surface-2 px-2.5 py-1.5'
            }
          >
            {support && t.from === 'companion' && k === turns.length - 1 && <HeartHandshake size={13} className="mr-1 mb-0.5 inline text-accent" />}
            {t.text}
          </p>
        ))}
        {pendingUser && <p className="ml-6 rounded-xl rounded-br-sm bg-accent px-2.5 py-1.5 text-bg">{pendingUser}</p>}
        {busy && (
          <p data-testid="streaming" className="mr-6 rounded-xl rounded-bl-sm bg-surface-2 px-2.5 py-1.5">
            {streamText || <span className="tracking-widest text-ink-3">···</span>}
          </p>
        )}
        {support && <p className="text-[11px] text-ink-3">Demonstration: no message is actually sent. In operations this notifies your configured crew-support contacts.</p>}
      </div>
      {res && res.quickReplies.length > 0 && (
        <div className="flex flex-wrap gap-1 border-t border-line px-2 py-1.5">
          {res.quickReplies.map((q) => (
            <button
              key={q.label}
              data-quick={q.label}
              disabled={busy}
              onClick={() => (q.label === 'Open support in Dr G Zero' ? void window.orbitalPet.invoke('app:focusDashboard') : void send(q.request))}
              className="rounded-full border border-line px-2 py-0.5 text-[11.5px] font-medium hover:bg-surface-2"
            >
              {q.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1.5 border-t border-line px-2 py-1.5">
        <input
          data-testid="chat-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder={res?.mode === 'journal' ? 'Write as much or little as you like…' : `Say something to ${name}…`}
          maxLength={1000}
          className="min-w-0 flex-1 rounded-lg bg-surface-2 px-2 py-1 text-[12.5px] outline-none placeholder:text-ink-3"
        />
        <button onClick={submit} disabled={busy || !text.trim()} aria-label="Send" className="text-accent disabled:opacity-40">
          <Send size={15} />
        </button>
      </div>
      <button onClick={() => void send({ action: 'talk-to-someone' })} className="border-t border-line py-1 text-[11px] font-medium text-ink-3 hover:text-ink">
        I’d like to talk to someone
      </button>
    </div>
  );
}
