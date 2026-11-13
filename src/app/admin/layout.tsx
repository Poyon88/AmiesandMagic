import AdminSidebar from "@/components/admin/AdminSidebar";
import { requireAdminPage } from "@/lib/admin/requireAdminPage";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Sans ce contrôle, toute personne connectée ouvrait /admin/* : le proxy ne
  // vérifie que la session, et aucune page ne regardait le rôle.
  await requireAdminPage();

  return (
    // `am-admin` porte la règle de lisibilité des champs (cf. globals.css) :
    // l'administration est peinte sur fond BLANC, alors que la couleur de texte
    // du site est une teinte parchemin prévue pour les fonds sombres du jeu.
    //
    // iPad / WebKit : `100vh` + `overflow: hidden` sur la racine figeait le
    // défilement tactile de toute l'administration (le geste partait sur un
    // conteneur qui ne défile pas). `100dvh` suit la barre d'adresse mobile, la
    // racine défile en dernier recours, et chaque panneau qui doit défiler
    // porte son propre `overflow: auto` + `-webkit-overflow-scrolling`.
    <div className="am-admin" style={{ display: "flex", height: "100dvh", overflow: "auto", WebkitOverflowScrolling: "touch" }}>
      <AdminSidebar />
      <main style={{ flex: 1, minWidth: 0, overflow: "auto", WebkitOverflowScrolling: "touch" }}>{children}</main>
    </div>
  );
}
