// Mochi — NASA Space Apps 2026 deck (exactly 7 slides). Regenerate with `npm run build`.
//
//   Slide 7 links and QR code point at the public repository and its GitHub Pages site (override with SITE_URL / REPO_URL;
//   set SITE_URL= to an empty string to show a labelled QR placeholder instead).
//
// Every screenshot comes from the running app (screenshots/). Diagrams are native, editable PowerPoint shapes.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const pptxgen = require('pptxgenjs');
const JSZip = require('jszip');
const QRCode = require('qrcode');

const here = dirname(fileURLToPath(import.meta.url));
const shot = (f) => join(here, 'screenshots', f);
const OUT = join(here, 'mochi-space-apps.pptx');
const SITE_URL = process.env.SITE_URL ?? 'https://khageshvaidya.github.io/mochi-a-little-more-than-a-pet/';
const REPO_URL = process.env.REPO_URL ?? 'https://github.com/KhageshVaidya/mochi-a-little-more-than-a-pet';
// Fable example uses two of the original fictional crew members.
const [A, B] = ['Alex', 'Maya'];

const THEME = {
  name: 'Mochi',
  headFontFace: 'Trebuchet MS',
  bodyFontFace: 'Arial',
  colors: {
    dk1: '1F1D36', lt1: 'FFFFFF', dk2: '1C1B3A', lt2: 'F7F3F6',
    accent1: 'B4708A', accent2: '4466D4', accent3: '3E9C7A', accent4: 'D99A2B', accent5: 'C2553F', accent6: '8A86A8',
    hlink: 'F2DCE4', folHlink: 'E9C9D5',
  },
};
const HEX = { night: '1C1B3A', ink: '1F1D36', paper: 'F7F3F6', rose: 'B4708A', roseLight: 'F2DCE4', roseSoft: 'E9C9D5',
  sky: '4466D4', skyLight: 'DDE4F8', mint: '3E9C7A', mintLight: 'DCEFE7', amber: 'D99A2B', amberLight: 'F7E8CC',
  coral: 'C2553F', coralLight: 'F6DDD7', muted: '6E6A86', line: 'DCD5DF', night2: '2A2852', white: 'FFFFFF' };

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE'; // 13.333 × 7.5 in
pres.author = 'Mochi project contributors';
pres.title = 'Mochi — A Little More Than a Pet';
pres.subject = 'NASA Space Apps 2026 — Create Health Monitoring Software for Astronauts on Space Missions';
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;
const S = pres.ShapeType;
const W = 13.333;

const shadow = () => ({ type: 'outer', color: '1C1B3A', opacity: 0.16, blur: 10, offset: 3, angle: 90 });
const FOOT = 'Mochi · NASA Space Apps 2026 · synthetic data · demonstration, not a medical device';

// ---------- Layouts ----------
pres.defineSlideMaster({
  title: 'Mochi Dark',
  background: { color: HEX.night },
  objects: [
    { text: { text: 'Demonstration · synthetic data · not a medical device · not affiliated with or endorsed by NASA',
      options: { x: 0.8, y: 6.95, w: 11.7, h: 0.3, fontSize: 10, color: '9C98BC', margin: 0 } } },
  ],
});
pres.defineSlideMaster({
  title: 'Mochi Content',
  background: { color: HEX.paper },
  margin: [0.4, 0.6, 0.55, 0.6],
  objects: [
    { placeholder: { options: { name: 'kicker', type: 'body', x: 0.6, y: 0.35, w: 9, h: 0.3, fontSize: 12, bold: true,
      color: C.accent1, charSpacing: 3, margin: 0, valign: 'middle', align: 'left' }, text: 'Kicker' } },
    { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 0.68, w: 12.1, h: 0.75, fontSize: 32, bold: true,
      color: C.text1, fontFace: THEME.headFontFace, margin: 0, valign: 'middle', align: 'left' }, text: 'Title' } },
    { text: { text: FOOT, options: { x: 0.6, y: 7.02, w: 10, h: 0.28, fontSize: 9, color: HEX.muted, margin: 0 } } },
  ],
  slideNumber: { x: 12.2, y: 7.02, w: 0.5, h: 0.28, fontSize: 9, color: HEX.muted, align: 'right' },
});

