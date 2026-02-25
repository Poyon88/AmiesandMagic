import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import CardImporter from "@/components/admin/CardImporter";

export default async function AdminImportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return <CardImporter />;
}
