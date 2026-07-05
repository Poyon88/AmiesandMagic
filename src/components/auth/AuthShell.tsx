import Image from "next/image";
import Link from "next/link";

// Shared visual chrome for the out-of-game auth pages (/login,
// /auth/reset-password). Provides the battlefield backdrop, the frosted
// gilded panel and the brand lockup so both pages read as the same product
// as the landing. Pages supply only their form via `children`.
//
// The panel entrance uses `.am-animate-rise`, which globals.css already
// disables under `prefers-reduced-motion` — no JS motion needed here.

// Reusable field styling so /login and /auth/reset-password share one look.
export const authFieldClass =
  "w-full px-4 py-3 text-base rounded-[var(--am-r-md)] bg-am-bg-1 text-am-ink " +
  "placeholder:text-am-ink-faint border border-[color:var(--am-line-strong)] " +
  "focus:border-[color:var(--am-gold)] focus:outline-none transition-colors " +
  "disabled:opacity-50";

export const authLabelClass =
  "block text-sm font-medium text-am-ink-soft mb-1.5 " +
  "font-[family-name:var(--font-crimson),serif]";

function ShieldMark() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#1a1408"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6z" />
    </svg>
  );
}

interface AuthShellProps {
  /** Page-specific gilded heading (brand lockup shows above it regardless). */
  heading?: string;
  /** Supporting line under the heading. */
  sub?: string;
  children: React.ReactNode;
  /** Optional content pinned below the form (e.g. a back link). */
  footer?: React.ReactNode;
}

export default function AuthShell({ heading, sub, children, footer }: AuthShellProps) {
  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden px-4 py-10 bg-am-bg-0">
      {/* Battlefield backdrop — static (no ambient motion) to keep auth fast */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/images/battlefield.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(8,7,15,0.72) 0%, rgba(8,7,15,0.86) 55%, #08070f 100%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 60% at 50% 40%, rgba(216,178,90,0.10) 0%, transparent 62%)",
          }}
        />
      </div>

      {/* Frosted gilded panel */}
      <div className="relative z-[2] w-full max-w-md am-glass am-gild-border am-animate-rise p-8 md:p-9 rounded-[var(--am-r-lg)]">
        {/* Brand lockup → back to the public landing */}
        <Link
          href="/landing"
          className="flex items-center justify-center gap-2.5 mb-6 transition-opacity hover:opacity-90"
        >
          <span
            className="grid place-items-center w-9 h-9 rounded-lg shrink-0"
            style={{
              background: "linear-gradient(135deg, #f4e09a, #d8b25a 50%, #9a7730)",
              boxShadow:
                "0 4px 14px rgba(216,178,90,0.35), inset 0 1px 0 rgba(255,255,255,0.4)",
            }}
            aria-hidden="true"
          >
            <ShieldMark />
          </span>
          <span className="am-foil-text font-[family-name:var(--font-cinzel),serif] text-xl font-bold tracking-wider">
            Armies &amp; Magic
          </span>
        </Link>

        {heading && (
          <h1 className="am-foil-text font-[family-name:var(--font-cinzel),serif] text-2xl md:text-[26px] font-bold text-center tracking-wide leading-tight">
            {heading}
          </h1>
        )}
        {sub && (
          <p className="text-center text-am-ink-soft text-sm mt-2 font-[family-name:var(--font-crimson),serif]">
            {sub}
          </p>
        )}

        <div className="am-rule-diamond my-6" />

        {children}

        {footer && <div className="mt-6">{footer}</div>}
      </div>
    </div>
  );
}