// ---------- Helpers ----------
function framed(slide, path, x, y, w, h, name) {
  const p = 0.07;
  slide.addShape(S.roundRect, { x: x - p, y: y - p, w: w + 2 * p, h: h + 2 * p, rectRadius: 0.12,
    fill: { color: C.background1 }, line: { color: HEX.line, width: 0.75 }, shadow: shadow(), objectName: `${name} frame` });
  slide.addImage({ path, x, y, w, h, altText: name, objectName: name });
}
function caption(slide, text, x, y, w, align = 'left') {
  slide.addText(text, { x, y, w, h: 0.3, fontSize: 10, italic: true, color: HEX.muted, margin: 0, align, isTextBox: true });
}
function pill(slide, text, x, y, w, fill, color, opts = {}) {
  slide.addText(text, { shape: S.roundRect, rectRadius: 0.2, x, y, w, h: opts.h ?? 0.42, fill: { color: fill },
    line: opts.line ?? { color: fill, width: 0.5 }, color, fontSize: opts.fontSize ?? 12, bold: opts.bold ?? true,
    align: 'center', valign: 'middle', margin: 0, objectName: opts.name ?? `Pill ${text}` });
}
function arrow(slide, x, y, w, h, color = HEX.muted, both = false) {
  slide.addShape(S.line, { x, y, w, h, line: { color, width: 1.75, endArrowType: 'triangle', ...(both ? { beginArrowType: 'triangle' } : {}) } });
}
function box(slide, title, sub, x, y, w, h, fill, color = C.text1, opts = {}) {
  const runs = [{ text: title, options: { bold: true, fontSize: opts.titleSize ?? 13, color, breakLine: !!sub } }];
  if (sub) runs.push({ text: sub, options: { fontSize: opts.subSize ?? 10.5, color: opts.subColor ?? color } });
  slide.addText(runs, { shape: S.roundRect, rectRadius: 0.1, x, y, w, h, fill: { color: fill },
    line: opts.line ?? { color: fill, width: 0.5 }, align: 'center', valign: 'middle', margin: 4, objectName: opts.name ?? title });
}
function numberedRow(slide, n, title, body, x, y, w, color = C.accent1) {
  slide.addText(String(n), { shape: S.ellipse, x, y: y + 0.02, w: 0.42, h: 0.42, fill: { color }, color: C.background1,
    fontSize: 13, bold: true, align: 'center', valign: 'middle', margin: 0, objectName: `Marker ${n}` });
  slide.addText([
    { text: title, options: { bold: true, fontSize: 15, color: C.text1, breakLine: true } },
    { text: body, options: { fontSize: 12.5, color: HEX.muted } },
  ], { x: x + 0.6, y, w: w - 0.6, h: 0.85, valign: 'top', margin: 0, isTextBox: true, paraSpaceAfter: 2 });
}

// ======================= 1. Vision =======================
pres.addSection({ title: 'Vision' });
{
  const s = pres.addSlide({ masterName: 'Mochi Dark', sectionTitle: 'Vision' });
  s.addText('NASA SPACE APPS 2026  ·  ASTRONAUT HEALTH MONITORING', { x: 0.8, y: 1.5, w: 8.2, h: 0.35,
    fontSize: 12, bold: true, color: HEX.roseSoft, charSpacing: 2, margin: 0, isTextBox: true });
  s.addText('MOCHI', { x: 0.8, y: 1.9, w: 7.6, h: 1.65, fontSize: 104, bold: true, color: C.background1,
    fontFace: THEME.headFontFace, margin: 0, isTextBox: true, charSpacing: 4 });
  s.addText('A LITTLE MORE THAN A PET', { x: 0.8, y: 3.55, w: 7.6, h: 0.55, fontSize: 28, bold: true, color: HEX.roseSoft,
    fontFace: THEME.headFontFace, charSpacing: 4, margin: 0, isTextBox: true });
  s.addText('Making astronaut wellbeing more human.', { x: 0.8, y: 4.35, w: 7.6, h: 0.55, fontSize: 24, color: C.background1,
    italic: true, margin: 0, isTextBox: true });
  const tags = [['Mochi', 'companion'], ['Dr G Zero', 'insight'], ['Fable', 'connection']];
  tags.forEach(([a, b], i) => s.addText([{ text: a, options: { bold: true } }, { text: `  ·  ${b}` }], {
    shape: S.roundRect, rectRadius: 0.22, x: 0.8 + i * 2.45, y: 5.4, w: 2.25, h: 0.48, fill: { color: HEX.night2 },
    line: { color: '4A4778', width: 0.75 }, color: C.background1, fontSize: 13, align: 'center', valign: 'middle', margin: 0,
    objectName: `Tag ${a}` }));
  s.addShape(S.ellipse, { x: 8.35, y: 1.4, w: 4.5, h: 4.5, fill: { color: HEX.night2 }, line: { color: HEX.night2 }, objectName: 'Halo' });
  const mw = 3.7, mh = mw * 433 / 405;
  s.addImage({ path: shot('mochi-art.png'), x: 8.75, y: 1.6, w: mw, h: mh, altText: 'Mochi, the companion (team artwork)', objectName: 'Mochi artwork' });
  s.addNotes(`Mochi is a desktop companion for astronauts on long missions. It makes wellbeing support feel human: a little friend on the desktop (Mochi), an explainable wellbeing intelligence (Dr G Zero), and companions that help the crew get together (Fable). Everything you'll see runs on a laptop, uses synthetic data for five fictional crew members, and is a demonstration, not a medical device.`);
}

