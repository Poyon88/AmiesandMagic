import { requireAdminPage } from "@/lib/admin/requireAdminPage";
import CountryRulesManager from "@/components/admin/CountryRulesManager";

export const metadata = { title: "Pays — Admin | Armies of Legends" };

export default async function PaysPage() {
  await requireAdminPage();
  return (
    <div style={{ height: "100%", overflow: "auto", background: "#f5f5f5", padding: 16 }}>
      <CountryRulesManager />
    </div>
  );
}
