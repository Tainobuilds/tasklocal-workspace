/**
 * Spruce logomark: two minimal interlocking triangles, one up and one down.
 *
 * The primary triangle uses `currentColor` driven by `textClassName` (default
 * dark forest green, a lighter emerald in dark contexts) rather than a fixed
 * CSS variable — some pages that use this logo (SiteHeader) render on a
 * permanently dark background, where the near-black default primary color
 * would be nearly invisible.
 */
export default function SpruceLogo({
  className = 'h-8 w-8 shrink-0',
  textClassName = 'text-brand-primary dark:text-emerald-400',
}: {
  className?: string;
  textClassName?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" className={`${className} ${textClassName}`} aria-hidden="true">
      <polygon
        points="12,3 21,19 3,19"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <polygon
        points="12,21 21,5 3,5"
        fill="none"
        stroke="var(--color-brand-accent)"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}
