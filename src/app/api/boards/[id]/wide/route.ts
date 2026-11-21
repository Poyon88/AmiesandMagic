// Version ultra-large (21:9) de l'illustration d'un plateau — admin.
//
//   POST    génère un BROUILLON, en demandant au générateur sa plus haute
//           définition. Deux modes (corps `{ mode }`) :
//             « etendre » (défaut) — les côtés sont inventés, le centre est
//               recollé depuis l'original : identique au pixel près, à la
//               définition de l'original ;
//             « redessiner » — tout est repeint en haute définition, centre
//               compris : plus net qu'un petit original, mais plus tout à fait
//               le même dessin.
//           Rien n'est écrit en base : l'admin compare d'abord
//           (cf. src/lib/boards/wide.ts).
//   PUT     { url } : valide un brouillon — il devient l'illustration large du
//           plateau, utilisée en partie.
//   DELETE  retire l'illustration large : le plateau revient à son image 16:9.
//
// L'illustration 16:9 (`image_url`) n'est jamais modifiée.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { generateImage, GenerateImageError } from "@/lib/ai/generate-image";
import { CONSIGNE_EXTENSION, CONSIGNE_REDESSIN, preparerCanevas, recomposer, redessiner } from "@/lib/boards/wide";

export const maxDuration = 300;

const BUCKET = "board-images";
/** Dossier des versions larges d'un plateau : brouillons et version validée. */
const dossier = (id: number) => `wide/board_${id}`;

function identifiant(brut: string): number | null {
  const id = Number(brut);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Chemin Storage d'une URL publique du bucket, si elle est bien une version
 *  large de CE plateau — on n'enregistre pas une adresse arbitraire. */
function cheminDeCePlateau(url: unknown, id: number): string | null {
  if (typeof url !== "string") return null;
  const repere = `/object/public/${BUCKET}/`;
  const i = url.indexOf(repere);
  if (i === -1) return null;
  const chemin = url.slice(i + repere.length).split("?")[0];
  return new RegExp(`^${dossier(id)}/[0-9]+_[a-z0-9]+\\.webp$`).test(chemin) ? chemin : null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const id = identifiant((await params).id);
  if (!id) return NextResponse.json({ error: "identifiant invalide" }, { status: 400 });

  const corps = (await request.json().catch(() => ({}))) as { mode?: unknown };
  const mode = corps.mode === "redessiner" ? "redessiner" : "etendre";

  const { data: board, error } = await auth.supabase.from("game_boards").select("id, image_url").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!board?.image_url) return NextResponse.json({ error: "plateau introuvable" }, { status: 404 });

  try {
    const res = await fetch(board.image_url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`illustration d'origine illisible (${res.status})`);
    const original = Buffer.from(await res.arrayBuffer());

    const { canevas } = await preparerCanevas(original);
    const genere = await generateImage({
      prompt: mode === "redessiner" ? CONSIGNE_REDESSIN : CONSIGNE_EXTENSION,
      aspectRatio: "21:9",
      imageSize: "4K",
      referenceImageBase64: canevas.toString("base64"),
      referenceImageMimeType: "image/jpeg",
    });
    const rendu = Buffer.from(genere.imageBase64, "base64");
    const { image, gabarit } = mode === "redessiner" ? await redessiner(rendu) : await recomposer(original, rendu);

    const chemin = `${dossier(id)}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.webp`;
    const { error: envoi } = await auth.supabase.storage
      .from(BUCKET)
      .upload(chemin, image, { contentType: "image/webp", cacheControl: "31536000" });
    if (envoi) throw new Error(`stockage : ${envoi.message}`);

    const url = auth.supabase.storage.from(BUCKET).getPublicUrl(chemin).data.publicUrl;
    return NextResponse.json({ url, mode, largeur: gabarit.largeur, hauteur: gabarit.hauteur, poids: image.length, modele: genere.model });
  } catch (e) {
    const statut = e instanceof GenerateImageError ? e.status : 500;
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[boards/wide] plateau ${id} :`, message);
    return NextResponse.json({ error: message }, { status: statut });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const id = identifiant((await params).id);
  if (!id) return NextResponse.json({ error: "identifiant invalide" }, { status: 400 });

  const { url } = (await request.json().catch(() => ({}))) as { url?: unknown };
  const chemin = cheminDeCePlateau(url, id);
  if (!chemin) return NextResponse.json({ error: "ce n'est pas un brouillon de ce plateau" }, { status: 400 });

  // Le fichier doit exister : sinon le plateau pointerait dans le vide.
  const [rep, fichier] = [chemin.slice(0, chemin.lastIndexOf("/")), chemin.slice(chemin.lastIndexOf("/") + 1)];
  const { data: presents, error: lecture } = await auth.supabase.storage.from(BUCKET).list(rep, { limit: 200 });
  if (lecture) return NextResponse.json({ error: lecture.message }, { status: 500 });
  if (!presents?.some((f) => f.name === fichier)) {
    return NextResponse.json({ error: "brouillon introuvable dans le stockage" }, { status: 400 });
  }

  const { error } = await auth.supabase.from("game_boards").update({ image_url_wide: url }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Les autres brouillons de ce plateau n'ont plus d'usage : ménage au mieux.
  const autres = presents.filter((f) => f.name !== fichier).map((f) => `${rep}/${f.name}`);
  if (autres.length) await auth.supabase.storage.from(BUCKET).remove(autres);
  return NextResponse.json({ success: true, url });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const id = identifiant((await params).id);
  if (!id) return NextResponse.json({ error: "identifiant invalide" }, { status: 400 });

  const { error } = await auth.supabase.from("game_boards").update({ image_url_wide: null }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Le fichier est laissé en place : on peut vouloir le revalider, et aucune
  // partie ne le lit plus.
  return NextResponse.json({ success: true });
}
