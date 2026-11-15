import { useEffect, useState } from 'react';
import type { AnimationDef, CompanionManifest, CompanionState } from '@orbital/contracts';

/**
 * Renders one companion in one state from its manifest — the artwork itself is never redrawn.
 *  - rig 'raster-layered' (Mochi): body layer + tail layer (seam-anchored swish) + blink lids over the drawn pupils.
 *  - rig 'svg-states' (dog/cat/alien): the state's SVG, which animates its own parts (tail, ears, eyelids…).
 * Container motion (float, hop, celebrate…) comes from the species motion profile (CSS class `mp-<profile>`).
 * Artwork sits in a box with the artwork's exact aspect ratio, contain-fitted and bottom-anchored.
 */

export const assetUrl = (companionId: string, file: string) => `orbital-asset://pets/${companionId}/${encodeURI(file)}`;

function Frames({ def, companionId, alt }: { def: Extract<AnimationDef, { kind: 'frames' }>; companionId: string; alt: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    setI(0);
    const t = setInterval(() => setI((n) => (def.loop ? (n + 1) % def.frames.length : Math.min(n + 1, def.frames.length - 1))), 1000 / def.fps);
    return () => clearInterval(t);
  }, [def]);
  return <img src={assetUrl(companionId, def.frames[i]!)} alt={alt} draggable={false} className="companion-art" />;
}

function Overlay({ kind }: { kind: 'zzz' | 'sparkles' }) {
  if (kind === 'zzz')
    return (
      <div className="overlay-zzz" aria-hidden>
        <span>z</span>
        <span>z</span>
        <span>Z</span>
      </div>
    );
  return (
    <div className="overlay-sparkles" aria-hidden>
      {Array.from({ length: 8 }, (_, k) => (
        <svg key={k} viewBox="0 0 10 10" style={{ ['--a' as string]: `${k * 45}deg`, ['--d' as string]: `${k * 40}ms` }}>
          <path d="M5 0 L6.2 3.8 L10 5 L6.2 6.2 L5 10 L3.8 6.2 L0 5 L3.8 3.8 Z" />
        </svg>
      ))}
    </div>
  );
}

/** Natural blink cadence: every 3–6 s, occasionally a double blink. Disabled while asleep (lids stay closed). */
function useBlink(enabled: boolean): boolean {
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let t: ReturnType<typeof setTimeout>;
    const schedule = () => {
      t = setTimeout(() => {
        setClosed(true);
        setTimeout(() => setClosed(false), 140);
        if (Math.random() < 0.18) setTimeout(() => (setClosed(true), setTimeout(() => setClosed(false), 120)), 320);
        schedule();
      }, 3000 + Math.random() * 3000);
    };
    schedule();
    return () => clearTimeout(t);
  }, [enabled]);
  return closed;
}

function RasterRig({ manifest, state }: { manifest: CompanionManifest; state: CompanionState }) {
  const rig = manifest.rig;
  const asleep = state === 'sleep';
  const blinking = useBlink(!asleep);
  if (rig.kind !== 'raster-layered') return null;
  const lidsClosed = asleep || blinking;
  return (
    <div className="rig" style={{ aspectRatio: `${manifest.artwork.width} / ${manifest.artwork.height}` }}>
      <img src={assetUrl(manifest.id, rig.body)} alt={manifest.artwork.alt} draggable={false} className="rig-layer" />
      {rig.tail && (
        <img
          src={assetUrl(manifest.id, rig.tail.image)}
          alt=""
          aria-hidden
          draggable={false}
          className={`rig-layer rig-tail ${asleep ? 'tail-still' : state === 'celebrate' || state === 'react' ? 'tail-happy' : 'tail-swish'}`}
          style={{
            transformOrigin: `${rig.tail.pivot.x * 100}% ${rig.tail.pivot.y * 100}%`,
            ['--smin' as string]: rig.tail.swish.scaleMin,
            ['--smax' as string]: rig.tail.swish.scaleMax,
            ['--deg' as string]: `${rig.tail.swish.deg}deg`,
          }}
        />
      )}
      {rig.eyes.map((e, k) => (
        <span
          key={k}
          aria-hidden
          data-testid="eyelid"
          className={`eyelid ${lidsClosed ? 'closed' : ''}`}
          style={{
            left: `${(e.cx - e.r) * 100}%`,
            top: `${e.cy * 100 - e.r * 100 * (manifest.artwork.width / manifest.artwork.height)}%`,
            width: `${e.r * 200}%`,
            aspectRatio: '1',
            background: e.lid,
          }}
        />
      ))}
    </div>
  );
}

export function CompanionSprite({ manifest, state }: { manifest: CompanionManifest; state: CompanionState }) {
  const def = manifest.animations[state] ?? manifest.animations.idle!;
  const motion = def.kind === 'still' ? def.motion : 'float-breathe';
  const dur = def.kind === 'still' && def.durationMs ? `${def.durationMs}ms` : undefined;
  return (
    <div className={`relative mp-${manifest.motionProfile}`} style={{ width: manifest.display.width, height: manifest.display.height }} data-companion={manifest.id}>
      <div className={`companion-shadow shadow-${motion}`} aria-hidden />
      {/* key restarts one-shot animations each time the state is entered */}
      <div key={state} className={`companion-motion motion-${motion}`} style={dur ? { animationDuration: dur } : undefined}>
        <div className="companion-breathe">
          {manifest.rig.kind === 'raster-layered' ? (
            <RasterRig manifest={manifest} state={state} />
          ) : def.kind === 'still' ? (
            <img src={assetUrl(manifest.id, def.image)} alt={manifest.artwork.alt} draggable={false} className="companion-art" />
          ) : (
            <Frames def={def} companionId={manifest.id} alt={manifest.artwork.alt} />
          )}
        </div>
      </div>
      {def.overlay && <Overlay kind={def.overlay} />}
    </div>
  );
}
