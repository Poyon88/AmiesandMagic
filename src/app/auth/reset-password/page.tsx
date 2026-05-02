"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md p-8 bg-secondary rounded-xl border border-card-border shadow-2xl">
        <h1 className="text-2xl font-bold text-center text-primary mb-2">
          Réinitialiser le mot de passe
        </h1>
        <p className="text-center text-foreground/60 mb-6 text-sm">
          Choisissez un nouveau mot de passe pour votre compte.
        </p>

        {hasSession === false && (
          <div className="mb-4 p-3 bg-accent/20 border border-accent/40 rounded-lg text-accent text-sm">
            Lien de réinitialisation expiré ou invalide. Repartez de la page de
            connexion et redemandez un email.
          </div>
        )}
        {error && (
          <div className="mb-4 p-3 bg-accent/20 border border-accent/40 rounded-lg text-accent text-sm">
            {error}
          </div>
        )}
        {info && (
          <div className="mb-4 p-3 bg-success/15 border border-success/40 rounded-lg text-success text-sm">
            {info}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              Nouveau mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              disabled={hasSession === false}
              className="w-full px-4 py-2.5 bg-background border border-card-border rounded-lg text-foreground focus:outline-none focus:border-primary transition-colors disabled:opacity-50"
              placeholder="Min 8 caractères"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              Confirmer
            </label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
              disabled={hasSession === false}
              className="w-full px-4 py-2.5 bg-background border border-card-border rounded-lg text-foreground focus:outline-none focus:border-primary transition-colors disabled:opacity-50"
              placeholder="Retapez le mot de passe"
            />
          </div>
          <button
            type="submit"
            disabled={loading || hasSession === false}
            className="w-full py-3 bg-primary hover:bg-primary-dark text-background font-bold rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? "Mise à jour..." : "Mettre à jour"}
          </button>
        </form>

        <button
          onClick={() => router.push("/login")}
          className="mt-4 w-full py-2 text-sm text-foreground/60 hover:text-foreground transition-colors"
        >
          Retour à la connexion
        </button>
      </div>
    </div>
  );
}
