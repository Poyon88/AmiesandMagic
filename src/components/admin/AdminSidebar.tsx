"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const menuItems = [
  { label: "Card Forge", href: "/admin/card-forge", icon: "\u2694\uFE0F" },
  { label: "Plateaux", href: "/admin/boards", icon: "\uD83D\uDDFA\uFE0F" },
  { label: "Collections", href: "/admin/collections", icon: "\uD83D\uDCE6" },
  { label: "Formats", href: "/admin/formats", icon: "\uD83D\uDCCB" },
  { label: "Import", href: "/admin/import", icon: "\uD83D\uDCE5" },
  { label: "\u00C9conomie", href: "/admin/economy", icon: "\uD83D\uDCB0" },
  { label: "Musiques", href: "/admin/music", icon: "\uD83C\uDFB5" },
  { label: "Bruitages", href: "/admin/sfx", icon: "\uD83D\uDD0A" },
  { label: "Enchères", href: "/admin/auctions", icon: "\uD83D\uDD28" },
  { label: "Showcase", href: "/admin/showcase", icon: "\uD83C\uDFAD" },
  { label: "Icônes", href: "/admin/keyword-icons", icon: "\uD83C\uDFA8" },
  { label: "Joueurs", href: "/admin/players", icon: "\uD83D\uDC65" },
];

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside
      style={{
        width: 220,
        minWidth: 220,
        background: "#1a1a2e",
        borderRight: "1px solid #3d3d5c",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "auto",
      }}
    >
      <Link
        href="/admin"
        style={{
          padding: "16px 20px",
          fontSize: 18,
          fontWeight: 700,
          color: "#c8a84e",
          textDecoration: "none",
          borderBottom: "1px solid #3d3d5c",
          fontFamily: "var(--font-cinzel), serif",
        }}
      >
        Admin
      </Link>
      <nav style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 0" }}>
        {menuItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 20px",
                color: isActive ? "#c8a84e" : "#e0e0e0",
                background: isActive ? "#2a2a45" : "transparent",
                textDecoration: "none",
                fontSize: 14,
                fontWeight: isActive ? 600 : 400,
                borderLeft: isActive ? "3px solid #c8a84e" : "3px solid transparent",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = "#2a2a45";
                  e.currentTarget.style.color = "#c8a84e";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "#e0e0e0";
                }
              }}
            >
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
