import type { JournalEntry } from '@orbital/contracts';

/** Markdown export of the user's own journal. Generated content stays labelled as generated. */
export function journalToMarkdown(entries: readonly JournalEntry[], title = 'My ORBITAL journal'): string {
  const out = [`# ${title}`, '', '_Private export. Generated summaries and possibilities are labelled; possibilities were never treated as facts._', ''];
  for (const e of [...entries].sort((a, b) => a.missionDay - b.missionDay || a.createdAt.localeCompare(b.createdAt))) {
    out.push(`## Mission day ${e.missionDay}`, '');
    if (e.feelings.length) out.push(`**Feelings I reported:** ${e.feelings.join(', ')}`, '');
    for (const t of e.turns) out.push(`**${t.question}**`, t.answer ? t.answer : '_(skipped)_', '');
    if (e.summary) out.push(`> Generated summary: ${e.summary.text}`, '');
    for (const p of e.possibilities) out.push(`> Generated possibility (${p.status}): ${p.text}`, '');
  }
  return out.join('\n');
}
