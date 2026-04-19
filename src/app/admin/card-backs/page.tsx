import CardBackManager from "@/components/admin/CardBackManager";

export const metadata = { title: "Dos de cartes — Admin | Armies & Magic" };

export default function AdminCardBacksPage() {
  return (
    <div style={{ height: "100%", overflow: "auto", background: "#f5f5f5" }}>
      <CardBackManager />
    </div>
  );
}
