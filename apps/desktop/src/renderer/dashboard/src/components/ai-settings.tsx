import { useEffect, useState } from 'react';
import { Cpu, RefreshCw } from 'lucide-react';
import { DEFAULT_AI, OllamaModelName, type AiProvider, type AiStatus } from '@orbital/contracts';
import { useApp } from '../stores/app';
import { Card, CardHeader, Pill, SegmentedControl, SettingRow } from './ui';

/**
 * Conversational AI settings (Mochi M1). Local-first: Ollama on this computer is the default and needs no
 * API key or internet. Anthropic is optional and off by default. Neither provider ever receives journal
 * entries or health data — the conversation context is built from an allow-list (tested).
 */
const STATE_LABEL: Record<AiStatus['state'], { text: string; tone: 'teal' | 'watch' | 'attention' | 'neutral' }> = {
  ready: { text: 'Ready', tone: 'teal' },
  checking: { text: 'Checking…', tone: 'neutral' },
  off: { text: 'Off — simple mode', tone: 'neutral' },
  unreachable: { text: 'Ollama not running — simple mode', tone: 'watch' },
  'model-missing': { text: 'Model not installed — simple mode', tone: 'watch' },
  'no-credentials': { text: 'No API key — simple mode', tone: 'watch' },
  error: { text: 'Error — simple mode', tone: 'attention' },
};

export function AiSettingsCard() {
  const { prefs, setPrefs } = useApp();
  const [st, setSt] = useState<AiStatus | null>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    void window.orbital.invoke('ai:status').then(setSt);
    return window.orbital.on('ai:status', setSt);
  }, []);
  if (!prefs) return null;
  const ai = prefs.ai;
  const label = st ? STATE_LABEL[st.state] : STATE_LABEL.checking;
  return (
    <Card className="mt-5" data-testid="ai-settings">
      <CardHeader eyebrow="Mochi’s conversation" title="Conversational AI" action={<Pill tone={label.tone}>{label.text}</Pill>} />
      <div className="mt-2">
        <SettingRow title="Provider" description="Local Ollama runs entirely on this computer — no API key, no internet. Anthropic is optional, needs a key and internet, and still never receives your journal or health data.">
          <SegmentedControl<AiProvider>
            size="sm"
            label="AI provider"
            value={ai.provider}
            onChange={(provider) => void setPrefs({ ai: { provider } })}
            options={[
              { value: 'ollama', label: 'Ollama (local)', title: 'Ollama (local)' },
              { value: 'anthropic', label: 'Anthropic', title: 'Anthropic (optional)' },
              { value: 'off', label: 'Off', title: 'Off' },
            ]}
          />
        </SettingRow>
        {ai.provider === 'ollama' && (
          <>
            <SettingRow title="Models" description={`Preferred: ${ai.ollama.model} (non-thinking). Fallback: ${ai.ollama.fallbackModel} (reasoning is hidden; much slower).`}>
              <span className="t-caption text-right text-ink-2">
                In use: <b className="text-ink">{st?.activeModel ?? '—'}</b>
                <br />
                Ollama {st?.ollamaVersion ?? 'not detected'}
              </span>
            </SettingRow>
            <ModelPicker current={ai.ollama.model} installed={st?.installedModels ?? []} onSave={(model) => void setPrefs({ ai: { ollama: { model } } })} />
            <SettingRow title="Temperature" description="Lower is steadier, higher is more playful.">
              <span className="flex items-center gap-2">
                <input
                  id="ai-temperature"
                  type="range"
                  min={0}
                  max={1.2}
                  step={0.1}
                  value={ai.ollama.temperature}
                  onChange={(e) => void setPrefs({ ai: { ollama: { temperature: Number(e.target.value) } } })}
                  aria-label="Temperature"
                />
                <span className="t-caption tabular w-8 text-ink-2">{ai.ollama.temperature.toFixed(1)}</span>
              </span>
            </SettingRow>
          </>
        )}
        <SettingRow title="Status" description={st?.detail ?? (st?.lastTurn ? `Last reply: first words after ${st.lastTurn.firstTokenMs} ms, complete in ${st.lastTurn.totalMs} ms (${st.lastTurn.model}).` : 'No conversation yet.')}>
          <button
            onClick={async () => {
              setChecking(true);
              setSt(await window.orbital.invoke('ai:check'));
              setChecking(false);
            }}
            className="t-caption flex items-center gap-1 rounded-full border border-line px-2.5 py-1 font-medium text-ink hover:bg-surface-2"
          >
            <RefreshCw size={12} className={checking ? 'animate-spin' : ''} /> Check again
          </button>
        </SettingRow>
        {st && st.state !== 'ready' && ai.provider === 'ollama' && (
          <div className="mx-6 mb-4 rounded-[12px] border border-line bg-surface-2/60 p-3">
            <p className="t-caption flex items-center gap-1.5 font-semibold text-ink-2">
              <Cpu size={12} /> Set up the local model
            </p>
            <ol className="t-caption mt-1 list-decimal space-y-0.5 pl-5 text-ink-3">
              <li>Install Ollama from ollama.com (macOS or Windows) and start it.</li>
              <li>
                In a terminal run: <code className="font-mono text-ink-2">ollama pull {ai.ollama.model}</code> (about 2.5 GB).
              </li>
              <li>Mochi reconnects automatically within 30 seconds, or press “Check again”.</li>
            </ol>
          </div>
        )}
      </div>
    </Card>
  );
}

/** Choose a different compatible local model (any Ollama model name; installed ones are offered first). */
function ModelPicker({ current, installed, onSave }: { current: string; installed: string[]; onSave: (model: string) => void }) {
  const [value, setValue] = useState(current);
  useEffect(() => setValue(current), [current]);
  const valid = OllamaModelName.safeParse(value.trim()).success;
  const dirty = value.trim() !== current;
  return (
    <SettingRow
      title="Conversation model"
      description="Use another local model if you prefer. Small instruct models (3–8B) work best. Mochi still screens every reply, and the model never sees journals or health data. Download it with the setup guide or `ollama pull <name>`."
    >
      <span className="flex flex-col items-end gap-1.5">
        <span className="flex items-center gap-1.5">
          <input
            id="ai-model"
            list="ai-installed-models"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="Conversation model"
            aria-invalid={!valid}
            spellCheck={false}
            className="t-caption w-60 rounded-[8px] border border-line bg-surface px-2 py-1 font-mono text-ink"
          />
          <datalist id="ai-installed-models">
            {installed.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <button
            disabled={!valid || !dirty}
            onClick={() => onSave(value.trim())}
            className="t-caption rounded-full border border-line px-2.5 py-1 font-medium text-ink hover:bg-surface-2 disabled:opacity-40"
          >
            Use
          </button>
        </span>
        {current !== DEFAULT_AI.ollama.model && (
          <button onClick={() => onSave(DEFAULT_AI.ollama.model)} className="t-caption text-ink-3 underline">
            Reset to {DEFAULT_AI.ollama.model}
          </button>
        )}
        {!valid && <span className="t-caption text-attention">Not a valid Ollama model name.</span>}
      </span>
    </SettingRow>
  );
}
