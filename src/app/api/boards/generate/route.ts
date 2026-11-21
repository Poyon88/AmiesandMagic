// Génération d'une illustration de PLATEAU par la forge — admin.
//
// Un plateau s'affiche en plein écran, jusque sur des écrans ultra-larges : il
// est donc généré en 21:9, à la plus haute définition du générateur (« 4K »,
// 6336×2688), puis ramené à une largeur utile et encodé en WebP. L'image
// rendue par le générateur pèse une dizaine de Mo ; la réponse d'une route est
// plafonnée bien en dessous, et aucun écran n'affiche 6336 px de large.
//
// La réponse garde la forme de /api/cards/generate-image (`imageBase64`,
// `mimeType`, `model`) : la forge la traite comme n'importe quelle variation.
// À l'enregistrement, /api/boards reconnaît le format large et en tire
// l'illustration 16:9 (cf. src/lib/boards/wide.ts, `deplierLarge`).
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { generateImage, GenerateImageError } from "@/lib/ai/generate-image";
import { redessiner } from "@/lib/boards/wide";

export const maxDuration = 300;

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { prompt, referenceImageBase64, referenceImageMimeType } = (await request.json().catch(() => ({}))) as {
    prompt?: string;
    referenceImageBase64?: string;
    referenceImageMimeType?: string;
  };

  try {
    const genere = await generateImage({
      prompt: prompt ?? "",
      aspectRatio: "21:9",
      imageSize: "4K",
      referenceImageBase64,
      referenceImageMimeType,
    });
    // `redessiner` ne fait ici que ramener à la largeur utile et encoder en WebP.
    const { image, gabarit } = await redessiner(Buffer.from(genere.imageBase64, "base64"));
    return NextResponse.json({
      imageBase64: image.toString("base64"),
      mimeType: "image/webp",
      model: genere.model,
      largeur: gabarit.largeur,
      hauteur: gabarit.hauteur,
    });
  } catch (err) {
    if (err instanceof GenerateImageError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, { status: 500 });
  }
}