// ======================= 2. Meet Mochi =======================
pres.addSection({ title: 'Meet Mochi' });
{
  const s = pres.addSlide({ masterName: 'Mochi Content', sectionTitle: 'Meet Mochi' });
  s.addText('MEET MOCHI', { placeholder: 'kicker' });
  s.addText('A little companion that lives on your desktop', { placeholder: 'title' });
  const rows = [
    ['Always nearby', 'Floats above your other windows. Click Mochi to chat.'],
    ['Talks like a friend', 'Short, warm replies, one question at a time. No lectures.'],
    ['Private by design', 'Runs a local model (Qwen3 4B via Ollama). Journals never reach it.'],
    ['Knows its limits', 'Never diagnoses. "I\'d like to talk to someone" is one tap away.'],
  ];
  rows.forEach(([t, b], i) => numberedRow(s, i + 1, t, b, 0.6, 1.75 + i * 0.95, 4.9));
  s.addText([
    { text: '287 ms', options: { fontSize: 36, bold: true, color: C.accent1, fontFace: THEME.headFontFace, breakLine: true } },
    { text: 'median time to Mochi\'s first words, local model on an Apple M1 (16-turn benchmark)', options: { fontSize: 11, color: HEX.muted } },
  ], { x: 0.6, y: 5.65, w: 4.9, h: 1.1, margin: 0, valign: 'top', isTextBox: true });
  framed(s, shot('drg-overview-light.png'), 5.75, 1.8, 6.3, 6.3 * 1560 / 2760, 'Screenshot: Dr G Zero overview');
  const cw = 2.45, ch = cw * 805 / 560;
  s.addImage({ path: shot('mochi-chat-light.png'), x: 10.35, y: 2.95, w: cw, h: ch, altText: 'Screenshot: chatting with Mochi (real local-model replies)', objectName: 'Screenshot: Mochi chat' });
  caption(s, 'Real captures, composited: Dr G Zero behind, Mochi\'s chat window in front. Replies are from the local model.', 5.75, 6.62, 7.0);
  s.addNotes(`Mochi is the part astronauts meet first. It sits on top of the desktop; one click opens a chat. Replies come from Qwen3 4B running locally through Ollama: no internet, no account. In our benchmark the first words arrive in about a third of a second. Journal entries and health values are never put into the model's prompt, and every reply passes an output guard. If Ollama isn't installed, Mochi keeps working in a clearly labelled simple mode.`);
}

