// Textes de la page d'accueil réécrits depuis l'admin. Le français est
// enregistré D'ABORD, puis traduit dans les sept autres langues : un échec de
// traduction ne perd pas la saisie, et réenregistrer complète ce qui manque.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { LONGUEUR_MAX_TEXTE, TEXTES_EDITABLES, estCleEditable } from "@/lib/vitrine/config";
import { traduireTexte } from "@/lib/vitrine/traduire";

// La traduction prend quelques secondes ; on laisse de la marge aux reprises.
export const maxDuration = 60;

// PUT /api/admin/vitrine/textes — body { key, fr } : enregistre puis traduit.
export async function PUT(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { key, fr } = (await request.json()) as { key?: unknown; fr?: unknown };
  if (!estCleEditable(key)) return NextResponse.json({ error: "texte inconnu" }, { status: 400 });
  const texte = typeof fr === "string" ? fr.trim() : "";
  if (!texte) return NextResponse.json({ error: "texte vide : utiliser « Rétablir » pour revenir au texte d'origine" }, { status: 400 });
  if (texte.length > LONGUEUR_MAX_TEXTE) {
    return NextResponse.json({ error: `texte trop long (${LONGUEUR_MAX_TEXTE} caractères au plus)` }, { status: 400 });
  }

  // Les anciennes traductions sont vidées avec le français : elles ne disent
  // plus la même chose, et le visiteur retombe sur le texte par défaut de sa
  // langue le temps que les nouvelles arrivent.
  const { error: ecriture } = await auth.supabase
    .from("vitrine_textes")
    .upsert({ key, fr: texte, translations: {}, updated_at: new Date().toISOString() });
  if (ecriture) return NextResponse.json({ error: ecriture.message }, { status: 500 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ success: true, translations: {}, avertissement: "Français enregistré. Traduction impossible : ANTHROPIC_API_KEY non configurée." });
  }

  const champ = TEXTES_EDITABLES.find((t) => t.key === key)!;
  try {
    const { traductions, manquantes } = await traduireTexte(apiKey, texte, `${champ.groupe} — ${champ.label}`);
    const { error } = await auth.supabase
      .from("vitrine_textes")
      .update({ translations: traductions, updated_at: new Date().toISOString() })
      .eq("key", key)
      // Si le français a été réécrit entre-temps, ces traductions sont
      // périmées : on ne les pose pas sur le nouveau texte.
      .eq("fr", texte);
    if (error) throw new Error(error.message);
    return NextResponse.json({
      success: true,
      translations: traductions,
      avertissement: manquantes.length ? `Français enregistré. Langues non traduites : ${manquantes.join(", ")}. Réenregistrer pour réessayer.` : undefined,
    });
  } catch (err) {
    const raison = err instanceof Error ? err.message : "erreur inconnue";
    return NextResponse.json({ success: true, translations: {}, avertissement: `Français enregistré. Traduction échouée (${raison}). Réenregistrer pour réessayer.` });
  }
}

// DELETE /api/admin/vitrine/textes — body { key } : revient au texte d'origine.
export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { key } = (await request.json()) as { key?: unknown };
  if (!estCleEditable(key)) return NextResponse.json({ error: "texte inconnu" }, { status: 400 });

  const { error } = await auth.supabase.from("vitrine_textes").delete().eq("key", key);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
