import { getTranslations } from "next-intl/server";
import LegalShell, { LegalSection } from "@/components/legal/LegalShell";

export const metadata = {
  title: "Politique de confidentialité | Armies & Magic",
  robots: { index: false, follow: false },
};

// ⚠️ SQUELETTE — le contenu juridique n'est PAS rédigé. Même réserve que
// /legal/cgu : les titres balisent ce qu'un texte RGPD doit couvrir, la
// rédaction te revient.
//
// Éléments FACTUELS du projet à reprendre dans §2, §4 et §5 — ils sont
// vérifiables dans le code, contrairement au reste :
//   • données de compte : email + mot de passe haché (Supabase Auth), pseudo
//     public (public.profiles) ;
//   • connexion possible via Google et Discord (OAuth) — le provider transmet
//     l'identité, cf. handleOAuth dans components/auth/LoginForm.tsx ;
//   • données de jeu : decks, collection, portefeuille et historique de
//     transactions (wallet_transactions), enchères, parties ;
//   • sous-traitants : Supabase (hébergement + base + stockage, région à
//     préciser) et Netlify (hébergement applicatif) ;
//   • le pseudo est visible des autres joueurs (enchères, collections) — une
//     politique honnête doit le dire explicitement.
export default async function ConfidentialitePage() {
  const t = await getTranslations("legal");
  const sections = [
    t("privacy_s1"), t("privacy_s2"), t("privacy_s3"), t("privacy_s4"),
    t("privacy_s5"), t("privacy_s6"), t("privacy_s7"), t("privacy_s8"),
    t("privacy_s9"),
  ];

  return (
    <LegalShell
      title={t("privacy_title")}
      updatedLabel={t("updated", { date: "—" })}
      backLabel={t("back_to_site")}
    >
      <div
        className="mb-8 p-3 rounded-[var(--am-r-md)] text-sm"
        style={{
          background: "rgba(224,83,60,0.14)",
          border: "1px solid rgba(224,83,60,0.4)",
          color: "var(--am-ember)",
        }}
      >
        {t("draft_warning")}
      </div>

      {sections.map((title, i) => (
        <LegalSection key={title} n={i + 1} title={title} todo={t("todo")} />
      ))}
    </LegalShell>
  );
}
