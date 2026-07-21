"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import AuthShell, { authFieldClass, authLabelClass } from "@/components/auth/AuthShell";
import { USERNAME_MAX, normalizeUsername, validateUsername } from "@/lib/auth/username";

/** Codes renvoyés par POST /api/profile/username, traduits ici. Liste close :
 *  un code inattendu retombe sur le message générique plutôt que d'afficher
 *  une clé i18n brute au joueur. */
const ERROR_KEYS = new Set([
  "too_short", "too_long", "invalid_chars", "reserved", "taken",
]);

export default function UsernameForm({ initialValue }: { initialValue: string }) {
  const t = useTranslations("auth");
  const router = useRouter();
  // Vide plutôt que pré-rempli avec le pseudo généré : on demande un choix, pas
  // une validation passive d'un `Player_3f2a9c1d` que personne n'a voulu.
  const [username, setUsername] = useState(initialValue);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const value = normalizeUsername(username);
    // Même règle que le serveur (module partagé) : retour immédiat, sans
    // aller-retour réseau. Le serveur revalide de toute façon.
    const invalid = validateUsername(value);
    if (invalid) {
      setError(t(`username_${invalid}`));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/profile/username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: value }),
      });
      if (!res.ok) {
        const { error: code } = (await res.json().catch(() => ({}))) as { error?: string };
        setError(code && ERROR_KEYS.has(code) ? t(`username_${code}`) : t("generic_error"));
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
    <AuthShell heading={t("onboarding_title")} sub={t("onboarding_sub")}>
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
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={authLabelClass}>{t("username_label")}</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            required
            maxLength={USERNAME_MAX}
            className={authFieldClass}
            placeholder={t("username_placeholder")}
          />
          <p className="mt-1.5 text-xs text-am-ink-faint font-[family-name:var(--font-crimson),serif]">
            {t("username_rules")}
          </p>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="am-btn am-btn-gold am-btn-sheen w-full py-3 text-base disabled:opacity-50"
        >
          {loading ? t("loading") : t("onboarding_submit")}
        </button>
      </form>
    </AuthShell>
  );
}
