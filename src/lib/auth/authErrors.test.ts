// Traduction des erreurs Supabase. Un joueur ne doit jamais voir « email rate
// limit exceeded » : c'est de l'anglais technique sur lequel il ne peut pas agir.
import { describe, expect, it } from "vitest";
import { authErrorKey } from "./authErrors";

describe("authErrorKey — par code (source privilégiée)", () => {
  it("reconnaît les codes documentés de supabase-js", () => {
    const cas: [string, string][] = [
      ["over_email_send_rate_limit", "email_rate_limit"],
      ["invalid_credentials", "invalid_credentials"],
      ["email_not_confirmed", "email_not_confirmed"],
      ["weak_password", "weak_password"],
      ["user_already_exists", "user_already_exists"],
      ["unexpected_failure", "database_error"],
      ["captcha_failed", "captcha_failed"],
    ];
    for (const [code, attendu] of cas) {
      expect(authErrorKey({ code, message: "peu importe" })).toBe(attendu);
    }
  });

  it("le code prime sur le message quand les deux sont présents", () => {
    expect(authErrorKey({ code: "weak_password", message: "rate limit" })).toBe("weak_password");
  });
});

describe("authErrorKey — repli par message", () => {
  it("reconnaît les libellés réellement observés", () => {
    const cas: [string, string][] = [
      ["email rate limit exceeded", "email_rate_limit"],
      ["Invalid login credentials", "invalid_credentials"],
      ["Email not confirmed", "email_not_confirmed"],
      ["Password should be at least 6 characters", "weak_password"],
      ["User already registered", "user_already_exists"],
      ["Database error saving new user", "database_error"],
      ["captcha protection: request disallowed (no captcha_token found)", "captcha_failed"],
    ];
    for (const [message, attendu] of cas) {
      expect(authErrorKey({ message })).toBe(attendu);
    }
  });
});

describe("authErrorKey — inconnu", () => {
  it("renvoie null plutôt que d'inventer une explication", () => {
    for (const ko of [null, undefined, "chaîne", 42, {}, { message: "quelque chose d'inédit" }]) {
      expect(authErrorKey(ko)).toBeNull();
    }
  });
});