// ======================= 3. Dr G Zero =======================
pres.addSection({ title: 'Dr G Zero' });
{
  const s = pres.addSlide({ masterName: 'Mochi Content', sectionTitle: 'Dr G Zero' });
  s.addText('DR G ZERO  ·  THE SCND ENGINE', { placeholder: 'kicker' });
  s.addText('Sustained Change, Not Diagnosis', { placeholder: 'title' });
  const steps = ['Data collection', 'Personal baselines', 'Data quality', 'Statistical detection', 'SCND decision', 'Recommendation', 'Mochi'];
  const sw = 1.83, gap = -0.12, sx = 0.6;
  steps.forEach((t, i) => {
    const decision = i === 4, after = i > 4;
    s.addText(t, { shape: i === 0 ? S.homePlate : S.chevron, x: sx + i * (sw + gap), y: 1.6, w: sw, h: 0.72,
      fill: { color: decision ? C.accent1 : after ? HEX.skyLight : HEX.roseLight }, line: { color: HEX.paper, width: 1 },
      color: decision ? C.background1 : C.text1, fontSize: i === 5 ? 9.5 : 10.5, bold: true, align: 'center', valign: 'middle',
      margin: [0, 2, 0, 10], objectName: `Flow ${i + 1} ${t}` });
  });
  const L = { bold: true, color: HEX.rose, fontSize: 12 };
  const V = { color: HEX.ink, fontSize: 12 };
  const rows = [
    ['Baseline', 'Own days 10–37 · robust spread = max(SD, 1.4826·MAD)'],
    ['Window', 'Latest 14 days, 7 wellbeing domains'],
    ['Detectors', 'All three must agree: persistence ≥5 of 7 days at z ≥ 1.5 · EWMA λ 0.2, L 2.7 · CUSUM k 0.5, h 5'],
    ['YES when', '≥2 core domains change (R-BRAIN-01), or one strong domain on ≥10 of 14 days at z ≥ 2 (R-BRAIN-02); confirmed over 3 days'],
    ['Data first', 'Coverage ≥ 0.7 and ≥5 reliable domains, otherwise INSUFFICIENT DATA'],
  ].map(([a, b]) => [{ text: a, options: L }, { text: b, options: V }]);
  s.addTable(rows, { x: 0.6, y: 2.65, w: 6.0, colW: [1.25, 4.75], rowH: [0.5, 0.42, 0.7, 0.85, 0.6], valign: 'middle',
    fill: { color: HEX.white }, border: { type: 'solid', pt: 0.75, color: HEX.line }, margin: [3, 8, 3, 8], objectName: 'SCND parameters' });
  const outs = [['YES', HEX.coralLight, HEX.coral, 'sustained change'], ['NO', HEX.mintLight, HEX.mint, 'no sustained change'],
    ['INSUFFICIENT DATA', HEX.amberLight, '9A6A12', 'not enough reliable data']];
  let ox = 0.6;
  outs.forEach(([t, f, c, d], i) => {
    const w = i === 2 ? 2.3 : 1.65;
    pill(s, t, ox, 5.95, w, f, c, { fontSize: 13, h: 0.44 });
    s.addText(d, { x: ox, y: 6.43, w, h: 0.25, fontSize: 9.5, color: HEX.muted, align: 'center', margin: 0, isTextBox: true });
    ox += w + 0.12;
  });
  framed(s, shot('drg-brain-light.png'), 6.95, 2.65, 5.8, 5.8 * 1560 / 2760, 'Screenshot: Brain and Mental Health monitor showing YES');
  caption(s, 'Real screenshot. Sofia Patel (CM-04) is a fictional crew member; all data is synthetic.', 6.95, 6.05, 5.8);
  s.addText('The language model never makes or changes this decision.', { x: 6.95, y: 6.38, w: 5.8, h: 0.3, fontSize: 11, bold: true,
    color: C.accent1, margin: 0, isTextBox: true });
  s.addNotes(`Dr G Zero is the dashboard; SCND is its engine. Each crew member is compared only with their own baseline. A domain counts as changed only when three independent detectors agree: persistence, EWMA and CUSUM. A YES needs two core domains, or one strong and long-lasting change, and a three-day confirmation. If the data is poor, the answer is INSUFFICIENT DATA, never a guess. On held-out synthetic data the false-positive rate was 0.28%. The output is a pattern, not a diagnosis, and it leads to a suggestion: talk to crew support if you'd like. The screenshot is the real app, fictional crew member CM-04 on day 130 of a synthetic mission.`);
}

