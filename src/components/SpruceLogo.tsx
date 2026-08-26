/**
 * Spruce logomark: "Bough" — two open chevrons under a solid amber crown.
 * The crown is the only amber in the mark; never tint the boughs. Below
 * ~24px the two boughs visually merge, so a separate small-glyph variant
 * (single bough, thicker stroke) is used instead of scaling the master.
 *
 * `textClassName` drives the bough stroke color via `currentColor` — the
 * source design system has no dark-mode variants, so our own dark-mode
 * legibility choice (a lighter emerald) lives here rather than in the spec.
 */
interface Props {
  className?: string;
  textClassName?: string;
  /** 'reversed' keeps the amber crown but swaps boughs to linen, for use on brand-primary/dark backgrounds. 'small' is the single-bough glyph for sub-24px usage. */
  variant?: 'default' | 'reversed' | 'small';
}

export default function SpruceLogo({
  className = 'h-8 w-8 shrink-0',
  textClassName = 'text-brand-primary dark:text-emerald-400',
  variant = 'default',
}: Props) {
  if (variant === 'small') {
    return (
      <svg viewBox="0 0 48 48" className={`${className} ${textClassName}`} fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M24 5 33 19H15Z" fill="var(--color-brand-accent)" stroke="var(--color-brand-accent)" strokeWidth="2.4" />
        <path d="M11 41 24 26l13 15" stroke="currentColor" strokeWidth="5" />
      </svg>
    );
  }

  const boughStroke = variant === 'reversed' ? 'var(--color-brand-background)' : 'currentColor';

  return (
    <svg viewBox="0 0 48 48" className={`${className} ${textClassName}`} fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" aria-label="Spruce">
      <path d="M24 9 33 21H15Z" fill="var(--color-brand-accent)" stroke="var(--color-brand-accent)" strokeWidth="3" />
      <path d="M13 29 24 16l11 13" stroke={boughStroke} strokeWidth="3.6" />
      <path d="M10 38 24 23l14 15" stroke={boughStroke} strokeWidth="3.6" />
    </svg>
  );
}
