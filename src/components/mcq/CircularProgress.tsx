import { motion } from "motion/react";

type Props = {
  value: number; // 0-100
  size?: number;
  stroke?: number;
  gradientFrom?: string;
  gradientTo?: string;
  trackClassName?: string;
  children?: React.ReactNode;
  ariaLabel?: string;
};

let idCounter = 0;

/** Premium animated circular progress ring. Uses SVG stroke-dashoffset so the
 *  animation is silky on any card size. */
export function CircularProgress({
  value,
  size = 72,
  stroke = 7,
  gradientFrom = "#6366f1",
  gradientTo = "#d946ef",
  trackClassName = "stroke-muted/60",
  children,
  ariaLabel,
}: Props) {
  const clamped = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;
  const gradientId = `cp-grad-${++idCounter}`;
  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel ?? `Progress ${clamped}%`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={gradientFrom} />
            <stop offset="100%" stopColor={gradientTo} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
          className={trackClassName}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}
