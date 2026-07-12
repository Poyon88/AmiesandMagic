"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import AuthShell, { authFieldClass, authLabelClass } from "@/components/auth/AuthShell";

export default function LoginPage() {
  const t = useTranslations("auth");
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleForgotPassword() {
    setError("");
    setInfo("");
    if (!email) {
      setError(t("forgot_email_required"));
      return;
    }
    setForgotLoading(true);
    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`,
      });
      if (resetErr) throw resetErr;
      setInfo(t("forgot_email_sent", { email }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("forgot_send_error"));
    } finally {
      setForgotLoading(false);
    }
  }

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isRegister) {
        if (password.length < 8) {
          setError(t("password_min_length"));
          setLoading(false);
          return;
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username: username || `Player_${Date.now().toString(36)}` },
          },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
      router.push("/");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("generic_error"));
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(provider: "google" | "discord") {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) setError(error.message);
  }

  return (
    <AuthShell
      sub={t("tagline")}
      footer={
        <Link
          href="/landing"
          className="block text-center text-xs text-am-ink-faint hover:text-am-gold transition-colors"
        >
          {t("back_to_site")}
        </Link>
      }
    >
      {/* Toggle Login/Register */}
      <div
        className="grid grid-cols-2 gap-1 p-1 mb-6 rounded-[var(--am-r-md)]"
        style={{ background: "var(--am-bg-1)", border: "1px solid var(--am-line-strong)" }}
      >
        {[
          { register: false, label: t("login") },
          { register: true, label: t("register") },
        ].map(({ register, label }) => {
          const active = isRegister === register;
          return (
            <button
              key={label}
              onClick={() => {
                setIsRegister(register);
                setError("");
              }}
              className={`py-2.5 rounded-[10px] text-sm font-bold tracking-wide font-[family-name:var(--font-cinzel),serif] transition-all ${
                active ? "" : "text-am-ink-soft hover:text-am-ink"
              }`}
              style={
                active
                  ? {
                      background: "linear-gradient(135deg, #f4e09a, #d8b25a 45%, #a87f30)",
                      color: "var(--am-gold-ink)",
                      boxShadow: "0 4px 14px rgba(216,178,90,0.3)",
                    }
                  : undefined
              }
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Error / info messages */}
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

      {/* Email/Password form */}
      <form onSubmit={handleEmailAuth} className="space-y-4">
        {isRegister && (
          <div>
            <label className={authLabelClass}>{t("username_label")}</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={authFieldClass}
              placeholder={t("username_placeholder")}
            />
          </div>
        )}
        <div>
          <label className={authLabelClass}>{t("email_label")}</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={authFieldClass}
            placeholder={t("email_placeholder")}
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className={authLabelClass + " mb-0"}>{t("password_label")}</label>
            {!isRegister && (
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={forgotLoading}
                className="text-sm text-am-gold hover:underline disabled:opacity-50 py-1 px-2 -mr-2 font-[family-name:var(--font-crimson),serif]"
              >
                {forgotLoading ? t("sending") : t("forgot_password")}
              </button>
            )}
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className={authFieldClass}
            placeholder={isRegister ? t("password_min_placeholder") : t("password_placeholder_login")}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="am-btn am-btn-gold am-btn-sheen w-full py-3 text-base disabled:opacity-50"
        >
          {loading ? t("loading") : isRegister ? t("create_account") : t("sign_in")}
        </button>
      </form>

      {/* Divider */}
      <div className="flex items-center my-6">
        <div className="flex-1 h-px" style={{ background: "var(--am-line-strong)" }} />
        <span className="px-3 text-xs uppercase tracking-widest text-am-ink-faint">{t("or")}</span>
        <div className="flex-1 h-px" style={{ background: "var(--am-line-strong)" }} />
      </div>

      {/* OAuth buttons */}
      <div className="space-y-3">
        <button
          onClick={() => handleOAuth("google")}
          className="am-btn am-btn-ghost w-full py-3 text-sm flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          {t("continue_google")}
        </button>
        <button
          onClick={() => handleOAuth("discord")}
          className="am-btn am-btn-sheen w-full py-3 text-sm flex items-center justify-center gap-2 text-white hover:brightness-105"
          style={{ background: "#5865F2", boxShadow: "0 6px 24px rgba(88,101,242,0.3)" }}
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
          </svg>
          {t("continue_discord")}
        </button>
      </div>
    </AuthShell>
  );
}
