import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import SimulatorPanel from "@/components/admin/simulator/SimulatorPanel";

export const metadata = { title: "Simulateur — Admin | Armies & Magic" };

export default async function AdminSimulatorPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div style={{ height: "100%", overflow: "auto", background: "#0f0f1e" }}>
      <SimulatorPanel />
    </div>
  );
}