// ======================= 4. Fable =======================
pres.addSection({ title: 'Fable' });
{
  const s = pres.addSlide({ masterName: 'Mochi Content', sectionTitle: 'Fable' });
  s.addText('MEET FABLE  ·  PLANNED', { placeholder: 'kicker' });
  s.addText('Companions that help the crew get together', { placeholder: 'title' });
  const y = 2.45;
  const person = (name, x) => s.addText(name, { shape: S.ellipse, x, y: y - 0.05, w: 1.1, h: 1.1, fill: { color: C.background1 },
    line: { color: HEX.rose, width: 1.5 }, color: C.text1, fontSize: 14, bold: true, align: 'center', valign: 'middle', margin: 0, objectName: `Astronaut ${name}` });
  person(A, 0.6);
  box(s, `${A}'s companion`, 'Mochi', 2.3, y, 2.25, 1.0, HEX.roseLight, C.text1, { name: `${A}'s companion` });
  box(s, 'FABLE 5.1', 'Consent ledger · Coordination engine', 5.2, y - 0.25, 2.95, 1.5, C.accent1, C.background1, { titleSize: 20, subSize: 11.5, name: 'Fable' });
  box(s, `${B}'s companion`, 'Comet', 8.8, y, 2.25, 1.0, HEX.skyLight, C.text1, { name: `${B}'s companion` });
  person(B, 11.65);
  arrow(s, 1.75, y + 0.5, 0.5, 0, HEX.rose, true);
  arrow(s, 4.6, y + 0.5, 0.55, 0, HEX.rose, true);
  arrow(s, 8.2, y + 0.5, 0.55, 0, HEX.sky, true);
  arrow(s, 11.1, y + 0.5, 0.5, 0, HEX.sky, true);
  const bubble = (t, x, w, fill) => s.addText(t, { shape: S.wedgeRoundRectCallout, x, y: 1.6, w, h: 0.58, fill: { color: fill },
    line: { color: HEX.line, width: 0.75 }, color: C.text1, fontSize: 12, italic: true, align: 'center', valign: 'middle', margin: 2, objectName: `Bubble ${t}` });
  bubble(`"I'm up for a puzzle at 19:00."`, 0.45, 3.2, C.background1);
  bubble(`"${A}'s up for a puzzle at 19:00. Want in?"`, 8.35, 4.45, C.background1);
  const flow = [`${A} asks Mochi for a puzzle partner`, `${B} had chosen "open to an activity"`, 'Fable matches the two and proposes', `Comet asks ${B}; both accept`];
  flow.forEach((t, i) => s.addText([{ text: `${i + 1}  `, options: { bold: true, color: C.accent1 } }, { text: t }], {
    x: 0.6 + i * 3.05, y: 3.75, w: 2.95, h: 0.4, fontSize: 11.5, color: C.text1, margin: 0, valign: 'middle', isTextBox: true }));
  const col = (title, items, x, fill, edge, color) => {
    s.addShape(S.roundRect, { x, y: 4.4, w: 3.9, h: 2.05, rectRadius: 0.12, fill: { color: fill }, line: { color: edge, width: 1 }, objectName: `${title} panel` });
    s.addText(title, { x: x + 0.25, y: 4.5, w: 3.4, h: 0.4, fontSize: 14, bold: true, color, margin: 0, isTextBox: true });
    s.addText(items.map((t, i) => ({ text: t, options: { bullet: { indent: 14 }, breakLine: i < items.length - 1 } })), {
      x: x + 0.25, y: 4.92, w: 3.45, h: 1.45, fontSize: 12, color: C.text1, margin: 0, valign: 'top', paraSpaceAfter: 3, isTextBox: true });
  };
  col('Shared between companions', ['The activity and time window', 'Who is invited (only people who are open)', 'Yes or no'], 0.6, HEX.mintLight, HEX.mint, HEX.mint);
  col('Never shared', ['Journal entries or chats', 'Raw health data or SCND results', 'Emotional state'], 4.72, HEX.coralLight, HEX.coral, HEX.coral);
  col('Ground rules', ['"Personal space" means never invited', 'No inferences from silence or behaviour', 'Opt out anytime; Mochi works without Fable'], 8.84, C.background1, HEX.line, HEX.rose);
  caption(s, 'Available today: voluntary crew statuses, activity invitations and crew puzzles. Planned: the full Fable coordination layer.', 0.6, 6.6, 12.1);
  s.addNotes(`Fable coordinates activities, not surveillance. Every astronaut has their own companion. Here ${A} tells Mochi: up for a puzzle at seven. Earlier, ${B} had set "open to an activity". Fable matches those two explicit choices and sends a proposal; ${B}'s companion, Comet, asks ${B}, and both say yes. What crosses between companions is only activity logistics. Journals, health data, SCND results and emotional state never do. Today's build has the precursor: voluntary statuses, invitations and crew puzzles. The full Fable layer is on the roadmap.`);
}

