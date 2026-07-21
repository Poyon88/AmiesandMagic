// Traduction des erreurs d'authentification Supabase en messages utilisables.
//
// Les erreurs remontées par supabase-js sont en anglais et rédigées pour un
// développeur : « email rate limit exceeded », « Invalid login credentials ».
// Les afficher telles quelles — ce que faisait le formulaire — laisse le joueur
// devant un message qu'il ne comprend pas et sur lequel il ne peut pas agir.
//
// On s'appuie d'abord sur `code`, stable et documenté depuis supabase-js v2.
// Le repli par motif textuel couvre les versions plus anciennes et les erreurs
// qui n'en portent pas ; il est volontairement ancré sur des fragments courts et
// peu susceptibles de changer.

/** Suffixe de clé i18n dans le namespace `auth`, sous la forme `error_<clé>`. */
export type AuthErrorKey =
  | "email_rate_limit"
  | "invalid_credentials"
  | "email_not_confirmed"
  | "weak_password"
  | "user_already_exists"
  | "signups_disabled"
  | "database_error";

const BY_CODE: Record<string, AuthErrorKey> = {
  over_email_send_rate_limit: "email_rate_limit",
  over_request_rate_limit: "email_rate_limit",
  invalid_credentials: "invalid_credentials",
  email_not_confirmed: "email_not_confirmed",
  weak_password: "weak_password",
  user_already_exists: "user_already_exists",
  email_exists: "user_already_exists",
  signup_disabled: "signups_disabled",
  unexpected_failure: "database_error",
};

const BY_MESSAGE: [RegExp, AuthErrorKey][] = [
  [/rate limit/i, "email_rate_limit"],
  [/invalid login credentials/i, "invalid_credentials"],
  [/email not confirmed/i, "email_not_confirmed"],
  [/password should be/i, "weak_password"],
  [/already registered|already exists/i, "user_already_exists"],
  [/signups? not allowed|signups? disabled/i, "signups_disabled"],
  // « Database error saving new user » : le trigger a échoué. Rien que le joueur
  // puisse corriger — le message doit l'orienter vers le support, pas le laisser
  // retenter indéfiniment.
  [/database error/i, "database_error"],
];

/** Clé i18n correspondant à une erreur d'authentification, ou `null` si elle
 *  n'est pas reconnue — l'appelant retombe alors sur un message générique
 *  plutôt que d'inventer une explication. */
export function authErrorKey(err: unknown): AuthErrorKey | null {
  if (!err || typeof err !== "object") return null;

  const code = (err as { code?: unknown }).code;
  if (typeof code === "string" && BY_CODE[code]) return BY_CODE[code];

  const message = (err as { message?: unknown }).message;
  if (typeof message !== "string") return null;
  for (const [pattern, key] of BY_MESSAGE) {
    if (pattern.test(message)) return key;
  }
  return null;
}
