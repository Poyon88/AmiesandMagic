import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import FormatManager from "@/components/admin/FormatManager";

export const metadata = { title: "Formats — Admin | Armies & Magic" };

export default async function FormatsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div style={{ height: "100%", overflow: "auto", background: "#f5f5f5" }}>
      <FormatManager />
    </div>
  );
}