// ======================= 5. Gamification =======================
pres.addSection({ title: 'Gamification' });
{
  const s = pres.addSlide({ masterName: 'Mochi Content', sectionTitle: 'Gamification' });
  s.addText('PLAY', { placeholder: 'kicker' });
  s.addText('Healthy routines, made fun', { placeholder: 'title' });
  const items = [
    ['game-explore-light.png', 'Explore the Solar System', 'Check-ins, exercise, rest and recovery carry you from the Moon to Pluto.'],
    ['game-habitat-light.png', 'Build your habitat', 'Rooms, a garden and a home for your pet, unlocked by taking part.'],
    ['game-crew-light.png', 'Crew missions', 'Shared puzzles and co-op goals, shown as crew totals only.'],
  ];
  const w = 3.85, h = w * 1560 / 2760;
  items.forEach(([f, t, d], i) => {
    const x = 0.65 + i * 4.1;
    framed(s, shot(f), x, 1.75, w, h, `Screenshot: ${t}`);
    s.addText([{ text: t, options: { bold: true, fontSize: 15, color: C.text1, breakLine: true } }, { text: d, options: { fontSize: 12, color: HEX.muted } }],
      { x, y: 4.05, w, h: 0.95, margin: 0, valign: 'top', isTextBox: true });
  });
  const rules = ['Rest is never punished', 'No competitive health metrics', 'Nothing is ever taken away'];
  s.addShape(S.roundRect, { x: 0.6, y: 5.3, w: 12.15, h: 1.15, rectRadius: 0.15, fill: { color: HEX.roseLight }, line: { color: HEX.roseLight }, objectName: 'Principles band' });
  rules.forEach((t, i) => {
    const x = 0.95 + i * 4.05;
    s.addText('✓', { shape: S.ellipse, x, y: 5.6, w: 0.55, h: 0.55, fill: { color: C.accent1 }, color: C.background1, fontSize: 16, bold: true, align: 'center', valign: 'middle', margin: 0, objectName: `Check ${i + 1}` });
    s.addText(t, { x: x + 0.7, y: 5.55, w: 3.05, h: 0.65, fontSize: 15.5, bold: true, color: C.text1, fontFace: THEME.headFontFace, margin: 0, valign: 'middle', isTextBox: true });
  });
  caption(s, 'Real screenshots from the running app (fictional crew, synthetic data).', 0.6, 6.6, 12.1);
  s.addNotes(`Gamification makes healthy routines feel like play. Progress comes from taking part: check-ins, prescribed exercise, rest, recovery and time with the crew. That moves you across the Solar System, builds your habitat and unlocks things for your pet. Three rules: rest days count as progress, health numbers are never scores or rankings, and nothing is ever taken away. Crew missions only show crew totals, so nobody is compared.`);
}

