import { getTranslations } from "next-intl/server";
import LegalShell, { LegalSection } from "@/components/legal/LegalShell";

export const metadata = {
  title: "Conditions Générales d'Utilisation | Armies & Magic",
  // Tant que le texte n'est pas rédigé, la page ne doit pas être indexée :
  // une CGU vide référencée est pire que pas de CGU du tout.
  robots: { index: false, follow: false },
};

// ⚠️ SQUELETTE — le contenu juridique n'est PAS rédigé.
//
// Les titres ci-dessous couvrent ce qu'une CGU de jeu en ligne avec économie
// virtuelle doit traiter, mais chaque section reste à écrire par toi ou un
// juriste. Un texte plausible généré automatiquement serait plus dangereux
// qu'une page vide : il donnerait l'illusion d'un engagement opposable là où
// il n'y en a aucun, et pourrait t'engager sur des clauses que tu n'as pas
// choisies.
//
// Points spécifiques à ce projet qui MÉRITENT une attention particulière :
//   • §4 — l'or et les cartes sont une monnaie de jeu sans valeur monétaire.
//     La revente entre joueurs est aujourd'hui DÉSACTIVÉE par le drapeau
//     NEXT_PUBLIC_MARKETPLACE_SELLING_ENABLED, précisément pour des raisons de
//     conformité (cf. mémoire projet). La rédaction doit refléter l'état réel.
//   • §3 — l'âge minimum conditionne le reste (RGPD : 15 ans en France pour le
//     consentement seul).
export default async function CguPage() {
  const t = await getTranslations("legal");
  const sections = [
    t("cgu_s1"), t("cgu_s2"), t("cgu_s3"), t("cgu_s4"), t("cgu_s5"),
    t("cgu_s6"), t("cgu_s7"), t("cgu_s8"), t("cgu_s9"), t("cgu_s10"),
  ];

  return (
    <LegalShell
      title={t("cgu_title")}
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
