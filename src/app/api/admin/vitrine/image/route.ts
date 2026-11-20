// Visuel de la grande tuile « Jouer » du hub (admin). Trois temps, comme pour
// les plateaux : URL signée → envoi direct au Storage par le navigateur (un
// visuel pèse plusieurs Mo, trop pour le corps d'une route) → enregistrement
// du chemin. L'URL est rangée dans `vitrine_textes` sous une clé réservée.
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { BUCKET_IMAGE_JOUER, CHEMIN_IMAGE_JOUER, CLE_IMAGE_JOUER } from "@/lib/vitrine/config";

/** Chemin Storage d'une URL publique du bucket, si c'est bien un visuel « Jouer ». */
function cheminDepuisUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const repere = `/object/public/${BUCKET_IMAGE_JOUER}/`;
  const i = url.indexOf(repere);
  if (i === -1) return null;
  const chemin = url.slice(i + repere.length);
  return CHEMIN_IMAGE_JOUER.test(chemin) ? chemin : null;
}

async function urlEnregistree(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase.from("vitrine_textes").select("fr").eq("key", CLE_IMAGE_JOUER).maybeSingle();
  return data?.fr ?? null;
}

// POST /api/admin/vitrine/image — body { ext } : URL signée pour l'envoi.
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const ext = typeof body?.ext === "string" ? body.ext.toLowerCase().replace(/^\./, "") : "";
  if (!/^(png|jpg|jpeg|webp)$/.test(ext)) {
    return NextResponse.json({ error: "format refusé : PNG, JPEG ou WebP" }, { status: 400 });
  }
  const path = `hub/jouer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { data, error } = await auth.supabase.storage.from(BUCKET_IMAGE_JOUER).createSignedUploadUrl(path);
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "URL d'envoi indisponible" }, { status: 500 });
  }
  return NextResponse.json({ signedUrl: data.signedUrl, path });
}

// PUT /api/admin/vitrine/image — body { path } : le fichier envoyé devient le visuel.
export async function PUT(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { path } = (await request.json()) as { path?: unknown };
  if (typeof path !== "string" || !CHEMIN_IMAGE_JOUER.test(path)) {
    return NextResponse.json({ error: "chemin d'image invalide" }, { status: 400 });
  }

  // Le fichier doit être arrivé : sinon la tuile pointerait dans le vide.
  const [dossier, fichier] = path.split("/");
  const { data: presents, error: lecture } = await auth.supabase.storage
    .from(BUCKET_IMAGE_JOUER)
    .list(dossier, { search: fichier });
  if (lecture) return NextResponse.json({ error: lecture.message }, { status: 500 });
  if (!presents?.some((f) => f.name === fichier)) {
    return NextResponse.json({ error: "image introuvable dans le stockage : renvoie-la" }, { status: 400 });
  }

  const ancienne = await urlEnregistree(auth.supabase);
  const url = auth.supabase.storage.from(BUCKET_IMAGE_JOUER).getPublicUrl(path).data.publicUrl;

  const { error } = await auth.supabase
    .from("vitrine_textes")
    .upsert({ key: CLE_IMAGE_JOUER, fr: url, translations: {}, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Ancien fichier : ménage au mieux, son échec ne change rien à l'affichage.
  const ancienChemin = cheminDepuisUrl(ancienne);
  if (ancienChemin && ancienChemin !== path) {
    await auth.supabase.storage.from(BUCKET_IMAGE_JOUER).remove([ancienChemin]);
  }
  return NextResponse.json({ success: true, url });
}

// DELETE /api/admin/vitrine/image — revient à l'image d'origine.
export async function DELETE() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const ancienne = await urlEnregistree(auth.supabase);
  const { error } = await auth.supabase.from("vitrine_textes").delete().eq("key", CLE_IMAGE_JOUER);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ancienChemin = cheminDepuisUrl(ancienne);
  if (ancienChemin) await auth.supabase.storage.from(BUCKET_IMAGE_JOUER).remove([ancienChemin]);
  return NextResponse.json({ success: true });
}