// ======================= 6. Architecture & safety =======================
pres.addSection({ title: 'Architecture and safety' });
{
  const s = pres.addSlide({ masterName: 'Mochi Content', sectionTitle: 'Architecture and safety' });
  s.addText('ARCHITECTURE & SAFETY', { placeholder: 'kicker' });
  s.addText('Local, explainable, and humans stay in charge', { placeholder: 'title' });
  s.addShape(S.roundRect, { x: 0.6, y: 1.65, w: 7.6, h: 5.05, rectRadius: 0.12, fill: { color: C.background1 },
    line: { color: HEX.rose, width: 1, dashType: 'dash' }, objectName: 'Your computer boundary' });
  s.addText('YOUR COMPUTER  ·  ELECTRON APP  ·  NOTHING LEAVES BY DEFAULT', { x: 0.85, y: 1.75, w: 7.2, h: 0.3, fontSize: 10, bold: true,
    color: C.accent1, charSpacing: 1, margin: 0, isTextBox: true });
  const cA = 0.85, cB = 4.9, bw = 3.0, bh = 0.62, rows = [2.2, 3.08, 3.96, 4.84];
  const left = [['Mochi window', 'sandboxed renderer', HEX.roseLight], ['Safety screen + router', 'crisis words → human help', HEX.roseLight],
    ['Qwen3 4B via Ollama', 'local model on 127.0.0.1', HEX.skyLight], ['Output guard', 'checks every reply', HEX.roseLight]];
  const right = [['Check-ins + sensors', 'synthetic in this demo', HEX.paper], ['SCND engine', 'deterministic rules', HEX.amberLight],
    ['Dr G Zero', 'explains every decision', HEX.roseLight], ['Astronaut + crew support', 'people decide what happens', HEX.mintLight]];
  left.forEach(([t, d, f], i) => box(s, t, d, cA, rows[i], bw, bh, f, C.text1, { titleSize: 12.5, subSize: 10, name: `Conversation ${t}` }));
  right.forEach(([t, d, f], i) => box(s, t, d, cB, rows[i], bw, bh, f, C.text1, { titleSize: 12.5, subSize: 10, name: `Health ${t}` }));
  for (let i = 0; i < 3; i++) { arrow(s, cA + bw / 2, rows[i] + bh, 0, rows[i + 1] - rows[i] - bh); arrow(s, cB + bw / 2, rows[i] + bh, 0, rows[i + 1] - rows[i] - bh); }
  // SCND → conversation: a suggestion flows from the engine to Mochi (arrowhead on the Mochi side).
  s.addShape(S.line, { x: cA + bw, y: rows[1] + bh / 2, w: cB - cA - bw, h: 0, line: { color: HEX.amber, width: 1.75, beginArrowType: 'triangle' }, objectName: 'SCND suggestion to Mochi' });
  // (No label on the SCND → Mochi arrow; the speaker notes explain it is a suggestion only.)
  box(s, 'Local SQLite storage', 'journals, check-ins, progress', cA, 5.8, bw, 0.62, HEX.paper, C.text1, { titleSize: 12, subSize: 10, line: { color: HEX.line, width: 0.75 }, name: 'Local storage' });
  box(s, 'Fable (planned)', 'activity intents only', cB, 5.8, bw, 0.62, C.background1, C.text1, { titleSize: 12, subSize: 10, line: { color: HEX.sky, width: 1, dashType: 'dash' }, name: 'Fable planned' });
  const safety = [
    ['The LLM never makes medical decisions', 'SCND is deterministic code; the model only phrases things.'],
    ['Human oversight', 'A YES suggests talking to crew support. The astronaut decides what to share.'],
    ['No diagnosis', 'Patterns, not conditions. A NO is not proof of wellbeing.'],
    ['Journals stay private', 'Never in the model\'s context, never shared.'],
    ['Works offline', 'No account, no telemetry. Anthropic is optional and off.'],
  ];
  safety.forEach(([t, b], i) => {
    const y = 1.7 + i * 1.0;
    s.addShape(S.ellipse, { x: 8.6, y: y + 0.06, w: 0.3, h: 0.3, fill: { color: i === 0 ? C.accent1 : C.accent3 }, line: { color: HEX.white, width: 0.5 }, objectName: `Safety marker ${i + 1}` });
    s.addText([{ text: t, options: { bold: true, fontSize: 14, color: C.text1, breakLine: true } }, { text: b, options: { fontSize: 11.5, color: HEX.muted } }],
      { x: 9.05, y, w: 3.75, h: 0.92, margin: 0, valign: 'top', isTextBox: true });
  });
  s.addNotes(`Mochi is an Electron desktop app, and everything runs on the astronaut's own computer. Two paths. The conversation path: a safety screen and a router run before any model is involved; the model is Qwen3 4B running locally through Ollama; every reply passes an output guard. The health path: SCND is deterministic, explainable code, shown in Dr G Zero, and the people decide what happens next. SCND can hand Mochi a gentle suggestion, but the model can never make or change a health decision. Data stays in local SQLite. Fable is planned and only carries activity intents.`);
}

