// URL signée pour envoyer une capture jointe à un retour. Le navigateur
// envoie ensuite le fichier directement au Storage (bucket PRIVÉ, 5 Mo,
// images seulement — limites posées sur le bucket lui-même), puis cite le
// chemin en créant son message : c'est là qu'il est vérifié et rattaché.
import { NextResponse } from "next/server";
import { getAdminClient, getAuthUser } from "@/lib/admin/requireAdmin";
import { extensionValide, nouveauChemin, quotaOk } from "@/lib/feedback/server";
import { FEEDBACK_BUCKET } from "@/lib/feedback/types";

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const ext = typeof body?.ext === "string" ? body.ext.toLowerCase().replace(/^\./, "") : "";
  if (!extensionValide(ext)) {
    return NextResponse.json({ error: "format refusé", code: "bad_format" }, { status: 400 });
  }

  const supabase = getAdminClient();
  if (!(await quotaOk(supabase, user.id, "feedback_upload"))) {
    return NextResponse.json({ error: "limite atteinte", code: "quota" }, { status: 429 });
  }

  const path = nouveauChemin(user.id, ext);
  const { data, error } = await supabase.storage.from(FEEDBACK_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "envoi indisponible" }, { status: 500 });
  }
  return NextResponse.json({ signedUrl: data.signedUrl, path });
}
