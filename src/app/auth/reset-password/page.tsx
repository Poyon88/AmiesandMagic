"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AuthShell, { authFieldClass, authLabelClass } from "@/components/auth/AuthShell";

// Lands here after the user clicks the recovery link in their email and
// /auth/callback exchanges the recovery code for a session. The user is
// already authenticated at this point — we just collect a new password
// and call updateUser. On success they're redirected to /.
export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setHasSession(!!data.session);
    });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    if (password.length < 8) {
      setError("Le mot de passe doit faire au moins 8 caractères.");
      return;
    }
    if (password !== confirm) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setLoading(true);
    try {
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) throw updateErr;
      setInfo("Mot de passe mis à jour. Redirection...");
      setTimeout(() => {
        router.push("/");
        router.refresh();
      }, 800);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur inconnue.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      heading="Réinitialiser le mot de passe"
      sub="Choisissez un nouveau mot de passe pour votre compte."
      footer={
        <button
          onClick={() => router.push("/login")}
          className="w-full py-2 text-sm text-am-ink-faint hover:text-am-gold transition-colors"
        >
          ← Retour à la connexion
        </button>
      }
    >
      {hasSession === false && (
        <div
          className="mb-4 p-3 rounded-[var(--am-r-md)] text-sm"
          style={{
            background: "rgba(224,83,60,0.14)",
            border: "1px solid rgba(224,83,60,0.4)",
            color: "var(--am-ember)",
          }}
        >
          Lien de réinitialisation expiré ou invalide. Repartez de la page de
          connexion et redemandez un email.
        </div>
      )}
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
      {info && (
        <div
          className="mb-4 p-3 rounded-[var(--am-r-md)] text-sm"
          style={{
            background: "rgba(54,201,138,0.12)",
            border: "1px solid rgba(54,201,138,0.4)",
            color: "var(--am-jade)",
          }}
        >
          {info}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={authLabelClass}>Nouveau mot de passe</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            disabled={hasSession === false}
            className={authFieldClass}
            placeholder="Min 8 caractères"
          />
        </div>
        <div>
          <label className={authLabelClass}>Confirmer</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            disabled={hasSession === false}
            className={authFieldClass}
            placeholder="Retapez le mot de passe"
          />
        </div>
        <button
          type="submit"
          disabled={loading || hasSession === false}
          className="am-btn am-btn-gold am-btn-sheen w-full py-3 text-base disabled:opacity-50"
        >
          {loading ? "Mise à jour..." : "Mettre à jour"}
        </button>
      </form>
    </AuthShell>
  );
}
