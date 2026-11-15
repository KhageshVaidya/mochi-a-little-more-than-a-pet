#!/usr/bin/env node
/**
 * Builds PLACEHOLDER vector rigs for the dog, cat and alien companions (no team artwork exists yet).
 * Each species is assembled from separate parts so its OWN anatomy can move:
 *   dog   — fast tail wag, ear flop, panting chest, eyelid blinks
 *   cat   — slow S-curl tail, ear twitch, slow blink
 *   alien — hover bob, antenna glow and sway, eyelid blinks, arm wave
 * States per species: idle.svg, sleep.svg, happy.svg. Animations live inside each SVG (<style>), so they run
 * when shown via <img>, and they respect prefers-reduced-motion.
 * Replace these files with team artwork at any time — the manifest is the only contract.
 *
 * Usage: node tools/build-placeholder-companions.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';

const INK = '#2b2226';
const svg = (body, css) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 210" width="200" height="210">
<!-- ORBITAL placeholder companion artwork (vector). Replace with team artwork; see assets/pets/README.md -->
<style>
  * { stroke-linejoin: round; stroke-linecap: round; }
  .ink { stroke: ${INK}; stroke-width: 3; }
  .blink { transform-box: fill-box; transform-origin: 50% 0%; animation: blink 5.2s infinite; }
  @keyframes blink { 0%, 93%, 100% { transform: scaleY(0); } 95.5% { transform: scaleY(1); } }
  ${css}
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
</style>
${body}
</svg>
`;

// ── DOG ─────────────────────────────────────────────────────────────────────
const dogFur = '#d9a877', dogShade = '#b9824f', dogBelly = '#f3dcc0';
const dogTail = (anim) => `<g class="${anim}" style="transform-origin:138px 168px"><path d="M138 168 C 160 160, 172 140, 168 118" fill="none" stroke-width="11" stroke="${INK}"/><path d="M138 168 C 160 160, 172 140, 168 118" fill="none" stroke-width="6" stroke="${dogFur}"/></g>`;
const dogBody = `
  <ellipse cx="100" cy="203" rx="46" ry="5" fill="rgba(0,0,0,0.12)"/>
  <g class="chest" style="transform-origin:100px 200px">
    <path class="ink" fill="${dogFur}" d="M62 200 C 56 160, 66 128, 100 124 C 134 128, 144 160, 138 200 Z"/>
    <path fill="${dogBelly}" d="M82 198 C 80 172, 86 150, 100 148 C 114 150, 120 172, 118 198 Z"/>
    <path class="ink" fill="${dogFur}" d="M74 200 C 72 188, 78 182, 86 184 C 92 186, 92 196, 90 200 Z"/>
    <path class="ink" fill="${dogFur}" d="M126 200 C 128 188, 122 182, 114 184 C 108 186, 108 196, 110 200 Z"/>
  </g>`;
const dogHead = (eyes, mouth, earAnim) => `
  <g class="head" style="transform-origin:100px 120px">
    <g class="${earAnim}" style="transform-origin:62px 62px"><path class="ink" fill="${dogShade}" d="M64 58 C 44 60, 36 92, 46 112 C 54 118, 64 108, 68 92 Z"/></g>
    <g class="${earAnim} r" style="transform-origin:138px 62px"><path class="ink" fill="${dogShade}" d="M136 58 C 156 60, 164 92, 154 112 C 146 118, 136 108, 132 92 Z"/></g>
    <circle class="ink" cx="100" cy="82" r="40" fill="${dogFur}"/>
    <ellipse cx="100" cy="98" rx="22" ry="17" fill="${dogBelly}"/>
    ${eyes}
    <ellipse class="ink" cx="100" cy="90" rx="7" ry="5" fill="${INK}"/>
    ${mouth}
  </g>`;
const dogEyesOpen = `
    <circle cx="84" cy="76" r="5.5" fill="${INK}"/><circle cx="116" cy="76" r="5.5" fill="${INK}"/>
    <circle cx="86" cy="74" r="1.6" fill="#fff"/><circle cx="118" cy="74" r="1.6" fill="#fff"/>
    <rect class="blink" x="77" y="69" width="14" height="14" rx="6" fill="${dogFur}"/>
    <rect class="blink" x="109" y="69" width="14" height="14" rx="6" fill="${dogFur}"/>`;
const dogEyesClosed = `<path class="ink" d="M78 78 q6 5 12 0" fill="none"/><path class="ink" d="M110 78 q6 5 12 0" fill="none"/>`;
const dogEyesHappy = `<path class="ink" d="M78 79 q6 -7 12 0" fill="none"/><path class="ink" d="M110 79 q6 -7 12 0" fill="none"/>`;
const dogMouthSmile = `<path class="ink" d="M92 100 q8 7 16 0" fill="none"/>`;
const dogMouthOpen = `<path class="ink" d="M90 99 q10 14 20 0 z" fill="#6b2a2a"/><path d="M96 104 q4 8 8 0 z" fill="#e07a86"/>`;
const dogCss = {
  idle: `.wag { animation: wag 0.42s ease-in-out infinite alternate; } @keyframes wag { from { transform: rotate(-14deg); } to { transform: rotate(16deg); } }
         .chest { animation: pant 0.7s ease-in-out infinite; } @keyframes pant { 50% { transform: scale(1.012, 1.03); } }
         .head { animation: tilt 7s ease-in-out infinite; } @keyframes tilt { 0%, 70%, 100% { transform: rotate(0); } 78%, 90% { transform: rotate(-6deg); } }
         .flop { animation: flop 4.8s ease-in-out infinite; } .flop.r { animation-delay: .25s; } @keyframes flop { 0%, 80%, 100% { transform: rotate(0); } 86% { transform: rotate(-7deg); } 92% { transform: rotate(4deg); } }`,
  sleep: `.chest { animation: breathe 4.2s ease-in-out infinite; } @keyframes breathe { 50% { transform: scale(1.01, 1.035); } }
          .head { transform: translateY(6px) rotate(-4deg); }`,
  happy: `.wag { animation: wag 0.22s ease-in-out infinite alternate; } @keyframes wag { from { transform: rotate(-22deg); } to { transform: rotate(24deg); } }
          .flop { animation: perk 0.5s ease-in-out infinite alternate; } @keyframes perk { to { transform: rotate(-12deg); } }
          .chest { animation: pant 0.4s ease-in-out infinite; } @keyframes pant { 50% { transform: scale(1.015, 1.04); } }`,
};
const dog = {
  idle: svg(dogTail('wag') + dogBody + dogHead(dogEyesOpen, dogMouthSmile, 'flop'), dogCss.idle),
  sleep: svg(dogTail('') + dogBody + dogHead(dogEyesClosed, dogMouthSmile, '') + `<text x="146" y="44" font-size="16" font-family="sans-serif" font-weight="700" fill="${INK}" opacity=".55">z</text>`, dogCss.sleep),
  happy: svg(dogTail('wag') + dogBody + dogHead(dogEyesHappy, dogMouthOpen, 'flop'), dogCss.happy),
};

// ── CAT ─────────────────────────────────────────────────────────────────────
const catFur = '#b8b4c9', catShade = '#8f8aa6', catBelly = '#ecebf3', catEar = '#e7a9b8';
const catTail = (anim, d = 'M132 190 C 168 188, 176 150, 160 128 C 150 114, 162 100, 174 104') => `<g class="${anim}" style="transform-origin:132px 190px"><path d="${d}" fill="none" stroke="${INK}" stroke-width="13"/><path d="${d}" fill="none" stroke="${catFur}" stroke-width="8"/></g>`;
const catBody = `
  <ellipse cx="100" cy="203" rx="44" ry="5" fill="rgba(0,0,0,0.12)"/>
  <g class="chest" style="transform-origin:100px 200px">
    <path class="ink" fill="${catFur}" d="M66 200 C 60 164, 70 132, 100 128 C 130 132, 140 164, 134 200 Z"/>
    <path fill="${catBelly}" d="M86 198 C 84 174, 90 154, 100 152 C 110 154, 116 174, 114 198 Z"/>
    <path class="ink" fill="${catFur}" d="M78 200 C 76 190, 82 185, 89 187 C 94 189, 94 197, 92 200 Z"/>
    <path class="ink" fill="${catFur}" d="M122 200 C 124 190, 118 185, 111 187 C 106 189, 106 197, 108 200 Z"/>
  </g>`;
const catHead = (eyes, earAnim) => `
  <g class="head" style="transform-origin:100px 124px">
    <g class="${earAnim}" style="transform-origin:72px 58px"><path class="ink" fill="${catFur}" d="M66 66 L 70 26 L 96 50 Z"/><path fill="${catEar}" d="M71 58 L 73 36 L 88 50 Z"/></g>
    <g class="${earAnim} r" style="transform-origin:128px 58px"><path class="ink" fill="${catFur}" d="M134 66 L 130 26 L 104 50 Z"/><path fill="${catEar}" d="M129 58 L 127 36 L 112 50 Z"/></g>
    <ellipse class="ink" cx="100" cy="82" rx="40" ry="36" fill="${catFur}"/>
    ${eyes}
    <path class="ink" d="M96 92 L 104 92 L 100 97 Z" fill="${catEar}"/>
    <path class="ink" d="M100 97 q-6 6 -11 2 M100 97 q6 6 11 2" fill="none" stroke-width="2.4"/>
    <path d="M70 92 L 52 88 M70 97 L 52 99 M130 92 L 148 88 M130 97 L 148 99" stroke="${INK}" stroke-width="1.6" opacity=".7"/>
  </g>`;
const catEyesOpen = `
    <ellipse cx="84" cy="78" rx="6" ry="7.5" fill="#8fc46a" stroke="${INK}" stroke-width="2.2"/><ellipse cx="116" cy="78" rx="6" ry="7.5" fill="#8fc46a" stroke="${INK}" stroke-width="2.2"/>
    <ellipse cx="84" cy="78" rx="2" ry="6" fill="${INK}"/><ellipse cx="116" cy="78" rx="2" ry="6" fill="${INK}"/>
    <rect class="blink slow" x="76" y="69" width="16" height="18" rx="7" fill="${catFur}"/>
    <rect class="blink slow" x="108" y="69" width="16" height="18" rx="7" fill="${catFur}"/>`;
const catEyesClosed = `<path class="ink" d="M78 80 q6 4 12 0" fill="none"/><path class="ink" d="M110 80 q6 4 12 0" fill="none"/>`;
const catEyesHappy = `<path class="ink" d="M78 81 q6 -7 12 0" fill="none"/><path class="ink" d="M110 81 q6 -7 12 0" fill="none"/>`;
const catCss = {
  idle: `.curl { animation: curl 4.6s ease-in-out infinite; } @keyframes curl { 0%, 100% { transform: rotate(-4deg); } 50% { transform: rotate(7deg); } }
         .chest { animation: sway 6s ease-in-out infinite; } @keyframes sway { 50% { transform: rotate(1.2deg) scale(1.005, 1.012); } }
         .twitch { animation: twitch 6.5s ease-in-out infinite; } .twitch.r { animation-delay: 2.1s; } @keyframes twitch { 0%, 90%, 100% { transform: rotate(0); } 93% { transform: rotate(-10deg); } 96% { transform: rotate(3deg); } }
         .slow { animation-duration: 7.5s; } @keyframes blink { 0%, 90%, 100% { transform: scaleY(0); } 94% { transform: scaleY(1); } }`,
  sleep: `.chest { animation: breathe 5s ease-in-out infinite; } @keyframes breathe { 50% { transform: scale(1.01, 1.03); } } .head { transform: translateY(8px) rotate(5deg); }`,
  happy: `.curl { animation: curl 1.2s ease-in-out infinite; } @keyframes curl { 0%, 100% { transform: rotate(-8deg); } 50% { transform: rotate(10deg); } }
          .twitch { animation: perk .6s ease-in-out infinite alternate; } @keyframes perk { to { transform: rotate(6deg); } }`,
};
const cat = {
  idle: svg(catTail('curl') + catBody + catHead(catEyesOpen, 'twitch'), catCss.idle),
  sleep: svg(catTail('', 'M132 196 C 160 200, 176 190, 150 184 C 128 180, 110 196, 92 198') + catBody + catHead(catEyesClosed, '') + `<text x="142" y="40" font-size="16" font-family="sans-serif" font-weight="700" fill="${INK}" opacity=".55">z</text>`, catCss.sleep),
  happy: svg(catTail('curl', 'M132 190 C 160 180, 168 140, 158 104 C 154 92, 166 84, 176 92') + catBody + catHead(catEyesHappy, 'twitch'), catCss.happy),
};

// ── ALIEN ───────────────────────────────────────────────────────────────────
const al = '#7ccfb8', alShade = '#4fa894', alBelly = '#c6f0e4';
const alien = (eyes, mood) => `
  <ellipse class="shadow" cx="100" cy="204" rx="34" ry="4.5" fill="rgba(0,0,0,0.12)"/>
  <g class="hover">
    <g class="antenna" style="transform-origin:100px 50px"><path class="ink" d="M100 50 C 98 34, 108 26, 112 18" fill="none"/><circle class="glow" cx="113" cy="16" r="7" fill="#ffd27a" stroke="${INK}" stroke-width="2"/></g>
    <g class="arm l" style="transform-origin:58px 130px"><path class="ink" fill="${alShade}" d="M60 124 C 44 128, 38 144, 44 152 C 50 156, 58 146, 64 138 Z"/></g>
    <g class="arm r" style="transform-origin:142px 130px"><path class="ink" fill="${alShade}" d="M140 124 C 156 128, 162 144, 156 152 C 150 156, 142 146, 136 138 Z"/></g>
    <path class="ink" fill="${al}" d="M100 48 C 140 48, 152 84, 150 122 C 148 160, 128 180, 100 180 C 72 180, 52 160, 50 122 C 48 84, 60 48, 100 48 Z"/>
    <ellipse cx="100" cy="154" rx="27" ry="19" fill="${alBelly}"/>
    ${eyes}
    ${mood === 'happy' ? `<path class="ink" d="M88 124 q12 14 24 0 z" fill="#2b2226"/>` : `<path class="ink" d="M90 126 q10 7 20 0" fill="none"/>`}
    <ellipse cx="70" cy="114" rx="7" ry="4" fill="#ff9e9e" opacity=".45"/><ellipse cx="130" cy="114" rx="7" ry="4" fill="#ff9e9e" opacity=".45"/>
  </g>`;
const alEyesOpen = `
    <ellipse cx="82" cy="100" rx="11" ry="14" fill="${INK}"/><ellipse cx="118" cy="100" rx="11" ry="14" fill="${INK}"/>
    <circle cx="86" cy="94" r="4" fill="#fff"/><circle cx="122" cy="94" r="4" fill="#fff"/>
    <rect class="blink" x="69" y="85" width="26" height="30" rx="12" fill="${al}"/><rect class="blink" x="105" y="85" width="26" height="30" rx="12" fill="${al}"/>`;
const alEyesClosed = `<path class="ink" d="M72 102 q10 7 20 0" fill="none"/><path class="ink" d="M108 102 q10 7 20 0" fill="none"/>`;
const alEyesHappy = `<path class="ink" d="M72 104 q10 -10 20 0" fill="none"/><path class="ink" d="M108 104 q10 -10 20 0" fill="none"/>`;
const alCss = {
  idle: `.hover { animation: hover 3.2s ease-in-out infinite; } @keyframes hover { 50% { transform: translateY(-9px); } }
         .shadow { transform-origin: 100px 204px; animation: sh 3.2s ease-in-out infinite; } @keyframes sh { 50% { transform: scaleX(.8); opacity: .6; } }
         .antenna { animation: sway 3.6s ease-in-out infinite; } @keyframes sway { 50% { transform: rotate(8deg); } }
         .glow { animation: glow 2.4s ease-in-out infinite; } @keyframes glow { 50% { opacity: .55; } }`,
  sleep: `.hover { transform: translateY(6px); animation: drift 6s ease-in-out infinite; } @keyframes drift { 50% { transform: translateY(3px); } } .glow { opacity: .35; }`,
  happy: `.hover { animation: hop .7s ease-in-out infinite; } @keyframes hop { 50% { transform: translateY(-16px); } }
          .arm.l { animation: wave .35s ease-in-out infinite alternate; } .arm.r { animation: wave .35s ease-in-out infinite alternate-reverse; } @keyframes wave { to { transform: rotate(-28deg); } }
          .glow { animation: glow .5s ease-in-out infinite; } @keyframes glow { 50% { opacity: .4; } }`,
};
const alienSet = {
  idle: svg(alien(alEyesOpen, 'idle'), alCss.idle),
  sleep: svg(alien(alEyesClosed, 'sleep') + `<text x="148" y="56" font-size="16" font-family="sans-serif" font-weight="700" fill="${INK}" opacity=".55">z</text>`, alCss.sleep),
  happy: svg(alien(alEyesHappy, 'happy'), alCss.happy),
};

for (const [name, set] of Object.entries({ dog, cat, alien: alienSet })) {
  const dir = new URL(`../assets/pets/${name}/`, import.meta.url);
  mkdirSync(dir, { recursive: true });
  for (const [state, content] of Object.entries(set)) writeFileSync(new URL(`${state}.svg`, dir), content);
  console.log(`wrote assets/pets/${name}/{idle,sleep,happy}.svg`);
}