// ======================= 7. Closing =======================
pres.addSection({ title: 'Closing' });
{
  const s = pres.addSlide({ masterName: 'Mochi Dark', sectionTitle: 'Closing' });
  s.addText([
    { text: 'A LITTLE COMPANION.', options: { breakLine: true } },
    { text: 'A CONNECTED CREW.', options: { breakLine: true } },
    { text: 'A HEALTHIER MISSION.', options: { color: HEX.roseSoft } },
  ], { x: 0.8, y: 0.8, w: 8.6, h: 2.5, fontSize: 40, bold: true, color: C.background1, fontFace: THEME.headFontFace, margin: 0, valign: 'top', lineSpacingMultiple: 1.05, isTextBox: true });
  const base = SITE_URL.replace(/\/$/, '');
  const links = [
    ['Download', 'macOS · Windows', REPO_URL && `${REPO_URL}/releases/latest`],
    ['Dr G Zero', 'SCND insight', base && `${base}/#dr-g-zero`],
    ['Fable 5.1', 'planned', base && `${base}/#fable`],
    ['GitHub', 'source + docs', REPO_URL],
    ['Roadmap', "what's next", REPO_URL && `${REPO_URL}/blob/main/docs/mochi-implementation-roadmap.md`],
  ];
  links.forEach(([t, d, url], i) => {
    s.addText([{ text: t, options: { bold: true, fontSize: 15, breakLine: true, ...(url ? { hyperlink: { url } } : {}) } }, { text: d, options: { fontSize: 11, color: 'B9B5D6' } }], {
      shape: S.roundRect, rectRadius: 0.12, x: 0.8 + i * 1.75, y: 3.6, w: 1.6, h: 1.05, fill: { color: HEX.night2 },
      line: { color: '4A4778', width: 0.75 }, color: C.background1, align: 'center', valign: 'middle', margin: 2, objectName: `Link ${t}` });
  });
  if (!REPO_URL) s.addText('Links go live once the repository and website are published.', { x: 0.8, y: 4.75, w: 8.6, h: 0.3, fontSize: 11, italic: true, color: '9C98BC', margin: 0, isTextBox: true });
  s.addText('Because looking after astronauts means looking after the humans behind the helmets.', { x: 0.8, y: 5.4, w: 8.9, h: 0.9,
    fontSize: 22, italic: true, color: HEX.roseSoft, margin: 0, valign: 'top', isTextBox: true });
  const qx = 10.25, qy = 0.9, qs = 2.4;
  if (SITE_URL) {
    const png = await QRCode.toBuffer(SITE_URL, { margin: 1, width: 600, color: { dark: '#1C1B3A', light: '#FFFFFF' } });
    s.addShape(S.roundRect, { x: qx - 0.12, y: qy - 0.12, w: qs + 0.24, h: qs + 0.24, rectRadius: 0.12, fill: { color: C.background1 }, line: { color: HEX.white }, objectName: 'QR frame' });
    s.addImage({ data: 'image/png;base64,' + png.toString('base64'), x: qx, y: qy, w: qs, h: qs, altText: `QR code for ${SITE_URL}`, objectName: 'QR code' });
    s.addText(SITE_URL.replace(/^https?:\/\//, ''), { x: qx - 0.5, y: qy + qs + 0.2, w: qs + 1, h: 0.3, fontSize: 10, color: 'B9B5D6', align: 'center', margin: 0, isTextBox: true });
  } else {
    s.addText([{ text: 'QR CODE', options: { bold: true, fontSize: 14, breakLine: true } }, { text: 'Placeholder: added once the GitHub Pages site is published', options: { fontSize: 10.5 } }], {
      shape: S.roundRect, rectRadius: 0.12, x: qx, y: qy, w: qs, h: qs, fill: { color: HEX.night2 }, line: { color: '8A86A8', width: 1.25, dashType: 'dash' },
      color: 'D8D5EC', align: 'center', valign: 'middle', margin: 8, objectName: 'QR placeholder' });
  }
  const mw = 1.95, mh = mw * 433 / 405;
  s.addImage({ path: shot('mochi-art.png'), x: 10.45, y: 4.2, w: mw, h: mh, altText: 'Mochi waving goodbye (team artwork)', objectName: 'Mochi artwork' });
  s.addNotes(`A little companion, a connected crew, a healthier mission. You can download Mochi for macOS and Windows, explore Dr G Zero and the SCND engine, read the Fable design, and find the source, docs and roadmap on GitHub. Because looking after astronauts means looking after the humans behind the helmets. Thank you.`);
}

// ---------- Write, then apply theme colours ----------
await pres.writeFile({ fileName: OUT });
const zip = await JSZip.loadAsync(readFileSync(OUT));
const themePath = Object.keys(zip.files).find((p) => /^ppt\/theme\/theme\d+\.xml$/.test(p));
const c = THEME.colors;
const clr = (tag, v) => `<a:${tag}><a:srgbClr val="${v}"/></a:${tag}>`;
const scheme = `<a:clrScheme name="${THEME.name}">${clr('dk1', c.dk1)}${clr('lt1', c.lt1)}${clr('dk2', c.dk2)}${clr('lt2', c.lt2)}${[1, 2, 3, 4, 5, 6].map((n) => clr(`accent${n}`, c[`accent${n}`])).join('')}${clr('hlink', c.hlink)}${clr('folHlink', c.folHlink)}</a:clrScheme>`;
let xml = await zip.file(themePath).async('string');
xml = xml.replace(/<a:clrScheme[\s\S]*?<\/a:clrScheme>/, scheme).replace(/(<a:theme[^>]*name=")[^"]*"/, `$1${THEME.name}"`);
zip.file(themePath, xml);
// Re-pack files only: folder entries upset some cloud editors.
const clean = new JSZip();
for (const [p, f] of Object.entries(zip.files)) if (!f.dir) clean.file(p, await f.async('uint8array'), { createFolders: false });
writeFileSync(OUT, await clean.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.log(`Wrote ${OUT} (7 slides${SITE_URL ? ', QR for ' + SITE_URL : ', QR placeholder'}; Fable example names: ${A}, ${B})`);
