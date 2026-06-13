"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "gold" | "arcane" | "ghost";
type Size = "sm" | "md" | "lg";

const SIZE: Record<Size, string> = {
  sm: "px-4 py-2 text-xs md:text-sm",
  md: "px-6 py-3 text-sm md:text-base",
  lg: "px-9 py-4 text-base md:text-lg",
};

const VARIANT: Record<Variant, string> = {
  gold: "am-btn am-btn-gold am-btn-sheen",
  arcane: "am-btn am-btn-arcane am-btn-sheen",
  ghost: "am-btn am-btn-ghost",
};

function cls(variant: Variant, size: Size, extra?: string) {
  return `${VARIANT[variant]} ${SIZE[size]} ${extra ?? ""}`.trim();
}

/** Gilded button. Renders an <a> (Next Link) when `href` is set, else a
 *  <button>. Variants: gold (primary), arcane (energy), ghost (outline). */
export function AmButton({
  variant = "gold",
  size = "md",
  className,
  children,
  ...rest
}: {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
} & ComponentProps<"button">) {
  return (
    <button className={cls(variant, size, className)} {...rest}>
      {children}
    </button>
  );
}

export function AmLinkButton({
  variant = "gold",
  size = "md",
  className,
  children,
  href,
  ...rest
}: {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
  href: string;
} & Omit<ComponentProps<typeof Link>, "href" | "className">) {
  return (
    <Link href={href} className={cls(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}
