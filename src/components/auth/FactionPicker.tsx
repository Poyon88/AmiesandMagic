"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import AuthShell from "@/components/auth/AuthShell";
import { FACTIONS, getFactionDisplayName } from "@/lib/card-engine/constants";
import { STARTER_FACTION_IDS } from "@/lib/auth/starterFaction";

/** Codes renvoyés par POST /api/profile/faction. Liste close : un code inconnu
 *  retombe sur le message générique plutôt que d'afficher une clé i18n brute. */
const ERROR_KEYS = new Set(["invalid_faction", "already_chosen"]);

export default function FactionPicker() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError("");
    if (!selected) {
      setError(t("faction_required"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/profile/faction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ faction: selected }),
      });
      if (!res.ok) {
        const { error: code } = (await res.json().catch(() => ({}))) as { error?: string };
        // « Déjà choisie » n'est pas un échec pour le joueur : sa faction est
        // enregistrée, on le laisse entrer plutôt que de le bloquer sur un
        // message qu'il ne peut pas résoudre.
        if (code === "already_chosen") {
          router.push("/");
          router.refresh();
          return;
        }
        setError(code && ERROR_KEYS.has(code) ? t(`faction_${code}`) : t("generic_error"));
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError(t("generic_error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell heading={t("faction_title")} sub={t("faction_sub")}>
      {error && (
        <div
          className="mb-4 p-3 rounded-[var(--am-r-md)] text-sm"
          style={{
            background: "rgba(224,83,60,0.14)",
            border: "1px solid rgba(224,83,60,0.4)",
            color: "var(--am-ember)",
          }}
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5">
        {STARTER_FACTION_IDS.map((id) => {
          const faction = FACTIONS[id];
          const active = selected === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setSelected(id)}
              aria-pressed={active}
              className="flex items-center gap-2.5 p-3 rounded-[var(--am-r-md)] text-left transition-all"
              style={{
                background: active ? `${faction.accent}1f` : "var(--am-bg-1)",
                border: `1px solid ${active ? faction.accent : "var(--am-line-strong)"}`,
                boxShadow: active ? `0 4px 18px ${faction.accent}33` : "none",
              }}
            >
              <span className="text-xl shrink-0" aria-hidden>{faction.emoji}</span>
              <span className="min-w-0">
                <span
                  className="block text-sm font-bold font-[family-name:var(--font-cinzel),serif] truncate"
                  style={{ color: active ? faction.accent : "var(--am-ink)" }}
                >
                  {getFactionDisplayName(id)}
                </span>
                <span className="block text-xs text-am-ink-faint truncate font-[family-name:var(--font-crimson),serif]">
                  {id}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <p className="mb-4 text-xs text-am-ember font-[family-name:var(--font-crimson),serif]">
        {t("faction_warning")}
      </p>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading || !selected}
        className="am-btn am-btn-gold am-btn-sheen w-full py-3 text-base disabled:opacity-50"
      >
        {loading ? t("loading") : t("faction_submit")}
      </button>
    </AuthShell>
  );
}
