/** The locked icon family - gold "node / constellation" language. All marks use currentColor
 *  (parent sets text-gold), render in both themes, and carry an SVG <title>.
 *
 *    ConstellationCup - house mark (header + favicon, see app/icon.svg for the bolder small build)
 *    DataBall         - model / methodology
 *    TrendBall        - live / movement
 *    LaurelCup        - champion / prestige moments
 *    CrownMark        - hero decoration (crown sitting on the champion flag)
 */

// hex-guard-ok-file: brand / trophy marks are fixed real-world brand colors (like Flag.tsx), a token-incapable illustration context.

type MarkProps = { size?: number; className?: string; title?: string };

function svgProps(size: number, vb: string, title?: string) {
  return {
    width: size,
    height: size,
    viewBox: vb,
    role: "img" as const,
    "aria-hidden": title ? undefined : true,
  };
}

/** House mark: nodes + a star tracing a trophy cup. */
export function ConstellationCup({ size = 20, className, title = "Presaira" }: MarkProps) {
  return (
    <svg {...svgProps(size, "0 0 72 72", title)} className={className}>
      {title ? <title>{title}</title> : null}
      <g stroke="currentColor" strokeWidth={1.4} opacity={0.85} fill="none" strokeLinecap="round">
        <line x1="22" y1="16" x2="50" y2="16" />
        <line x1="22" y1="16" x2="32" y2="34" />
        <line x1="50" y1="16" x2="40" y2="34" />
        <line x1="32" y1="34" x2="40" y2="34" />
        <line x1="32" y1="34" x2="36" y2="43" />
        <line x1="40" y1="34" x2="36" y2="43" />
        <line x1="36" y1="43" x2="36" y2="48" />
        <line x1="28" y1="48" x2="44" y2="48" />
        <line x1="22" y1="16" x2="13" y2="22" />
        <line x1="13" y1="22" x2="14" y2="31" />
        <line x1="14" y1="31" x2="24" y2="31" />
        <line x1="50" y1="16" x2="59" y2="22" />
        <line x1="59" y1="22" x2="58" y2="31" />
        <line x1="58" y1="31" x2="48" y2="31" />
      </g>
      <g fill="currentColor">
        <circle cx="22" cy="16" r="2" /><circle cx="50" cy="16" r="2" />
        <circle cx="32" cy="34" r="1.8" /><circle cx="40" cy="34" r="1.8" />
        <circle cx="36" cy="43" r="1.8" /><circle cx="28" cy="48" r="2" /><circle cx="44" cy="48" r="2" />
        <circle cx="13" cy="22" r="1.6" /><circle cx="14" cy="31" r="1.6" /><circle cx="24" cy="31" r="1.6" />
        <circle cx="59" cy="22" r="1.6" /><circle cx="58" cy="31" r="1.6" /><circle cx="48" cy="31" r="1.6" />
      </g>
      <path
        d="M36 19 L37.4 22.4 L41 22.6 L38.2 24.9 L39.2 28.5 L36 26.4 L32.8 28.5 L33.8 24.9 L31 22.6 L34.6 22.4 Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Node sphere - the model / methodology mark. */
export function DataBall({ size = 20, className, title = "Model" }: MarkProps) {
  return (
    <svg {...svgProps(size, "0 0 72 72", title)} className={className}>
      {title ? <title>{title}</title> : null}
      <circle cx="36" cy="36" r="24" fill="none" stroke="currentColor" strokeWidth={2.4} />
      <ellipse cx="36" cy="36" rx="10" ry="24" fill="none" stroke="currentColor" strokeWidth={1} opacity={0.3} />
      <line x1="12" y1="36" x2="60" y2="36" stroke="currentColor" strokeWidth={1} opacity={0.3} />
      <g stroke="currentColor" strokeWidth={1.3} opacity={0.7}>
        <line x1="36" y1="24" x2="48" y2="32" /><line x1="36" y1="24" x2="24" y2="32" />
        <line x1="24" y1="32" x2="30" y2="46" /><line x1="48" y1="32" x2="42" y2="46" />
        <line x1="30" y1="46" x2="42" y2="46" /><line x1="24" y1="32" x2="48" y2="32" />
      </g>
      <g fill="currentColor">
        <circle cx="36" cy="24" r="2.3" /><circle cx="48" cy="32" r="2.3" /><circle cx="24" cy="32" r="2.3" />
        <circle cx="42" cy="46" r="2.3" /><circle cx="30" cy="46" r="2.3" />
      </g>
    </svg>
  );
}

/** Node sphere with a rising line - the live / movement mark. */
export function TrendBall({ size = 20, className, title = "Live odds" }: MarkProps) {
  return (
    <svg {...svgProps(size, "0 0 72 72", title)} className={className}>
      {title ? <title>{title}</title> : null}
      <defs>
        <clipPath id="trendball-clip">
          <circle cx="36" cy="36" r="23" />
        </clipPath>
      </defs>
      <circle cx="36" cy="36" r="24" fill="none" stroke="currentColor" strokeWidth={2.4} />
      <g clipPath="url(#trendball-clip)">
        <ellipse cx="36" cy="36" rx="10" ry="24" fill="none" stroke="currentColor" strokeWidth={1} opacity={0.28} />
        <line x1="12" y1="36" x2="60" y2="36" stroke="currentColor" strokeWidth={1} opacity={0.28} />
        <polyline
          points="16,44 24,38 31,42 39,30 47,33 52,23"
          fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"
        />
        <g fill="currentColor">
          <circle cx="24" cy="38" r="1.7" /><circle cx="31" cy="42" r="1.7" />
          <circle cx="39" cy="30" r="1.7" /><circle cx="47" cy="33" r="1.7" />
        </g>
      </g>
      <circle cx="52" cy="23" r="2.8" fill="currentColor" />
    </svg>
  );
}

/** Cup framed by laurel - champion / prestige. */
export function LaurelCup({ size = 20, className, title = "Champion" }: MarkProps) {
  return (
    <svg {...svgProps(size, "0 0 72 72", title)} className={className}>
      {title ? <title>{title}</title> : null}
      <path d="M28 22 H44 C44 30 40 35 36 35 C32 35 28 30 28 22 Z" fill="currentColor" />
      <path d="M28.5 23 C22 24 22 30 29 30" fill="none" stroke="currentColor" strokeWidth={2} />
      <path d="M43.5 23 C50 24 50 30 43 30" fill="none" stroke="currentColor" strokeWidth={2} />
      <rect x="34.5" y="35" width="3" height="5" fill="currentColor" />
      <rect x="31" y="40" width="10" height="3" rx="1" fill="currentColor" />
      <path d="M18 50 C12 42 12 28 21 21" fill="none" stroke="currentColor" strokeWidth={1.6} />
      <path d="M54 50 C60 42 60 28 51 21" fill="none" stroke="currentColor" strokeWidth={1.6} />
      <g fill="currentColor">
        <ellipse cx="14.5" cy="44" rx="2.8" ry="1.4" transform="rotate(-50 14.5 44)" />
        <ellipse cx="13.5" cy="37" rx="2.8" ry="1.4" transform="rotate(-65 13.5 37)" />
        <ellipse cx="15" cy="30" rx="2.8" ry="1.4" transform="rotate(-80 15 30)" />
        <ellipse cx="18" cy="24" rx="2.8" ry="1.4" transform="rotate(-100 18 24)" />
        <ellipse cx="57.5" cy="44" rx="2.8" ry="1.4" transform="rotate(50 57.5 44)" />
        <ellipse cx="58.5" cy="37" rx="2.8" ry="1.4" transform="rotate(65 58.5 37)" />
        <ellipse cx="57" cy="30" rx="2.8" ry="1.4" transform="rotate(80 57 30)" />
        <ellipse cx="54" cy="24" rx="2.8" ry="1.4" transform="rotate(100 54 24)" />
      </g>
    </svg>
  );
}

/** Crown sitting on the champion flag - hero decoration (not part of the four-icon family).
 *  Fixed colours on purpose (NOT currentColor): the gold fill + dark bronze OUTLINE relationship
 *  is what defines the shape against the gold wash, and reads in both themes. */
export function CrownMark({
  width = 44,
  className,
  title,
}: { width?: number; className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 60 34" width={width} height={(width * 34) / 60}
         className={className} role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <path d="M6 27 L11 11 L20 20 L30 7 L40 20 L49 11 L54 27 Z"
            fill="#E3A81E" stroke="#8A6A1F" strokeWidth={1.4} strokeLinejoin="round" />
      <rect x="7" y="26" width="46" height="6" rx="2" fill="#E3A81E" stroke="#8A6A1F" strokeWidth={1.1} />
      <circle cx="11" cy="11" r="2.1" fill="#FFF7E6" stroke="#8A6A1F" strokeWidth={0.6} />
      <circle cx="30" cy="7" r="2.4" fill="#FFF7E6" stroke="#8A6A1F" strokeWidth={0.6} />
      <circle cx="49" cy="11" r="2.1" fill="#FFF7E6" stroke="#8A6A1F" strokeWidth={0.6} />
    </svg>
  );
}
