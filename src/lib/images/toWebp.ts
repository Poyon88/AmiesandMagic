import sharp from "sharp";

/** Convertit une illustration en webp, À LA MÊME RÉSOLUTION, avant son envoi au
 *  stockage. Les générateurs d'images rendent des JPEG d'environ 850 × 1 260
 *  pour 700 à 900 Ko ; en webp qualité 86 ils pèsent environ 6 fois moins sans
 *  perte visible (essai du 2026-11-13 sur dix cartes, comparé pixel à pixel).
 *
 *  Un webp reçu est réencodé lui aussi : rien ne garantit qu'il soit compressé.
 *  En cas d'échec (format illisible), le fichier d'origine passe tel quel —
 *  l'enregistrement d'une carte ne doit jamais échouer pour une conversion. */
export async function toWebp(
  buffer: Buffer,
  mimeType: string,
): Promise<{ buffer: Buffer; mimeType: string; ext: string }> {
  try {
    const out = await sharp(buffer).rotate().webp({ quality: 86, effort: 4 }).toBuffer();
    // Garde-fou : un webp plus lourd que l'original n'apporte rien.
    if (out.length < buffer.length) return { buffer: out, mimeType: "image/webp", ext: "webp" };
  } catch (err) {
    console.warn("[toWebp] conversion impossible, fichier envoyé tel quel :", err);
  }
  return { buffer, mimeType, ext: mimeType.split("/")[1] || "webp" };
}
