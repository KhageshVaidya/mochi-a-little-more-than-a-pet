#!/usr/bin/env node
/**
 * Mochi / Dr G Zero launch smoke test.
 * Runs the BUILT app (out/) once per theme with ORBITAL_SMOKE_OUT set, then asserts on report.json.
 * Usage: npm run smoke   (from repo root or apps/desktop)
 */
import { spawn } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const electronBin = createRequire(import.meta.url)('electron');
const outRoot = process.env.ORBITAL_SMOKE_DIR ?? join(appDir, '.smoke');

function run(theme) {
  const outDir = join(outRoot, theme);
  rmSync(outDir, { recursive: true, force: true });
  return new Promise((resolveRun) => {
    const child = spawn(electronBin, ['.'], {
      cwd: appDir,
      env: { ...process.env, ORBITAL_SMOKE_OUT: outDir, ORBITAL_SMOKE_THEME: theme, ELECTRON_RENDERER_URL: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d));
    child.on('exit', (code) => resolveRun({ theme, outDir, code, stderr }));
  });
}

const checks = (r) => {
  const d = r.dashboardProbe ?? {};
  const c = r.companionProbe ?? {};
  const wp = r.webPreferences ?? {};
  return [
    ['no renderer crashes / preload errors', r.ok === true && (r.crashes ?? []).length === 0],
    ['dashboard rendered', d.rootChildren > 0],
    ['companion rendered', c.rootChildren > 0],
    ['dashboard: contextIsolation + sandbox, no nodeIntegration', wp.dashboard?.contextIsolation && wp.dashboard?.sandbox && !wp.dashboard?.nodeIntegration],
    ['companion: contextIsolation + sandbox, no nodeIntegration', wp.companion?.contextIsolation && wp.companion?.sandbox && !wp.companion?.nodeIntegration],
    ['no Node globals in dashboard (require/process/module)', d.requireType === 'undefined' && d.processType === 'undefined' && d.moduleType === 'undefined'],
    ['no Node globals in companion', c.requireType === 'undefined'],
    ['companion cannot see dashboard bridge', c.dashboardBridgeLeak === 'undefined'],
    ['companion blocked from mission:command', c.missionCommandFromCompanion === 'blocked'],
    ['companion blocked from system:info', c.systemInfoFromCompanion === 'blocked'],
    ['dashboard blocked from companion:move', d.companionMoveFromDashboard === 'blocked'],
    ['central mission state round-trip (seek → get)', d.missionSeekRoundTrip === true],
    ['SQLite (node:sqlite) healthy inside Electron', r.storage?.ok === true && r.storage?.engine === 'node:sqlite'],
    ['companion window transparent', /rgba\(0, 0, 0, 0\)|transparent/.test(c.htmlBackground ?? '')],
    ['theme applied', r.theme === 'system' || d.colorScheme === r.theme],
    ['no console errors', !(r.issues ?? []).some((i) => i.level === 'error' || i.level === '3')],
    ['five crew members selectable', (r.crewProbe ?? []).length === 5 && r.crewProbe.every((c) => c.selected)],
    ['crew have distinct baselines (resting HR differs)', new Set((r.crewProbe ?? []).map((c) => c.rhr90)).size === 5],
    ['mission day changes values', (r.crewProbe ?? []).some((c) => c.rhr90 !== c.rhr150)],
    ['Brain Health states match scenarios at day 150', JSON.stringify((r.crewProbe ?? []).map((c) => c.state150)) === JSON.stringify(['NO', 'YES', 'NO', 'YES', 'INSUFFICIENT_DATA'])],
    ['every assessment carries reasons', (r.crewProbe ?? []).every((c) => c.reasons > 0)],
    ['incomplete-telemetry profile has lowest completeness', (r.crewProbe ?? []).length === 5 && r.crewProbe[4].completeness < Math.min(...r.crewProbe.slice(0, 4).map((c) => c.completeness))],
    ['synthetic data persisted in SQLite', r.recordCount > 15000],
    ['Mochi rig loaded via orbital-asset (contain fit, 421×449, 2 blink lids, tail swish)', r.mochiProbe?.art?.w === 421 && r.mochiProbe?.art?.h === 449 && r.mochiProbe?.art?.fit === 'contain' && /^orbital-asset:/.test(r.mochiProbe?.art?.src ?? '') && r.mochiProbe?.art?.eyelids === 2 && r.mochiProbe?.art?.tail],
    ['gamification: XP for all five crew, games, missions, exploration', Object.values(r.mochiProbe?.gameProbe?.xp ?? {}).length === 5 && Object.values(r.mochiProbe.gameProbe.xp).every((x) => x > 0) && r.mochiProbe.gameProbe.dailyMissions === 3 && r.mochiProbe.gameProbe.destinations === 9],
    ['companion reacts to a game achievement', (r.mochiProbe?.companionAfterGame ?? '').length > 0],
    ['chat works in simple mode when no model is available (AI off in smoke)', r.mochiProbe?.phase2?.llmState === 'off' && r.mochiProbe.phase2.aiSimpleMode === true && r.mochiProbe.phase2.openVoice === 'template' && r.mochiProbe.phase2.endVoice === 'template'],
    ['M1: Dr G Zero is not shown at launch (Mochi first)', r.mochiProbe?.dashboardHiddenAtLaunch === true],
    ['M1: clicking Mochi opens the conversation and a second click keeps it open', r.mochiProbe?.clickOpensChat === true && r.mochiProbe.secondClickKeepsChat === true],
    ['M1: visible simple-mode badge when the model is unavailable', r.mochiProbe?.simpleModeBadge === true],
    ['M1: "show me my health" opens Dr G Zero at Physical', r.m1Probe?.commandAction?.section === 'physical' && /physical/.test(r.m1Probe.navigatedTo ?? '')],
    ['M1: dashboard mission link opens Mochi’s chat; journal entry can be written', r.m1Probe?.openChatFromDashboard === true && r.m1Probe.journalCreated === true],
    ['M1: user-facing branding is Mochi / Dr G Zero (no ORBITAL text in any section)', r.m1Probe?.dashboardTitle === 'Dr G Zero' && r.m1Probe.companionTitle === 'Mochi' && (r.orbitalTextSeen ?? ['x']).length === 0],
    ['journal saved with labelled generated summary', r.mochiProbe?.phase2?.journalCount >= 1 && r.mochiProbe.phase2.journalSummaryKind === 'model-summary'],
    ['urgent request → fixed safety reply → urgent alert → audited', r.mochiProbe?.phase2?.urgent === true && r.mochiProbe.phase2.urgentVoice === 'safety' && r.mochiProbe.phase2.firstAlertTier === 'urgent' && r.mochiProbe.phase2.audited],
    ['crew board renders voluntary statuses', (r.mochiProbe?.phase2?.boardStatuses ?? 0) >= 1],
    ['SCND deterministic; wellbeing pattern summary present', r.mochiProbe?.phase2?.deterministic === true && r.mochiProbe.phase2.sofiaState === 'YES' && /^Several changes/.test(r.mochiProbe.phase2.patternSummary ?? '')],
    ['NASA HRP registry loads offline and validates (17 risks)', r.knowledgeProbe?.status === 'ok' && r.knowledgeProbe.risks === 17],
    ['only registry NASA sources can be opened', r.knowledgeProbe?.allowedOpened === true && r.knowledgeProbe.blockedOpened === false],
    ['alerts explain related NASA risks with nasa.gov sources; urgent alerts never', (r.knowledgeProbe?.alertsWithContext ?? 0) >= 1 && r.knowledgeProbe.urgentWithContext === 0 && r.knowledgeProbe.contextUrlsNasa],
    ['Knowledge section lists 17 risks and deep-links to a risk', r.knowledgeProbe?.riskButtons === 17 && r.knowledgeProbe.detail === 'sleep-schedules' && r.knowledgeProbe.sourceLinks >= 3],
    ['Phase 4: report decision equals the deterministic assessment for all five crew; approved outputs carry no ML', Object.values(r.phase4Probe?.crew ?? {}).length === 5 && Object.values(r.phase4Probe.crew).every((c) => c.sameAsAssess && !c.approvedHasMl)],
    ['Phase 4: scenarios drive the expected recommendations (sleep → recovery, deconditioning → movement, wellbeing → journal, healthy → none)', (() => { const c = r.phase4Probe?.crew ?? {}; return c['CM-01']?.recs.length === 0 && c['CM-02']?.recs.includes('sleep-recovery-expedition') && c['CM-03']?.recs.includes('movement-short') && c['CM-04']?.recs.includes('journal'); })()],
    ['Phase 4: adaptive mission replaces a slot (always 3 daily missions)', Object.values(r.phase4Probe?.crew ?? {}).every((c) => c.missions === 3) && (r.phase4Probe?.crew?.['CM-02']?.adaptive.length ?? 0) === 1],
    ['Phase 4: gamification works with the companion hidden; hard-difficulty game history recorded', r.phase4Probe?.hiddenXpDelta > 0 && r.phase4Probe.hardGame && r.phase4Probe.playedOk],
    ['Phase 4: habitat has 7 rooms incl. pet living space; 9-stop solar-system route', (r.phase4Probe?.rooms ?? []).includes('Pet living space') && r.phase4Probe.rooms.length === 7 && r.phase4Probe.destinations === 9],
    ['all four companions render with their own motion profile', ['dog', 'cat', 'alien', 'mochi'].every((id) => { const p = r.mochiProbe?.speciesProbe?.[id]; return p?.rendered === id && p?.profile === `mp-${id}` && p?.loaded; })],
    ['right-click opens menu with the seven awake actions', JSON.stringify(r.mochiProbe?.menuItems) === JSON.stringify(['chat', 'hello', 'status', 'celebrate', 'sleep', 'open-dashboard', 'hide'])],
    ['companion status panel', r.mochiProbe?.statusOk === true],
    ['sleep shows Z overlay; click wakes', r.mochiProbe?.sleeping?.asleep === 'true' && r.mochiProbe?.sleeping?.zzz && r.mochiProbe?.wokeOnClick],
    ['rest event celebrated (sparkles + positive message)', r.mochiProbe?.celebrating?.state === 'celebrate' && r.mochiProbe?.celebrating?.sparkles && /rest/i.test(r.mochiProbe?.celebrating?.bubble ?? '')],
    ['drag moves window and position is persisted', r.mochiProbe?.moved?.dx === -40 && r.mochiProbe?.moved?.dy === -25 && r.mochiProbe?.positionPersisted],
    ['interactions can be disabled (no menu)', r.mochiProbe?.menuWhenDisabled === false],
  ];
};

// `--report <dir>`: evaluate reports produced elsewhere (e.g. by the packaged app run from its installer),
// where <dir> contains light/report.json and dark/report.json.
const reportDir = process.argv.includes('--report') ? process.argv[process.argv.indexOf('--report') + 1] : null;
let failed = false;
for (const theme of ['light', 'dark']) {
  const res = reportDir ? { theme, outDir: join(reportDir, theme), code: 0, stderr: '' } : await run(theme);
  let report;
  try {
    report = JSON.parse(readFileSync(join(res.outDir, 'report.json'), 'utf8'));
  } catch {
    console.error(`✗ [${theme}] no report (exit ${res.code})\n${res.stderr}`);
    failed = true;
    continue;
  }
  if (report.error) {
    console.error(`✗ [${theme}] ${report.error}`);
    failed = true;
  }
  console.log(`\n── ${theme} ── exit ${res.code} · electron ${report.dashboardProbe?.info?.electron} · sqlite ${report.storage?.sqliteVersion} · ${report.recordCount} records (${Object.values(report.dataLoad ?? {})[0]})`);
  for (const [label, pass] of checks(report)) {
    console.log(`  ${pass ? '✓' : '✗'} ${label}`);
    if (!pass) failed = true;
  }
  for (const i of report.issues ?? []) console.log(`  · console ${i.level} [${i.window}] ${i.message.slice(0, 200)}`);
  console.log(`  screenshots: ${(report.shots ?? []).map((s) => join(res.outDir, s)).join('\n               ')}`);
}
process.exit(failed ? 1 : 0);
