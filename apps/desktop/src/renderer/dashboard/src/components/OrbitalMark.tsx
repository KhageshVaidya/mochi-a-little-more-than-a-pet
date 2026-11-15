/** ORBITAL wordmark glyph: a planet with an inclined orbit and a single satellite. Original artwork. */
export function OrbitalMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="5" fill="var(--o-accent)" />
      <ellipse cx="12" cy="12" rx="10.5" ry="4.2" transform="rotate(-24 12 12)" stroke="var(--o-teal)" strokeWidth="1.4" />
      <circle cx="20.6" cy="8.2" r="1.7" fill="var(--o-teal)" />
    </svg>
  );
}
