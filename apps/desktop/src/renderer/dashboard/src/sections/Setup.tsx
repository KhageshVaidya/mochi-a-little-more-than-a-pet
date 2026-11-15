import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Download, ExternalLink, Loader2, MessageCircle, RefreshCw } from 'lucide-react';
import { DEFAULT_AI, type AiStatus } from '@orbital/contracts';
import { useApp } from '../stores/app';
import { cn } from '../lib/cn';
import { Card, SectionHeader } from '../components/ui';

/**
 * First-run setup for Mochi's local AI (opens automatically once if the model isn't ready).
 *  1. Ollama installed and running?  2. Model available? (download only after explicit confirmation)
 *  3. Verify a real reply.  4. Meet Mochi.  Mochi works in visible simple mode until this is done.
 */
export function Setup() {
  const { prefs, setPrefs } = useApp();
  const [st, setSt] = useState<AiStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pull, setPull] = useState<{ status: string; completed?: number; total?: number } | null>(null);
  const [pullError, setPullError] = useState<string | null>(null);
  const [verify, setVerify] = useState<{ ok: boolean; reply?: string; ms?: number; model?: string; error?: string } | null>(null);
  const [verifying, setVerifying] = useState(false);

  const check = async () => {
    setChecking(true);
    setSt(await window.orbital.invoke('ai:check'));
    setChecking(false);
  };
  useEffect(() => {
    void check();
    const offs = [window.orbital.on('ai:status', setSt), window.orbital.on('ai:pull-progress', (p) => setPull(p))];
    return () => offs.forEach((o) => o());
  }, []);
  if (!prefs) return null;

  const model = prefs.ai.ollama.model;
  const ollamaOk = !!st && st.state !== 'unreachable' && st.state !== 'checking' && st.provider === 'ollama' && st.ollamaVersion !== null;
  const modelOk = st?.state === 'ready';
  const pct = pull?.total ? Math.round(((pull.completed ?? 0) / pull.total) * 100) : null;
  const downloading = pull !== null && pull.status !== 'success' && !pullError;

  const Step = ({ n, done, title, children }: { n: number; done: boolean; title: string; children: React.ReactNode }) => (
    <li className="flex gap-4 border-t border-line px-6 py-5 first:border-t-0" data-setup-step={n} data-done={done}>
      <span className={cn('mt-0.5 shrink-0', done ? 'text-teal' : 'text-ink-3')}>{done ? <CheckCircle2 size={22} /> : <Circle size={22} />}</span>
      <div className="min-w-0 flex-1">
        <p className="t-headline text-ink">
          {n}. {title}
        </p>
        <div className="t-footnote mt-1 text-ink-2">{children}</div>
      </div>
    </li>
  );

  return (
    <div className="max-w-3xl">
      <SectionHeader eyebrow="Welcome" title="Set up Mochi’s local AI" subtitle="Mochi talks using a small language model that runs entirely on this computer through Ollama. No account, no API key, and your conversations never leave your machine." />

      <Card>
        <ol>
          <Step n={1} done={ollamaOk} title="Install and start Ollama">
            {ollamaOk ? (
              <p>Ollama {st?.ollamaVersion} is running.</p>
            ) : (
              <>
                <p>Ollama is free and runs on macOS (Apple Silicon or Intel) and Windows. Install it, open it once, then come back here.</p>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => void window.orbital.invoke('app:openOllamaDownload')} className="t-caption flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 font-medium text-bg">
                    <ExternalLink size={12} /> Download Ollama (ollama.com)
                  </button>
                  <button onClick={() => void check()} className="t-caption flex items-center gap-1 rounded-full border border-line px-3 py-1.5 font-medium text-ink">
                    <RefreshCw size={12} className={checking ? 'animate-spin' : ''} /> Check again
                  </button>
                </div>
              </>
            )}
          </Step>

          <Step n={2} done={modelOk} title={`Download the conversation model (${model})`}>
            {modelOk ? (
              <p>Ready: {st?.activeModel}.</p>
            ) : (
              <>
                <p>
                  {model === DEFAULT_AI.ollama.model
                    ? 'About 2.5 GB to download; it uses about 3.2 GB of memory while Mochi is chatting (measured on an Apple M1 with 16 GB RAM). 8 GB of RAM or more and about 4 GB of free disk space are recommended.'
                    : 'You chose a different model in Settings. Its download size and memory use depend on the model; check its page on ollama.com before downloading.'}
                </p>
                <label className="mt-2 flex items-center gap-2">
                  <input id="setup-confirm" type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} disabled={!ollamaOk || downloading} />
                  <span>{model === DEFAULT_AI.ollama.model ? 'Yes, download about 2.5 GB now.' : `Yes, download ${model} now.`}</span>
                </label>
                <button
                  disabled={!ollamaOk || !confirm || downloading}
                  onClick={async () => {
                    setPullError(null);
                    setPull({ status: 'starting' });
                    const r = await window.orbital.invoke('ai:pull', { model });
                    if (!r.ok) setPullError(r.error ?? 'Download failed.');
                  }}
                  className="t-caption mt-2 flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 font-medium text-bg disabled:opacity-40"
                >
                  {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} {downloading ? 'Downloading…' : 'Download model'}
                </button>
                {pull && (
                  <div className="mt-2" aria-live="polite">
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                      <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${pct ?? (pull.status === 'success' ? 100 : 5)}%` }} />
                    </div>
                    <p className="t-caption mt-1 text-ink-3">
                      {pull.status}
                      {pct !== null && ` · ${pct}%`}
                    </p>
                  </div>
                )}
                {pullError && <p className="t-caption mt-1 text-attention">{pullError}</p>}
                <p className="t-caption mt-2 text-ink-3">
                  Prefer a terminal? <code className="font-mono">ollama pull {model}</code>
                </p>
              </>
            )}
          </Step>

          <Step n={3} done={!!verify?.ok} title="Say hello">
            <button
              disabled={!modelOk || verifying}
              onClick={async () => {
                setVerifying(true);
                setVerify(await window.orbital.invoke('ai:verify'));
                setVerifying(false);
              }}
              className="t-caption flex items-center gap-1 rounded-full border border-line px-3 py-1.5 font-medium text-ink disabled:opacity-40"
            >
              {verifying ? <Loader2 size={12} className="animate-spin" /> : <MessageCircle size={12} />} Test a reply
            </button>
            {verify?.ok && (
              <p className="mt-2">
                “{verify.reply}” <span className="t-caption text-ink-3">· {verify.model} · {verify.ms} ms</span>
              </p>
            )}
            {verify && !verify.ok && <p className="t-caption mt-1 text-attention">{verify.error}</p>}
          </Step>

          <Step n={4} done={prefs.onboarding.completed} title="Meet Mochi">
            <p>Mochi lives on your desktop. Click it to chat, right-click for its menu, and ask “open Dr G Zero” any time.</p>
            <div className="mt-2 flex gap-2">
              <button onClick={() => void window.orbital.invoke('companion:openChat')} className="t-caption rounded-full bg-accent px-3 py-1.5 font-medium text-bg">
                Say hi to Mochi
              </button>
              {!prefs.onboarding.completed && (
                <button onClick={() => void setPrefs({ onboarding: { completed: true } })} className="t-caption rounded-full px-3 py-1.5 font-medium text-ink-3">
                  Skip for now — use simple mode
                </button>
              )}
            </div>
          </Step>
        </ol>
      </Card>
      <p className="t-caption mt-3 text-ink-3">Until the model is ready Mochi uses simple built-in replies and shows a “Simple mode” badge. Nothing is downloaded without your confirmation.</p>
    </div>
  );
}
