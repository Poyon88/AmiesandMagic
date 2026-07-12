"use client";

import { useLegacyLocaleMigration } from "@/i18n/useLocale";

// Monté une seule fois près de la racine : migre l'ancien choix de langue
// stocké en localStorage (`am-landing-locale`) vers le cookie `am-locale`.
// Ne rend rien.
export default function LocaleMigration() {
  useLegacyLocaleMigration();
  return null;
}
