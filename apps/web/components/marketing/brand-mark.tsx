/**
 * TagWorks mark: a white tag on a blue rounded square.
 * The same artwork lives in public/brand/ (SVG and PNG) and app/icon.svg.
 * Regenerate every size with scripts/brand/generate-logo.py.
 */
export function BrandMark({ className = "brand-mark" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="15" fill="#2563eb" />
      <g transform="translate(32 32) scale(1.22) translate(-33.4 -32)">
        <path
          d="M17 22.5a3 3 0 0 1 3-3h17.6a3 3 0 0 1 2.2.95l9.4 10.1a2 2 0 0 1 0 2.7l-9.4 10.1a3 3 0 0 1-2.2.95H20a3 3 0 0 1-3-3Z"
          fill="#ffffff"
        />
        <circle cx="25.5" cy="32" r="3.6" fill="#2563eb" />
      </g>
    </svg>
  );
}
