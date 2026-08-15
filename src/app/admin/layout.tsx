import AdminSidebar from "@/components/admin/AdminSidebar";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // `am-admin` porte la règle de lisibilité des champs (cf. globals.css) :
    // l'administration est peinte sur fond BLANC, alors que la couleur de texte
    // du site est une teinte parchemin prévue pour les fonds sombres du jeu.
    <div className="am-admin" style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <AdminSidebar />
      <main style={{ flex: 1, overflow: "auto" }}>{children}</main>
    </div>
  );
}
