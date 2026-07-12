"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import AuthShell, { authFieldClass, authLabelClass } from "@/components/auth/AuthShell";

// Lands here after the user clicks the recovery link in their email and
// /auth/callback exchanges the recovery code for a session. The user is
// already authenticated at this point — we just collect a new password
// and call updateUser. On success they're redirected to /.
export default function ResetPasswordPage() {
  const t = useTranslations("auth");
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
      setError(t("password_min_length"));
      return;
    }
    if (password !== confirm) {
      setError(t("passwords_mismatch"));
      return;
    }
    setLoading(true);
    try {
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) throw updateErr;
      setInfo(t("password_updated_redirect"));
      setTimeout(() => {
        router.push("/");
        router.refresh();
      }, 800);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("unknown_error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      heading={t("reset_heading")}
      sub={t("reset_sub")}
      footer={
        <button
          onClick={() => router.push("/login")}
          className="w-full py-2 text-sm text-am-ink-faint hover:text-am-gold transition-colors"
        >
          {t("back_to_login")}
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
          {t("reset_link_invalid")}
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
          <label className={authLabelClass}>{t("new_password_label")}</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            disabled={hasSession === false}
            className={authFieldClass}
            placeholder={t("password_min_placeholder")}
          />
        </div>
        <div>
          <label className={authLabelClass}>{t("confirm_label")}</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            disabled={hasSession === false}
            className={authFieldClass}
            placeholder={t("confirm_placeholder")}
          />
        </div>
        <button
          type="submit"
          disabled={loading || hasSession === false}
          className="am-btn am-btn-gold am-btn-sheen w-full py-3 text-base disabled:opacity-50"
        >
          {loading ? t("updating") : t("update")}
        </button>
      </form>
    </AuthShell>
  );
}
