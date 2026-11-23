/** The ZOVEX mark, inline so it is crisp at any size and needs no asset. */
export function Logo({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" className={className} aria-hidden focusable="false">
      <defs>
        <linearGradient id="zovex-mark" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="#FF5A68" />
          <stop offset="0.45" stopColor="var(--accent, #F01228)" />
          <stop offset="1" stopColor="#A3000F" />
        </linearGradient>
      </defs>
      <path d="M268 292 H760 V382 L430 638 H760 V732 H264 V642 L594 386 H268 Z" fill="url(#zovex-mark)" />
    </svg>
  );
}
